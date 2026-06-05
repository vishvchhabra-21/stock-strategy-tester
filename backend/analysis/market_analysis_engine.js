const { getFundamentalSnapshot, getHistoricalData, getSymbolNews } = require('./data_fetcher');
const { analyzeFundamentals } = require('./fundamental_analysis');
const { explainAnalysis } = require('./ai_explainer');
const { analyzeMlPrediction } = require('./ml_models');
const { analyzeNewsSentiment } = require('./news_sentiment');
const { generateSignal } = require('./signal_generator');
const { analyzeTechnicals } = require('./technical_indicators');

function pickBenchmarkSymbol(symbol) {
  const normalized = String(symbol || '').toUpperCase();
  if (normalized.endsWith('.NS')) return '^NSEI';
  if (normalized.endsWith('.BO')) return '^BSESN';
  return '^GSPC';
}

function percentReturn(rows, lookback = 20) {
  if (!Array.isArray(rows) || rows.length <= lookback) return null;
  const latest = Number(rows[rows.length - 1]?.close);
  const past = Number(rows[rows.length - 1 - lookback]?.close);
  if (!Number.isFinite(latest) || !Number.isFinite(past) || past === 0) return null;
  return ((latest - past) / past) * 100;
}

async function analyzeMarket(symbol, data) {
  const benchmarkSymbol = pickBenchmarkSymbol(symbol);
  const [fundamentalSnapshot, news, benchmarkData] = await Promise.all([
    getFundamentalSnapshot(symbol),
    getSymbolNews(symbol).catch(() => []),
    getHistoricalData(benchmarkSymbol, '1y').catch(() => [])
  ]);
  const benchmark20d = percentReturn(benchmarkData, 20);
  const benchmark60d = percentReturn(benchmarkData, 60);
  const stock20d = percentReturn(data, 20);
  const stock60d = percentReturn(data, 60);
  const enrichedFundamentalSnapshot = {
    ...fundamentalSnapshot,
    benchmark: {
      symbol: benchmarkSymbol,
      return20d: benchmark20d,
      return60d: benchmark60d,
      relativeStrength20d: Number.isFinite(stock20d) && Number.isFinite(benchmark20d) ? stock20d - benchmark20d : null,
      relativeStrength60d: Number.isFinite(stock60d) && Number.isFinite(benchmark60d) ? stock60d - benchmark60d : null
    }
  };
  const technical = analyzeTechnicals(data);
  const fundamental = analyzeFundamentals(enrichedFundamentalSnapshot);
  const [ml, sentiment] = await Promise.all([
    analyzeMlPrediction(data),
    analyzeNewsSentiment(news)
  ]);
  const signal = generateSignal({ data, technical, fundamental, ml, sentiment });
  const explanation = explainAnalysis({ symbol, signal, technical, fundamental, ml, sentiment });

  return {
    symbol,
    rankingScore: {
      total: signal.combinedScore,
      technical: technical.score,
      fundamental: fundamental.score,
      ml: ml.score,
      sentiment: sentiment.score,
      weights: {
        technical: 40,
        fundamental: 30,
        ml: 20,
        sentiment: 10
      }
    },
    signal,
    technical,
    fundamental,
    ml,
    sentiment,
    explanation
  };
}

module.exports = {
  analyzeMarket
};
