const express = require('express');
const { getHistoricalData, getIntradayData, getMostTradedLastWeek, searchSymbols } = require('../services/marketDataService');
const { createCustomStrategy, readCustomStrategies } = require('../strategies/customStrategyStore');
const { runAllStrategies, runStrategyByName, listStrategies } = require('../strategies/strategyEngine');
const { analyzeStrategies, dailyTrendBias, intradayPrediction } = require('../strategies/multiStrategyAnalysis');
const { scanIntradayStocks } = require('../strategies/intradayScanner');
const { analyzeMarket } = require('../analysis/market_analysis_engine');

const router = express.Router();

router.get('/stocks/search', async (req, res, next) => {
  try {
    const query = String(req.query.query || '').trim();
    if (query.length < 1) {
      return res.json({ results: [] });
    }

    const results = await searchSymbols(query);
    return res.json({ results });
  } catch (error) {
    return next(error);
  }
});

router.get('/stocks/most-traded', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const results = await getMostTradedLastWeek(limit);
    return res.json({ results });
  } catch (error) {
    return next(error);
  }
});

router.get('/stocks/intraday-scan', async (req, res, next) => {
  try {
    const result = await scanIntradayStocks({
      exchange: req.query.exchange,
      scanLimit: req.query.scanLimit,
      limit: req.query.limit
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post('/stocks/intraday-signal', async (req, res, next) => {
  try {
    const { symbol } = req.body || {};

    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'A stock symbol is required.'
      });
    }

    const normalizedSymbol = symbol.trim().toUpperCase();
    const [intradayData, dailyData] = await Promise.all([
      getIntradayData(normalizedSymbol).catch(() => []),
      getHistoricalData(normalizedSymbol, '3mo').catch(() => [])
    ]);
    const intraday = intradayPrediction(intradayData, { dailyBias: dailyTrendBias(dailyData) });

    return res.json({
      symbol: normalizedSymbol,
      intraday
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/strategies', (_req, res) => {
  res.json({ strategies: listStrategies() });
});

router.get('/strategies/custom', (_req, res) => {
  res.json({ strategies: readCustomStrategies() });
});

router.post('/strategies/custom', (req, res, next) => {
  try {
    const strategy = createCustomStrategy(req.body || {});
    return res.status(201).json({
      strategy,
      strategies: readCustomStrategies()
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/backtest/box-strategy', async (req, res, next) => {
  try {
    const {
      symbol,
      period = '1y',
      boxTolerance,
      wickRatio,
      volumeMultiplier
    } = req.body || {};

    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'A stock symbol is required.'
      });
    }

    const marketData = await getHistoricalData(symbol.trim().toUpperCase(), period);
    const result = runStrategyByName('box-strategy', marketData, {
      boxTolerance,
      wickRatio,
      volumeMultiplier
    });

    return res.json({
      symbol: symbol.trim().toUpperCase(),
      period,
      ...result
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/backtest/strategy/:strategyName', async (req, res, next) => {
  try {
    const {
      symbol,
      period = '1y',
      parameters = {}
    } = req.body || {};

    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'A stock symbol is required.'
      });
    }

    const normalizedSymbol = symbol.trim().toUpperCase();
    const marketData = await getHistoricalData(normalizedSymbol, period);
    const result = runStrategyByName(req.params.strategyName, marketData, parameters);

    return res.json({
      symbol: normalizedSymbol,
      period,
      ...result
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/backtest/multi-strategy', async (req, res, next) => {
  try {
    const {
      symbol,
      period = '1y',
      strategyNames,
      parameterMap = {}
    } = req.body || {};

    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'A stock symbol is required.'
      });
    }

    const normalizedSymbol = symbol.trim().toUpperCase();
    const marketData = await getHistoricalData(normalizedSymbol, period);
    if (!marketData.length) {
      return res.status(404).json({
        error: 'NoMarketData',
        message: `No historical OHLCV data was found for ${normalizedSymbol}.`
      });
    }

    const intradayData = await getIntradayData(normalizedSymbol).catch(() => []);
    const selectedStrategies = Array.isArray(strategyNames)
      ? strategyNames.map((name) => String(name || '').trim()).filter(Boolean).slice(0, 8)
      : [];
    const strategyResults = selectedStrategies.length
      ? selectedStrategies.map((strategyName) => runStrategyByName(strategyName, marketData, parameterMap[strategyName] || {}))
      : runAllStrategies(marketData, parameterMap);
    const analysis = analyzeStrategies(marketData, strategyResults, { period });
    const aiAnalysis = await analyzeMarket(normalizedSymbol, marketData);
    const intraday = intradayPrediction(intradayData, { dailyBias: dailyTrendBias(marketData) });

    return res.json({
      symbol: normalizedSymbol,
      period,
      latestClose: marketData[marketData.length - 1].close,
      latestDate: marketData[marketData.length - 1].date,
      analysis,
      aiAnalysis,
      intraday,
      strategyCount: strategyResults.length
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
