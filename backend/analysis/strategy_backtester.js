const { buildSummary, round } = require('../utils/statistics');

function enrichBacktestMetrics(signals = []) {
  const summary = buildSummary(signals);
  const returns = signals
    .map((signal) => signal.futureReturns?.return5d)
    .filter(Number.isFinite);
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const avg = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) / returns.length
    : 0;
  const sharpe = variance ? avg / Math.sqrt(variance) : 0;

  return {
    ...summary,
    profitFactor: grossLoss ? round(grossProfit / grossLoss) : grossProfit ? round(grossProfit) : 0,
    sharpeRatio: round(sharpe),
    tradeCount: returns.length
  };
}

module.exports = {
  enrichBacktestMetrics
};
