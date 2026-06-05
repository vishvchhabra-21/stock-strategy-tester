const { getHistoricalData, getIntradayData, getListedStocks, getMostTradedLastWeek } = require('../services/marketDataService');
const { runAllStrategies } = require('./strategyEngine');
const { analyzeStrategies, intradayPrediction } = require('./multiStrategyAnalysis');
const { analyzeMarket } = require('../analysis/market_analysis_engine');
const { rankScreenerResults } = require('../analysis/screener_module');
const { round } = require('../utils/statistics');

const SCAN_CACHE_MS = 8 * 60 * 1000;
const SCAN_CONCURRENCY = 5;
const scanCache = new Map();

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function marketSession(date = new Date()) {
  const parts = istParts(date);
  const weekday = parts.weekday;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const isWeekday = !['Sat', 'Sun'].includes(weekday);
  const open = 9 * 60 + 15;
  const close = 15 * 60 + 30;
  const isOpen = isWeekday && minutes >= open && minutes <= close;

  return {
    isOpen,
    mode: isOpen ? 'LIVE_INTRADAY' : 'TOMORROW_WATCHLIST',
    label: isOpen ? 'Live intraday candidates' : 'Tomorrow intraday watchlist',
    generatedFor: isOpen ? 'now' : 'next trading session',
    marketTimeIst: `${parts.hour}:${parts.minute} IST`
  };
}

function rewardScore(riskPlan) {
  return Number(riskPlan?.rewardRatio || 0) * 5;
}

function normalizeLimit(value, fallback, min, max) {
  return Math.min(Math.max(Number(value) || fallback, min), max);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const mapped = await mapper(items[index], index);
      if (mapped) {
        output.push(mapped);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return output;
}

async function buildUniverse(exchange, scanLimit) {
  const [listedStocks, mostTraded] = await Promise.all([
    getListedStocks(exchange),
    getMostTradedLastWeek(Math.min(Math.max(scanLimit, 80), 80)).catch(() => [])
  ]);
  const listedBySymbol = new Map(listedStocks.map((stock) => [stock.symbol.toUpperCase(), stock]));
  const prioritized = [];
  const seen = new Set();

  mostTraded.forEach((stock) => {
    if ((exchange === 'NSE' || exchange === 'ALL') && listedBySymbol.has(stock.symbol.toUpperCase())) {
      seen.add(stock.symbol.toUpperCase());
      prioritized.push({
        ...listedBySymbol.get(stock.symbol.toUpperCase()),
        ...stock,
        priority: 'high-volume'
      });
    }
  });

  listedStocks.forEach((stock) => {
    const key = stock.symbol.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      prioritized.push({
        ...stock,
        priority: 'listed'
      });
    }
  });

  return {
    totalUniverse: listedStocks.length,
    scannedUniverse: prioritized.slice(0, scanLimit)
  };
}

async function scanStock(stock, session) {
  try {
    const historicalData = await getHistoricalData(stock.symbol, '6mo');
    const strategyResults = runAllStrategies(historicalData);
    const analysis = analyzeStrategies(historicalData, strategyResults, { period: '6mo' });
    const aiAnalysis = await analyzeMarket(stock.symbol, historicalData);
    const latest = historicalData[historicalData.length - 1];
    const intraday = session.isOpen
      ? intradayPrediction(await getIntradayData(stock.symbol).catch(() => []), { includeValidation: false })
      : null;
    const action = session.isOpen ? intraday?.decision : aiAnalysis.signal.action;

    if (!['BUY', 'SELL'].includes(action)) {
      return null;
    }

    const confidence = session.isOpen ? intraday.confidence : aiAnalysis.signal.confidence;
    const riskPlan = session.isOpen ? intraday.riskPlan : aiAnalysis.signal.tradePlan;
    const score = round(confidence + rewardScore(riskPlan) + aiAnalysis.signal.combinedScore * 0.35 + Math.min(Math.abs(latest.volume || 0) / 1000000, 10), 0);

    return {
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      action,
      confidence,
      score,
      latestClose: latest.close,
      latestDate: latest.date,
      entry: riskPlan?.entry ?? null,
      stopLoss: riskPlan?.stopLoss ?? null,
      target: riskPlan?.target3 ?? riskPlan?.target ?? null,
      target1: riskPlan?.target1 ?? null,
      target2: riskPlan?.target2 ?? null,
      target3: riskPlan?.target3 ?? riskPlan?.target ?? null,
      riskReward: riskPlan?.riskReward ?? null,
      note: riskPlan?.note || riskPlan?.positionSizing?.warning || '',
      reason: session.isOpen
        ? intraday.explanation
        : aiAnalysis.explanation.whySignal,
      bestStrategy: analysis.recommendedStrategy?.strategyName || analysis.bestStrategy?.strategyName || '-',
      aiAnalysis,
      marketMode: session.mode,
      priority: stock.priority
    };
  } catch (_error) {
    return null;
  }
}

async function scanIntradayStocks(options = {}) {
  const exchange = ['NSE', 'BSE', 'ALL'].includes(String(options.exchange || 'ALL').toUpperCase())
    ? String(options.exchange || 'ALL').toUpperCase()
    : 'ALL';
  const scanLimit = normalizeLimit(options.scanLimit, 80, 20, 500);
  const resultLimit = normalizeLimit(options.limit, 20, 5, 50);
  const cacheKey = `${exchange}:${scanLimit}:${resultLimit}`;
  const cached = scanCache.get(cacheKey);

  if (cached && Date.now() - cached.loadedAt < SCAN_CACHE_MS) {
    return cached.result;
  }

  const session = marketSession();
  const { totalUniverse, scannedUniverse } = await buildUniverse(exchange, scanLimit);
  const candidates = await mapWithConcurrency(
    scannedUniverse,
    SCAN_CONCURRENCY,
    (stock) => scanStock(stock, session)
  );

  const ranked = rankScreenerResults(candidates)
    .slice(0, resultLimit);
  const result = {
    ...session,
    exchange,
    totalUniverse,
    scannedCount: scannedUniverse.length,
    resultCount: ranked.length,
    candidates: ranked
  };

  scanCache.set(cacheKey, {
    loadedAt: Date.now(),
    result
  });

  return result;
}

module.exports = {
  scanIntradayStocks
};
