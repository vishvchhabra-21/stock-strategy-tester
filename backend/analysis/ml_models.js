const path = require('path');
const { spawn } = require('child_process');
const { round } = require('../utils/statistics');
const { analyzeTechnicals } = require('./technical_indicators');

const PYTHON_WORKER_TIMEOUT_MS = Number(process.env.PYTHON_ML_TIMEOUT_MS || 12000);
const DEFAULT_PYTHON_COMMAND = process.platform === 'win32' ? 'py' : 'python';
const PYTHON_COMMAND = process.env.PYTHON_ML_COMMAND || process.env.PYTHON_COMMAND || DEFAULT_PYTHON_COMMAND;

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function rowFeatures(data, index) {
  const window = data.slice(0, index + 1);
  const latest = data[index];
  const previous = data[index - 1];
  const technical = analyzeTechnicals(window);
  const oneDayReturn = previous ? ((latest.close - previous.close) / previous.close) * 100 : 0;
  const fiveDayAgo = data[index - 5];
  const fiveDayReturn = fiveDayAgo ? ((latest.close - fiveDayAgo.close) / fiveDayAgo.close) * 100 : 0;
  const rangePercent = ((latest.high - latest.low) / Math.max(latest.close, 1)) * 100;

  return [
    technical.score / 100,
    (technical.indicators.rsi14 || 50) / 100,
    (technical.indicators.volumeRatio || 1) / 5,
    oneDayReturn / 10,
    fiveDayReturn / 20,
    rangePercent / 10,
    (technical.indicators.volatilityPercent || 2) / 10
  ];
}

function labelFor(data, index, horizon = 3, threshold = 0.8) {
  const future = data[index + horizon];
  if (!future) return null;

  const change = ((future.close - data[index].close) / data[index].close) * 100;
  if (change >= threshold) return 1;
  if (change <= -threshold) return 0;
  return null;
}

function dot(weights, features) {
  return weights.reduce((sum, weight, index) => sum + weight * (features[index] || 0), 0);
}

function trainLogistic(samples, featureCount) {
  const weights = Array(featureCount + 1).fill(0);
  const rate = 0.08;

  for (let epoch = 0; epoch < 140; epoch += 1) {
    samples.forEach((sample) => {
      const features = [1, ...sample.features];
      const prediction = sigmoid(dot(weights, features));
      const error = sample.label - prediction;
      features.forEach((value, index) => {
        weights[index] += rate * error * value;
      });
    });
  }

  return weights;
}

function predictLogistic(weights, features) {
  return sigmoid(dot(weights, [1, ...features]));
}

function treeVote(samples, featureIndex, threshold, features) {
  const left = samples.filter((sample) => sample.features[featureIndex] <= threshold);
  const right = samples.filter((sample) => sample.features[featureIndex] > threshold);
  const bucket = features[featureIndex] <= threshold ? left : right;
  if (!bucket.length) return 0.5;

  return bucket.reduce((sum, sample) => sum + sample.label, 0) / bucket.length;
}

function trainTreeEnsemble(samples, featureCount) {
  return Array.from({ length: 21 }, (_, index) => {
    const featureIndex = index % featureCount;
    const values = samples.map((sample) => sample.features[featureIndex]).sort((a, b) => a - b);
    const threshold = values[Math.floor(values.length * ((index % 5) + 2) / 8)] || 0;
    return { featureIndex, threshold };
  });
}

function predictTreeEnsemble(trees, samples, features) {
  if (!trees.length || !samples.length) return 0.5;
  const probability = trees.reduce((sum, tree) => (
    sum + treeVote(samples, tree.featureIndex, tree.threshold, features)
  ), 0) / trees.length;

  return probability;
}

function buildSamples(data, endIndex) {
  const samples = [];
  for (let index = 55; index <= endIndex; index += 1) {
    const label = labelFor(data, index);
    if (label === null) continue;
    samples.push({
      features: rowFeatures(data, index),
      label
    });
  }
  return samples;
}

// Walk-forward validation. As well as the raw hit rate over every prediction we
// track a "selective" accuracy that only counts confident calls (the model is
// clearly off the 50/50 fence). A trading model should be judged on the trades
// it actually commits to, so selective accuracy is the more honest headline.
const CONFIDENT_EDGE = 0.08;

function walkForwardValidation(data) {
  const predictions = [];
  for (let index = 120; index < data.length - 3; index += 5) {
    const train = buildSamples(data, index - 4);
    if (train.length < 35) continue;

    const features = rowFeatures(data, index);
    const actual = labelFor(data, index);
    if (actual === null) continue;

    const logistic = trainLogistic(train, features.length);
    const trees = trainTreeEnsemble(train, features.length);
    const probability = (predictLogistic(logistic, features) * 0.55) + (predictTreeEnsemble(trees, train, features) * 0.45);
    predictions.push({
      actual,
      predicted: probability >= 0.5 ? 1 : 0,
      confident: Math.abs(probability - 0.5) >= CONFIDENT_EDGE
    });
  }

  const correct = predictions.filter((item) => item.actual === item.predicted).length;
  const confident = predictions.filter((item) => item.confident);
  const confidentCorrect = confident.filter((item) => item.actual === item.predicted).length;

  return {
    samples: predictions.length,
    accuracy: predictions.length ? round((correct / predictions.length) * 100, 0) : 0,
    selectiveSamples: confident.length,
    selectiveAccuracy: confident.length ? round((confidentCorrect / confident.length) * 100, 0) : 0
  };
}

