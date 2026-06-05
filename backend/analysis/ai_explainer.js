function first(items, fallback) {
  return items?.length ? items[0] : fallback;
}

function explainAnalysis({ symbol, signal, technical, fundamental, ml, sentiment }) {
  const levelOne = ml.level1Filter;
  const levelOnePhrase = levelOne?.status === 'BLOCK'
    ? ` Level 1 blocked the directional signal: ${levelOne.reason}`
    : levelOne?.reason
      ? ` Level 1 filter: ${levelOne.reason}`
      : '';
  const sentimentModel = sentiment.model || 'news sentiment';
  const suitability = signal.action !== 'BUY' && signal.action !== 'SELL'
    ? 'waitlist only'
    : technical.indicators?.volatilityPercent >= 4
      ? 'intraday or short swing with strict risk control'
      : 'swing or positional watchlist';

  return {
    summary: `${symbol} is rated ${signal.action} with ${signal.confidence}% confidence and a combined score of ${signal.combinedScore}/100.`,
    whySelected: first(technical.confirmations, 'The stock has enough data for strategy, technical, and ML analysis.'),
    whySignal: signal.action === 'BUY'
      ? `Buy is suggested because the weighted technical, fundamental, ML, and FinBERT context scores lean bullish.${levelOnePhrase}`
      : signal.action === 'SELL'
        ? `Sell is suggested because the weighted scores lean bearish or risk signals dominate.${levelOnePhrase}`
        : `No clear signal because confirmations are mixed, not strong enough for a clean trade, or the Level 1 false-signal filter rejected the setup.${levelOnePhrase}`,
    indicatorSupport: [
      `Technical score: ${technical.score}/100 (${technical.direction})`,
      `Fundamental score: ${fundamental.score}/100 (${fundamental.direction})`,
      `ML score: ${ml.score}/100 (${ml.direction}, ${ml.confidence}% confidence)`,
      `Level 1 filter: ${levelOne?.status || 'UNKNOWN'} (${levelOne?.probability || 0}% follow-through odds)`,
      `Level 3 FinBERT context: ${sentiment.score}/100 (${sentiment.direction}, ${sentimentModel})`
    ],
    risks: signal.risks?.length ? signal.risks : ['Market gap risk, news risk, and false breakout risk remain.'],
    suitability,
    disclaimer: 'This is not financial advice. Use at your own risk.'
  };
}

module.exports = {
  explainAnalysis
};
