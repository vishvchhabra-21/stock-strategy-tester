const { round } = require('../utils/statistics');

function scoreRange(value, goodMin, goodMax, weakBelow, weakAbove) {
  if (!Number.isFinite(value)) return 0;
  if (value >= goodMin && value <= goodMax) return 10;
  if ((Number.isFinite(weakBelow) && value < weakBelow) || (Number.isFinite(weakAbove) && value > weakAbove)) return -6;
  return 4;
}

function analyzeFundamentals(snapshot = {}) {
  if (snapshot.unavailable) {
    return {
      score: 50,
      direction: 'NEUTRAL',
      confirmations: [],
      warnings: [snapshot.message || 'Fundamental data is unavailable.'],
      metrics: snapshot
    };
  }

  const confirmations = [];
  const warnings = [];
  let score = 50;

  const peScore = scoreRange(snapshot.peRatio, 8, 35, 0, 70);
  score += peScore;
  if (peScore > 0) confirmations.push('Valuation is within a reasonable PE range.');
  if (peScore < 0) warnings.push('PE valuation looks stretched or unusable.');

  if (Number.isFinite(snapshot.revenueGrowth)) {
    if (snapshot.revenueGrowth > 0.08) {
      score += 8;
      confirmations.push('Revenue growth is positive.');
    } else if (snapshot.revenueGrowth < 0) {
      score -= 8;
      warnings.push('Revenue growth is negative.');
    }
  }

  if (Number.isFinite(snapshot.profitGrowth)) {
    if (snapshot.profitGrowth > 0.08) {
      score += 8;
      confirmations.push('Profit growth is positive.');
    } else if (snapshot.profitGrowth < 0) {
      score -= 8;
      warnings.push('Profit growth is negative.');
    }
  }

  if (Number.isFinite(snapshot.debtToEquity)) {
    if (snapshot.debtToEquity <= 80) {
      score += 5;
      confirmations.push('Debt-to-equity is controlled.');
    } else if (snapshot.debtToEquity > 180) {
      score -= 8;
      warnings.push('Debt-to-equity is high.');
    }
  }

  if (Number.isFinite(snapshot.roe)) {
    if (snapshot.roe >= 0.12) {
      score += 7;
      confirmations.push('ROE is healthy.');
    } else if (snapshot.roe < 0.04) {
      score -= 6;
      warnings.push('ROE is weak.');
    }
  }

  const relative20d = snapshot.benchmark?.relativeStrength20d;
  if (Number.isFinite(relative20d)) {
    if (relative20d >= 2) {
      score += 4;
      confirmations.push(`Price strength beats ${snapshot.benchmark.symbol} over ~1 month.`);
    } else if (relative20d <= -2) {
      score -= 4;
      warnings.push(`Price strength lags ${snapshot.benchmark.symbol} over ~1 month.`);
    }
  }

  const relative60d = snapshot.benchmark?.relativeStrength60d;
  if (Number.isFinite(relative60d)) {
    if (relative60d >= 4) {
      score += 5;
      confirmations.push(`Price strength beats ${snapshot.benchmark.symbol} over ~3 months.`);
    } else if (relative60d <= -4) {
      score -= 5;
      warnings.push(`Price strength lags ${snapshot.benchmark.symbol} over ~3 months.`);
    }
  }

  const normalized = Math.min(100, Math.max(0, round(score, 0)));

  return {
    score: normalized,
    direction: normalized >= 60 ? 'BULLISH' : normalized <= 40 ? 'BEARISH' : 'NEUTRAL',
    confirmations,
    warnings,
    metrics: {
      ...snapshot,
      peRatio: round(snapshot.peRatio),
      eps: round(snapshot.eps),
      revenueGrowth: Number.isFinite(snapshot.revenueGrowth) ? round(snapshot.revenueGrowth * 100) : null,
      profitGrowth: Number.isFinite(snapshot.profitGrowth) ? round(snapshot.profitGrowth * 100) : null,
      debtToEquity: round(snapshot.debtToEquity),
      roe: Number.isFinite(snapshot.roe) ? round(snapshot.roe * 100) : null,
      promoterHolding: Number.isFinite(snapshot.promoterHolding) ? round(snapshot.promoterHolding * 100) : null
    }
  };
}

module.exports = {
  analyzeFundamentals
};