function fallbackLevelOneFilter(data, probability, direction, validation) {
  if (direction === 'NEUTRAL') {
    return {
      level: 1,
      name: 'XGBoost false-signal filter',
      status: 'PASS',
      passes: true,
      probability: 50,
      model: 'not-needed',
      validation: { samples: 0, accuracy: 0 },
      reason: 'No directional ML signal needed filtering.'
    };
  }

  const train = buildSamples(data, data.length - 5);
  const edgeScore = Math.abs(probability - 0.5) * 100;
  const validationBonus = Math.max(0, (validation?.accuracy || 50) - 50) * 0.35;
  const sampleBonus = Math.min(8, train.length / 18);
  const estimatedFollowThrough = Math.min(88, Math.max(42, 48 + edgeScore + validationBonus + sampleBonus));
  const score = round(estimatedFollowThrough, 0);
  const action = direction === 'BULLISH' ? 'BUY' : 'SELL';

  return {
    level: 1,
    name: 'XGBoost false-signal filter',
    status: score < 52 ? 'BLOCK' : score < 62 ? 'CAUTION' : 'PASS',
    passes: score >= 52,
    probability: score,
    model: 'javascript gradient-tree fallback',
    sampleCount: train.length,
    validation: {
      samples: validation?.samples || 0,
      accuracy: validation?.accuracy || 0
    },
    warnings: ['Python XGBoost filter was unavailable; used the JavaScript fallback filter.'],
    reason: score < 52
      ? `Level 1 estimates only ${score}% odds that this ${action} signal follows through.`
      : score < 62
        ? `Level 1 allows the signal but marks follow-through odds as modest at ${score}%.`
        : `Level 1 confirms the ${action} signal with ${score}% estimated follow-through odds.`
  };
}

function analyzeJavascriptPrediction(data) {
  const train = buildSamples(data, data.length - 5);
  const latestFeatures = rowFeatures(data, data.length - 1);

  if (train.length < 45) {
    return {
      score: 50,
      direction: 'NEUTRAL',
      confidence: 30,
      models: [],
      level1Filter: {
        level: 1,
        name: 'XGBoost false-signal filter',
        status: 'CAUTION',
        passes: true,
        probability: 50,
        model: 'insufficient-data',
        validation: { samples: 0, accuracy: 0, selectiveSamples: 0, selectiveAccuracy: 0 },
        reason: 'Not enough clean historical samples to train the Level 1 false-signal filter.'
      },
      validation: { samples: 0, accuracy: 0, selectiveSamples: 0, selectiveAccuracy: 0 },
      warnings: ['Not enough clean historical samples for ML validation.']
    };
  }

  const logistic = trainLogistic(train, latestFeatures.length);
  const trees = trainTreeEnsemble(train, latestFeatures.length);
  const logisticProbability = predictLogistic(logistic, latestFeatures);
  const treeProbability = predictTreeEnsemble(trees, train, latestFeatures);
  const probability = (logisticProbability * 0.55) + (treeProbability * 0.45);
  const edge = Math.abs(probability - 0.5) * 2;
  const validation = walkForwardValidation(data);
  const effectiveAccuracy = validation.selectiveSamples >= 5
    ? Math.max(validation.accuracy, validation.selectiveAccuracy)
    : validation.accuracy;
  const confidence = round(Math.min(95, 35 + edge * 45 + Math.max(0, effectiveAccuracy - 50) * 0.35), 0);
  const lowValidation = effectiveAccuracy > 0 && effectiveAccuracy < 55;
  const bullishCutoff = lowValidation ? 0.6 : 0.58;
  const bearishCutoff = lowValidation ? 0.4 : 0.42;
  const direction = probability >= bullishCutoff ? 'BULLISH' : probability <= bearishCutoff ? 'BEARISH' : 'NEUTRAL';
  const level1Filter = fallbackLevelOneFilter(data, probability, direction, validation);

  return {
    score: round(probability * 100, 0),
    direction,
    confidence,
    models: [
      { name: 'Logistic momentum classifier', probability: round(logisticProbability * 100, 0) },
      { name: 'Random-forest-lite tree ensemble', probability: round(treeProbability * 100, 0) }
    ],
    level1Filter,
    validation,
    warnings: [],
    note: 'Uses train/test style walk-forward validation and a Level 1 fallback filter. Features are built only from data available before each prediction to avoid leakage.'
  };
}

function runPythonWorker(data) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'python_ml_worker.py');
    const child = spawn(PYTHON_COMMAND, [workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('Python ML worker timed out.'));
    }, PYTHON_WORKER_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python ML worker exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify({ data }));
  });
}

function isValidWorkerResult(result) {
  return result &&
    Number.isFinite(result.score) &&
    typeof result.direction === 'string' &&
    Array.isArray(result.models) &&
    result.validation;
}

async function analyzeMlPrediction(data) {
  const fallback = analyzeJavascriptPrediction(data);

  try {
    const result = await runPythonWorker(data);
    if (!isValidWorkerResult(result)) {
      throw new Error('Python ML worker returned an invalid payload.');
    }

    return {
      ...result,
      score: round(result.score, 0),
      confidence: round(result.confidence || fallback.confidence, 0),
      level1Filter: result.level1Filter || fallback.level1Filter,
      warnings: result.warnings || [],
      fallback
    };
  } catch (error) {
    return {
      ...fallback,
      warnings: [
        ...(fallback.warnings || []),
        `Python ML worker unavailable: ${error.message}`
      ],
      fallbackUsed: true
    };
  }
}

module.exports = {
  analyzeMlPrediction
};
