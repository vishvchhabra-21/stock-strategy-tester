const { latestAtr } = require('../strategies/technicalIndicators');
const { round } = require('../utils/statistics');

function actionFromScores({ technical, fundamental, ml, sentiment }) {
  const weighted =
    technical.score * 0.4 +
    fundamental.score * 0.3 +
    ml.score * 0.2 +
    sentiment.score * 0.1;
  const negativeNews = sentiment.flags?.length > 0;
  const levelOneBlocked = ml.level1Filter?.passes === false;

  if (levelOneBlocked) return 'HOLD';
  if (weighted >= 60 && ml.direction !== 'BEARISH' && !negativeNews) return 'BUY';
  if (weighted <= 40 && ml.direction !== 'BULLISH') return 'SELL';
  return 'HOLD';
}

function rewardRatio(confidence, score) {
  if (confidence >= 80 && score >= 72) return 3;
  if (confidence >= 68 && score >= 62) return 2.5;
  return 2;
}

function buildTradePlan(data, action, confidence, score, riskPercent = 1) {
  const latest = data[data.length - 1];
  const entry = latest?.close;
  const atr = latestAtr(data, 14) || entry * 0.03;

  if (!latest || action === 'HOLD') {
    return {
      entry: Number.isFinite(entry) ? round(entry) : null,
      stopLoss: null,
      targets: [],
      riskReward: null,
      positionSizing: {
        riskPercent,
        warning: 'No position size because there is no active trade setup.'
      }
    };
  }

  const stopDistance = atr * 1.4;
  const ratio = rewardRatio(confidence, score);
  const isBuy = action === 'BUY';
  const stopLoss = isBuy ? entry - stopDistance : entry + stopDistance;
  const targets = [1, Math.min(2, ratio), ratio].map((multiple) => (
    isBuy ? entry + stopDistance * multiple : entry - stopDistance * multiple
  ));

  return {
    entry: round(entry),
    stopLoss: round(stopLoss),
    targets: targets.map((target) => round(target)),
    target1: round(targets[0]),
    target2: round(targets[1]),
    target3: round(targets[2]),
    riskReward: `1:${Number.isInteger(ratio) ? ratio : ratio.toFixed(1)}`,
    atr14: round(atr),
    positionSizing: {
      riskPercent,
      riskPerShare: round(Math.abs(entry - stopLoss)),
      formula: 'Quantity = account risk amount / risk per share',
      warning: 'Keep max loss within your configured risk per trade.'
    }
  };
}

function generateSignal({ data, technical, fundamental, ml, sentiment }) {
  const score =
    technical.score * 0.4 +
    fundamental.score * 0.3 +
    ml.score * 0.2 +
    sentiment.score * 0.1;
  const candidateAction = actionFromScores({ technical, fundamental, ml, sentiment });
  const levelOneBlocked = ml.level1Filter?.passes === false;
  const agreement = [technical.direction, fundamental.direction, ml.direction, sentiment.direction]
    .filter((direction) => (
      (candidateAction === 'BUY' && direction === 'BULLISH') ||
      (candidateAction === 'SELL' && direction === 'BEARISH')
    )).length;
  const edge = Math.abs(score - 50);
  const level1Probability = ml.level1Filter?.probability || 50;
  const validationAccuracy = ml.validation?.selectiveAccuracy || ml.validation?.accuracy || 0;

  let action = candidateAction;
  if (candidateAction === 'HOLD') {
    action = 'NO_CLEAR_SIGNAL';
  } else if (
    agreement < 2 ||
    edge < 10 ||
    (validationAccuracy > 0 && validationAccuracy < 53) ||
    (ml.level1Filter?.status === 'CAUTION' && level1Probability < 60)
  ) {
    action = 'NO_CLEAR_SIGNAL';
  }

  const confidence = action === 'NO_CLEAR_SIGNAL'
    ? Math.min(72, Math.round(edge * 2 + agreement * 4 + 22))
    : Math.min(95, Math.round(score * 0.65 + agreement * 8));

  return {
    action,
    combinedScore: round(score, 0),
    confidence,
    tradePlan: buildTradePlan(data, action === 'NO_CLEAR_SIGNAL' ? 'HOLD' : action, confidence, score),
    confirmations: {
      technical: technical.confirmations,
      fundamental: fundamental.confirmations,
      ml: ml.models || [],
      level1Filter: ml.level1Filter || null,
      sentiment: sentiment.flags || []
    },
    risks: [
      levelOneBlocked ? ml.level1Filter.reason : null,
      action === 'NO_CLEAR_SIGNAL' ? 'No clear signal: confirmations are mixed or the edge is not strong enough.' : null,
      ...technical.warnings,
      ...fundamental.warnings,
      ...(ml.warnings || []),
      ...(sentiment.warnings || []),
      ...(sentiment.flags || [])
    ].filter(Boolean).slice(0, 8),
    levels: {
      level1: ml.level1Filter || null,
      level3: {
        score: sentiment.contextScore ?? sentiment.score,
        direction: sentiment.direction,
        model: sentiment.model,
        headlines: sentiment.headlines || [],
        warnings: sentiment.warnings || []
      }
    }
  };
}

module.exports = {
  generateSignal
};
