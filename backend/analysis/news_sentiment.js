const path = require('path');
const { spawn } = require('child_process');

const POSITIVE = ['upgrade', 'beats', 'growth', 'profit', 'surge', 'rally', 'order', 'expansion', 'record', 'strong', 'buy'];
const NEGATIVE = ['downgrade', 'loss', 'fraud', 'probe', 'fall', 'decline', 'weak', 'sell', 'default', 'debt', 'fire', 'resigns'];
const FINBERT_TIMEOUT_MS = Number(process.env.FINBERT_TIMEOUT_MS || 15000);
const DEFAULT_PYTHON_COMMAND = process.platform === 'win32' ? 'py' : 'python';
const PYTHON_COMMAND = process.env.PYTHON_ML_COMMAND || process.env.PYTHON_COMMAND || DEFAULT_PYTHON_COMMAND;

function analyzeLexiconSentiment(news = []) {
  let score = 50;
  const flags = [];
  const headlines = news.slice(0, 5);

  news.forEach((item) => {
    const title = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
    const positiveHits = POSITIVE.filter((word) => title.includes(word)).length;
    const negativeHits = NEGATIVE.filter((word) => title.includes(word)).length;

    score += positiveHits * 4;
    score -= negativeHits * 6;

    if (negativeHits) {
      flags.push(`Negative news flag: ${item.title}`);
    }
  });

  const normalized = Math.min(100, Math.max(0, Math.round(score)));

  return {
    score: normalized,
    direction: normalized >= 58 ? 'BULLISH' : normalized <= 42 ? 'BEARISH' : 'NEUTRAL',
    flags: flags.slice(0, 3),
    headlines,
    model: 'finance-lexicon-fallback',
    level: 3,
    contextScore: normalized,
    usedFallback: true,
    warnings: news.length ? ['FinBERT worker unavailable; used finance keyword fallback.'] : ['No recent news was available for sentiment context.']
  };
}

function runFinbertWorker(news) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'finbert_sentiment_worker.py');
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
      reject(new Error('FinBERT worker timed out.'));
    }, FINBERT_TIMEOUT_MS);

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
        reject(new Error(stderr.trim() || `FinBERT worker exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify({ news }));
  });
}

function isValidSentimentResult(result) {
  return result &&
    Number.isFinite(result.score) &&
    typeof result.direction === 'string' &&
    Array.isArray(result.headlines);
}

async function analyzeNewsSentiment(news = []) {
  const fallback = analyzeLexiconSentiment(news);

  if (!news.length || process.env.FINBERT_DISABLED === '1') {
    return fallback;
  }

  try {
    const result = await runFinbertWorker(news.slice(0, 8));
    if (!isValidSentimentResult(result)) {
      throw new Error('FinBERT worker returned an invalid payload.');
    }

    return {
      ...fallback,
      ...result,
      score: Math.round(Math.min(100, Math.max(0, result.score))),
      contextScore: Math.round(Math.min(100, Math.max(0, result.contextScore ?? result.score))),
      level: 3,
      usedFallback: false,
      fallback
    };
  } catch (error) {
    return {
      ...fallback,
      warnings: [
        ...(fallback.warnings || []),
        `FinBERT worker unavailable: ${error.message}`
      ]
    };
  }
}

module.exports = {
  analyzeNewsSentiment
};
