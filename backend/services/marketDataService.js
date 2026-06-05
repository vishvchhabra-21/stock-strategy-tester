const { parse } = require('csv-parse/sync');

const ALPHA_VANTAGE_API_KEY = String(process.env.ALPHA_VANTAGE_API_KEY || '').trim();

const PERIOD_TO_DAYS = {
  '3mo': 120,
  '6mo': 220,
  '1y': 420,
  '2y': 800
};
const GROWW_INSTRUMENT_LIST_URL = 'https://growwapi-assets.groww.in/instruments/instrument.csv';
const NSE_EQUITY_LIST_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';
const SEARCH_LIMIT = 80;
const PRICE_ENRICHMENT_CONCURRENCY = 8;
const NSE_CACHE_MS = 12 * 60 * 60 * 1000;
const MOST_TRADED_CACHE_MS = 30 * 60 * 1000;
const MARKET_DATA_CACHE_MS = 5 * 60 * 1000;
let growwInstrumentCache = {
  loadedAt: 0,
  rows: []
};
let nseEquityCache = {
  loadedAt: 0,
  rows: []
};
let mostTradedCache = {
  loadedAt: 0,
  rows: []
};
const historicalDataCache = new Map();
const intradayDataCache = new Map();
const providerStatus = {
  yahoo: {
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    recentErrors: 0
  },
  alphaVantage: {
    enabled: Boolean(ALPHA_VANTAGE_API_KEY),
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    recentErrors: 0
  }
};

function recordProviderSuccess(provider) {
  const bucket = providerStatus[provider];
  if (!bucket) return;
  bucket.lastSuccessAt = new Date().toISOString();
  bucket.recentErrors = 0;
}

function recordProviderError(provider, error) {
  const bucket = providerStatus[provider];
  if (!bucket) return;
  bucket.lastErrorAt = new Date().toISOString();
  bucket.lastError = {
    message: error?.message || 'Unknown error',
    status: error?.status || null,
    name: error?.name || 'Error'
  };
  bucket.recentErrors = Math.min(99, (bucket.recentErrors || 0) + 1);
}

function toIsoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function toUnixSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

function createHttpError(status, message, name = 'MarketDataError') {
  const error = new Error(message);
  error.status = status;
  error.name = name;
  return error;
}

function normalizeQuote(row) {
  return {
    date: toIsoDate(row.date),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume || 0)
  };
}

function normalizeIntradayQuote(row, timezone = 'UTC') {
  const date = new Date(row.date);

  return {
    dateTime: date.toISOString(),
    date: date.toLocaleDateString('en-CA', { timeZone: timezone }),
    time: date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone
    }),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume || 0)
  };
}

function calculatePercentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

async function fetchYahooJson(url) {
  const headers = {
    accept: 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    referer: 'https://finance.yahoo.com/'
  };
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const status = response.status;
        if ((status === 429 || status >= 500) && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          continue;
        }
        throw createHttpError(status, `Yahoo Finance returned ${status}.`);
      }

      const payload = await response.json();
      recordProviderSuccess('yahoo');
      return payload;
    } catch (error) {
      lastError = error;
      recordProviderError('yahoo', error);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  throw lastError || createHttpError(502, 'Yahoo Finance request failed.');
}

async function fetchAlphaVantageJson(params) {
  if (!ALPHA_VANTAGE_API_KEY) {
    throw createHttpError(400, 'Alpha Vantage API key is not configured.');
  }

  const url = new URL('https://www.alphavantage.co/query');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  url.searchParams.set('apikey', ALPHA_VANTAGE_API_KEY);

  const maxAttempts = 2;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'StockStrategyTester/1.0'
        }
      });
      if (!response.ok) {
        throw createHttpError(response.status, `Alpha Vantage returned ${response.status}.`, 'AlphaVantageError');
      }

      const payload = await response.json();
      if (payload.Note) {
        throw createHttpError(429, payload.Note, 'AlphaVantageRateLimit');
      }
      if (payload['Error Message']) {
        throw createHttpError(400, payload['Error Message'], 'AlphaVantageError');
      }

      recordProviderSuccess('alphaVantage');
      return payload;
    } catch (error) {
      lastError = error;
      recordProviderError('alphaVantage', error);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      }
    }
  }

  throw lastError || createHttpError(502, 'Alpha Vantage request failed.', 'AlphaVantageError');
}

function shouldFallbackProvider(error) {
  const status = error?.status;
  if (!status) return true;
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

function parseAlphaVantageDaily(payload) {
  const series = payload['Time Series (Daily)'] || {};
  return Object.entries(series).map(([date, row]) => ({
    date,
    open: Number(row['1. open']),
    high: Number(row['2. high']),
    low: Number(row['3. low']),
    close: Number(row['4. close']),
    volume: Number(row['6. volume'] || row['5. volume'] || 0)
  }));
}

function parseAlphaVantageIntraday(payload) {
  const keys = Object.keys(payload).filter((key) => key.toLowerCase().includes('time series'));
  const series = keys.length ? payload[keys[0]] : {};
  return Object.entries(series).map(([dateTime, row]) => ({
    date: new Date(dateTime),
    open: Number(row['1. open']),
    high: Number(row['2. high']),
    low: Number(row['3. low']),
    close: Number(row['4. close']),
    volume: Number(row['5. volume'] || 0)
  }));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/csv,text/plain,*/*',
      'user-agent': 'Mozilla/5.0 StockStrategyTester/1.0'
    }
  });

  if (!response.ok) {
    throw createHttpError(response.status, `Could not fetch listed stock data from ${url}.`);
  }

  return response.text();
}

async function tryFetchText(url) {
  try {
    return await fetchText(url);
  } catch (_error) {
    return null;
  }
}

async function getHistoricalData(symbol, period = '1y') {
  const cacheKey = `${symbol.toUpperCase()}:${period}`;
  const cached = historicalDataCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < MARKET_DATA_CACHE_MS) {
    return cached.rows;
  }

  const days = PERIOD_TO_DAYS[period] || PERIOD_TO_DAYS['1y'];
  const period2 = new Date();
  const period1 = new Date();
  period1.setDate(period2.getDate() - days);

  try {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.searchParams.set('period1', String(toUnixSeconds(period1)));
    url.searchParams.set('period2', String(toUnixSeconds(period2)));
    url.searchParams.set('interval', '1d');
    url.searchParams.set('events', 'history');
    url.searchParams.set('includeAdjustedClose', 'true');

    const payload = await fetchYahooJson(url);
    const chartError = payload.chart?.error;
    if (chartError) {
      throw createHttpError(404, chartError.description || `No data found for ${symbol}.`);
    }

    const result = payload.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0] || {};

    const rows = timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000),
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: quote.volume?.[index]
    }));

    const cleanRows = (rows || [])
      .map(normalizeQuote)
      .filter((row) => (
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close) &&
        row.high >= row.low
      ))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (cleanRows.length < 40) {
      throw createHttpError(
        404,
        `Not enough daily OHLCV data was found for ${symbol}. Check the symbol and exchange suffix, for example RELIANCE.NS or AAPL.`,
        'InsufficientDataError'
      );
    }

    historicalDataCache.set(cacheKey, {
      loadedAt: Date.now(),
      rows: cleanRows
    });

    return cleanRows;
  } catch (error) {
    if (ALPHA_VANTAGE_API_KEY && shouldFallbackProvider(error)) {
      try {
        const payload = await fetchAlphaVantageJson({
          function: 'TIME_SERIES_DAILY_ADJUSTED',
          symbol,
          outputsize: days > 160 ? 'full' : 'compact'
        });
        const rows = parseAlphaVantageDaily(payload)
          .map(normalizeQuote)
          .filter((row) => (
            Number.isFinite(row.open) &&
            Number.isFinite(row.high) &&
            Number.isFinite(row.low) &&
            Number.isFinite(row.close) &&
            row.high >= row.low
          ))
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (rows.length >= 40) {
          historicalDataCache.set(cacheKey, { loadedAt: Date.now(), rows });
          return rows;
        }
      } catch (_alphaError) {
        recordProviderError('alphaVantage', _alphaError);
      }
    }

    if (error.status) {
      throw error;
    }

    throw createHttpError(
      502,
      `Could not fetch market data for ${symbol}. Yahoo Finance may be unavailable or the symbol may be invalid.`,
      'MarketDataError'
    );
  }
}

async function getIntradayData(symbol, range = '5d', interval = '5m') {
  const cacheKey = `${symbol.toUpperCase()}:${range}:${interval}`;
  const cached = intradayDataCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < MARKET_DATA_CACHE_MS) {
    return cached.rows;
  }

  try {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.searchParams.set('range', range);
    url.searchParams.set('interval', interval);
    url.searchParams.set('includePrePost', 'false');

    const payload = await fetchYahooJson(url);
    const chartError = payload.chart?.error;
    if (chartError) {
      throw createHttpError(404, chartError.description || `No intraday data found for ${symbol}.`);
    }

    const result = payload.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0] || {};
    const timezone = result?.meta?.exchangeTimezoneName || 'UTC';

    const rows = timestamps
      .map((timestamp, index) => normalizeIntradayQuote({
        date: new Date(timestamp * 1000),
        open: quote.open?.[index],
        high: quote.high?.[index],
        low: quote.low?.[index],
        close: quote.close?.[index],
        volume: quote.volume?.[index]
      }, timezone))
      .filter((row) => (
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close) &&
        row.high >= row.low
      ));

    intradayDataCache.set(cacheKey, {
      loadedAt: Date.now(),
      rows
    });

    return rows;
  } catch (error) {
    if (ALPHA_VANTAGE_API_KEY && shouldFallbackProvider(error)) {
      try {
        const payload = await fetchAlphaVantageJson({
          function: 'TIME_SERIES_INTRADAY',
          symbol,
          interval: interval === '1m' ? '1min' : interval === '15m' ? '15min' : interval === '30m' ? '30min' : interval === '60m' ? '60min' : '5min',
          outputsize: 'compact'
        });
        const rows = parseAlphaVantageIntraday(payload)
          .map((row) => normalizeIntradayQuote(row))
          .filter((row) => (
            Number.isFinite(row.open) &&
            Number.isFinite(row.high) &&
            Number.isFinite(row.low) &&
            Number.isFinite(row.close) &&
            row.high >= row.low
          ))
          .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

        if (rows.length) {
          intradayDataCache.set(cacheKey, { loadedAt: Date.now(), rows });
          return rows;
        }
      } catch (_alphaError) {
        recordProviderError('alphaVantage', _alphaError);
      }
    }

    if (error.status) {
      throw error;
    }

    throw createHttpError(
      502,
      `Could not fetch intraday market data for ${symbol}.`,
      'IntradayMarketDataError'
    );
  }
}

async function getQuoteSnapshot(symbol) {
  try {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.searchParams.set('range', '5d');
    url.searchParams.set('interval', '1d');

    const payload = await fetchYahooJson(url);
    const result = payload.chart?.result?.[0];
    const meta = result?.meta || {};
    const closes = (result?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite);
    const currentPrice = Number.isFinite(meta.regularMarketPrice)
      ? meta.regularMarketPrice
      : closes[closes.length - 1];
    const previousClose = Number.isFinite(meta.chartPreviousClose)
      ? meta.chartPreviousClose
      : closes[closes.length - 2];
    const oneDayReturn = calculatePercentChange(currentPrice, previousClose);

    return {
      currentPrice: Number.isFinite(currentPrice) ? Number(currentPrice.toFixed(2)) : null,
      previousClose: Number.isFinite(previousClose) ? Number(previousClose.toFixed(2)) : null,
      oneDayReturn: Number.isFinite(oneDayReturn) ? Number(oneDayReturn.toFixed(2)) : null,
      currency: meta.currency || ''
    };
  } catch (_error) {
    return {
      currentPrice: null,
      previousClose: null,
      oneDayReturn: null,
      currency: ''
    };
  }
}

async function getFundamentalSnapshot(symbol) {
  async function getFromQuote(symbolToFetch) {
    const url = new URL('https://query1.finance.yahoo.com/v7/finance/quote');
    url.searchParams.set('symbols', symbolToFetch);

    const payload = await fetchYahooJson(url);
    const quote = payload.quoteResponse?.result?.[0] || {};
    const rawOrNull = (value) => (Number.isFinite(value) ? value : null);

    return {
      source: 'Yahoo Finance quote',
      sector: '',
      industry: '',
      peRatio: rawOrNull(quote.trailingPE) ?? rawOrNull(quote.forwardPE),
      eps: rawOrNull(quote.epsTrailingTwelveMonths) ?? rawOrNull(quote.epsForward),
      revenueGrowth: rawOrNull(quote.revenueGrowth),
      profitGrowth: rawOrNull(quote.earningsGrowth),
      debtToEquity: rawOrNull(quote.debtToEquity),
      roe: rawOrNull(quote.returnOnEquity),
      roce: null,
      promoterHolding: null,
      quarterlyRevenueEstimate: null,
      quarterlyEpsEstimate: null,
      targetMeanPrice: rawOrNull(quote.targetMeanPrice),
      recommendation: quote.recommendationKey || '',
      unavailable: false
    };
  }

  try {
    const url = new URL(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
    url.searchParams.set('modules', [
      'summaryDetail',
      'defaultKeyStatistics',
      'financialData',
      'earningsTrend',
      'incomeStatementHistory',
      'majorHoldersBreakdown',
      'assetProfile'
    ].join(','));

    const payload = await fetchYahooJson(url);
    const result = payload.quoteSummary?.result?.[0] || {};
    const summaryDetail = result.summaryDetail || {};
    const keyStats = result.defaultKeyStatistics || {};
    const financialData = result.financialData || {};
    const earningsTrend = result.earningsTrend || {};
    const profile = result.assetProfile || {};
    const holders = result.majorHoldersBreakdown || {};

    const raw = (field) => field?.raw ?? null;
    const quarterlyTrend = earningsTrend.trend?.find((item) => item.period === '0q') || earningsTrend.trend?.[0] || {};

    return {
      source: 'Yahoo Finance quoteSummary',
      sector: profile.sector || '',
      industry: profile.industry || '',
      peRatio: raw(summaryDetail.trailingPE) ?? raw(summaryDetail.forwardPE),
      eps: raw(keyStats.trailingEps) ?? raw(keyStats.forwardEps),
      revenueGrowth: raw(financialData.revenueGrowth),
      profitGrowth: raw(financialData.earningsGrowth),
      debtToEquity: raw(financialData.debtToEquity),
      roe: raw(financialData.returnOnEquity),
      roce: null,
      promoterHolding: raw(holders.insidersPercentHeld),
      quarterlyRevenueEstimate: raw(quarterlyTrend.revenueEstimate?.avg),
      quarterlyEpsEstimate: raw(quarterlyTrend.earningsEstimate?.avg),
      targetMeanPrice: raw(financialData.targetMeanPrice),
      recommendation: financialData.recommendationKey || '',
      unavailable: false
    };
  } catch (error) {
    try {
      const fallback = await getFromQuote(symbol);
      return fallback;
    } catch (_fallbackError) {
      if (ALPHA_VANTAGE_API_KEY && shouldFallbackProvider(error) && !String(symbol).includes('.') && !String(symbol).startsWith('^')) {
        try {
          const payload = await fetchAlphaVantageJson({
            function: 'OVERVIEW',
            symbol
          });
          const pe = Number(payload.PERatio);
          const eps = Number(payload.EPS);
          return {
            source: 'Alpha Vantage OVERVIEW',
            sector: payload.Sector || '',
            industry: payload.Industry || '',
            peRatio: Number.isFinite(pe) ? pe : null,
            eps: Number.isFinite(eps) ? eps : null,
            revenueGrowth: null,
            profitGrowth: null,
            debtToEquity: null,
            roe: null,
            roce: null,
            promoterHolding: null,
            quarterlyRevenueEstimate: null,
            quarterlyEpsEstimate: null,
            targetMeanPrice: null,
            recommendation: '',
            unavailable: false
          };
        } catch (_alphaError) {
          recordProviderError('alphaVantage', _alphaError);
        }
      }

      return {
        source: 'Yahoo Finance quoteSummary',
        unavailable: true,
        message: error?.status === 401
          ? 'Fundamental data is blocked by Yahoo Finance right now (Invalid Crumb / Unauthorized). Try again later or use a paid fundamentals API key.'
          : 'Fundamental data is unavailable for this symbol right now.'
      };
    }
  }
}

async function getSymbolNews(symbol, limit = 8) {
  try {
    const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
    url.searchParams.set('q', symbol);
    url.searchParams.set('quotesCount', '0');
    url.searchParams.set('newsCount', String(Math.min(Math.max(Number(limit) || 8, 1), 10)));

    const payload = await fetchYahooJson(url);
    return (payload.news || []).map((item) => ({
      title: item.title || '',
      publisher: item.publisher || '',
      link: item.link || '',
      providerPublishTime: item.providerPublishTime || null
    }));
  } catch (_error) {
    return [];
  }
}

function normalizeSearchTerm(query) {
  const clean = String(query || '').trim();
  return clean.includes('.') ? clean.split('.')[0] : clean;
}

function formatNseArchiveDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}${month}${year}`;
}

function parseNumber(value) {
  const parsed = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getNseListedStocks() {
  const isCacheFresh = nseEquityCache.rows.length && Date.now() - nseEquityCache.loadedAt < NSE_CACHE_MS;
  if (isCacheFresh) {
    return nseEquityCache.rows;
  }

  const csv = await fetchText(NSE_EQUITY_LIST_URL);
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const rows = records
    .filter((record) => record.SYMBOL && record['NAME OF COMPANY'])
    .map((record) => ({
      symbol: `${record.SYMBOL}.NS`,
      name: record['NAME OF COMPANY'],
      exchange: 'NSE',
      type: 'EQUITY',
      source: 'NSE'
    }));

  nseEquityCache = {
    loadedAt: Date.now(),
    rows
  };

  return rows;
}

async function getGrowwListedStocks() {
  const isCacheFresh = growwInstrumentCache.rows.length && Date.now() - growwInstrumentCache.loadedAt < NSE_CACHE_MS;
  if (isCacheFresh) {
    return growwInstrumentCache.rows;
  }

  const csv = await fetchText(GROWW_INSTRUMENT_LIST_URL);
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const rows = records
    .filter((record) => (
      record.trading_symbol &&
      record.segment === 'CASH' &&
      record.series === 'EQ' &&
      record.instrument_type === 'EQ' &&
      ['NSE', 'BSE'].includes(record.exchange)
    ))
    .map((record) => {
      const suffix = record.exchange === 'NSE' ? '.NS' : '.BO';
      return {
        symbol: `${record.trading_symbol}${suffix}`,
        name: record.name || record.trading_symbol,
        exchange: record.exchange,
        type: 'EQUITY',
        source: 'Groww',
        growwSymbol: record.groww_symbol || '',
        isin: record.isin || ''
      };
    });

  growwInstrumentCache = {
    loadedAt: Date.now(),
    rows: dedupeListings(rows)
  };

  return growwInstrumentCache.rows;
}

function dedupeListings(rows) {
  const seen = new Set();
  const output = [];

  rows.forEach((row) => {
    const key = `${row.exchange}:${row.symbol}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    output.push(row);
  });

  return output;
}

async function searchNseListedStocks(query) {
  try {
    const searchTerm = normalizeSearchTerm(query).toLowerCase();
    const rows = await getNseListedStocks();

    return rows
      .filter((stock) => (
        stock.symbol.toLowerCase().includes(searchTerm) ||
        stock.name.toLowerCase().includes(searchTerm)
      ))
      .sort((a, b) => scoreSearchResult(a, searchTerm) - scoreSearchResult(b, searchTerm))
      .slice(0, SEARCH_LIMIT);
  } catch (_error) {
    return [];
  }
}

async function searchGrowwListedStocks(query) {
  try {
    const searchTerm = normalizeSearchTerm(query).toLowerCase();
    const rows = await getGrowwListedStocks();

    return rows
      .filter((stock) => (
        stock.symbol.toLowerCase().includes(searchTerm) ||
        stock.name.toLowerCase().includes(searchTerm) ||
        stock.growwSymbol.toLowerCase().includes(searchTerm)
      ))
      .sort((a, b) => scoreSearchResult(a, searchTerm) - scoreSearchResult(b, searchTerm))
      .slice(0, SEARCH_LIMIT);
  } catch (_error) {
    return [];
  }
}

function scoreSearchResult(stock, searchTerm) {
  const rawSymbol = stock.symbol.replace('.NS', '').toLowerCase();
  const name = stock.name.toLowerCase();

  if (rawSymbol === searchTerm) return 0;
  if (rawSymbol.startsWith(searchTerm)) return 1;
  if (name.startsWith(searchTerm)) return 2;
  if (rawSymbol.includes(searchTerm)) return 3;
  if (name.includes(searchTerm)) return 4;
  return 5;
}

function mergeSearchResults(...groups) {
  const seen = new Set();
  const results = [];

  groups.flat().forEach((item) => {
    const key = item.symbol.toUpperCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    results.push(item);
  });

  return results.slice(0, SEARCH_LIMIT);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return output;
}

async function searchSymbols(query) {
  try {
    const searchTerm = normalizeSearchTerm(query);
    const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
    url.searchParams.set('q', searchTerm);
    url.searchParams.set('quotesCount', String(SEARCH_LIMIT));
    url.searchParams.set('newsCount', '0');

    const [response, growwResults, nseResults] = await Promise.all([
      fetchYahooJson(url),
      searchGrowwListedStocks(searchTerm),
      searchNseListedStocks(searchTerm)
    ]);

    const yahooResults = (response.quotes || [])
      .filter((quote) => quote.symbol)
      .filter((quote) => ['EQUITY', 'ETF'].includes(quote.quoteType || ''))
      .slice(0, SEARCH_LIMIT)
      .map((quote) => ({
        symbol: quote.symbol,
        name: quote.shortname || quote.longname || quote.symbol,
        exchange: quote.exchDisp || quote.exchange || '',
        type: quote.quoteType || '',
        source: 'Yahoo'
      }));

    const baseResults = mergeSearchResults(growwResults, nseResults, yahooResults);
    const snapshots = await mapWithConcurrency(
      baseResults,
      PRICE_ENRICHMENT_CONCURRENCY,
      (item) => getQuoteSnapshot(item.symbol)
    );

    return baseResults.map((item, index) => ({
      ...item,
      ...snapshots[index]
    }));
  } catch (_error) {
    return [];
  }
}

async function getMostTradedLastWeek(limit = 30) {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 30, 5), SEARCH_LIMIT);
  const isCacheFresh = mostTradedCache.rows.length && Date.now() - mostTradedCache.loadedAt < MOST_TRADED_CACHE_MS;

  if (isCacheFresh) {
    return mostTradedCache.rows.slice(0, normalizedLimit);
  }

  const tradingDays = [];
  const today = new Date();

  for (let offset = 0; offset < 18 && tradingDays.length < 5; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const dateKey = formatNseArchiveDate(date);
    const url = `https://archives.nseindia.com/products/content/sec_bhavdata_full_${dateKey}.csv`;
    const csv = await tryFetchText(url);

    if (csv && csv.startsWith('SYMBOL')) {
      tradingDays.push({
        date,
        csv
      });
    }
  }

  const aggregates = new Map();

  tradingDays.forEach(({ csv }) => {
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    records
      .filter((record) => record.SERIES === 'EQ' && record.SYMBOL)
      .forEach((record) => {
        const symbol = record.SYMBOL;
        const existing = aggregates.get(symbol) || {
          symbol: `${symbol}.NS`,
          name: symbol,
          exchange: 'NSE',
          type: 'EQUITY',
          source: 'NSE Bhavcopy',
          totalTradedQuantity: 0,
          turnoverLacs: 0,
          tradingDays: 0
        };

        existing.totalTradedQuantity += parseNumber(record.TTL_TRD_QNTY);
        existing.turnoverLacs += parseNumber(record.TURNOVER_LACS);
        existing.tradingDays += 1;
        existing.currentPrice = parseNumber(record.CLOSE_PRICE) || existing.currentPrice || null;
        existing.previousClose = parseNumber(record.PREV_CLOSE) || existing.previousClose || null;
        existing.oneDayReturn = calculatePercentChange(existing.currentPrice, existing.previousClose);
        aggregates.set(symbol, existing);
      });
  });

  const growwRows = await getGrowwListedStocks();
  const growwBySymbol = new Map(growwRows.map((stock) => [stock.symbol.toUpperCase(), stock]));

  const rows = Array.from(aggregates.values())
    .map((item) => {
      const growwMatch = growwBySymbol.get(item.symbol.toUpperCase());
      return {
        ...item,
        name: growwMatch?.name || item.name,
        growwSymbol: growwMatch?.growwSymbol || '',
        isin: growwMatch?.isin || '',
        currentPrice: Number.isFinite(item.currentPrice) ? Number(item.currentPrice.toFixed(2)) : null,
        previousClose: Number.isFinite(item.previousClose) ? Number(item.previousClose.toFixed(2)) : null,
        oneDayReturn: Number.isFinite(item.oneDayReturn) ? Number(item.oneDayReturn.toFixed(2)) : null,
        totalTradedQuantity: Math.round(item.totalTradedQuantity),
        turnoverLacs: Number(item.turnoverLacs.toFixed(2)),
        averageDailyQuantity: Math.round(item.totalTradedQuantity / Math.max(item.tradingDays, 1))
      };
    })
    .sort((a, b) => b.totalTradedQuantity - a.totalTradedQuantity)
    .slice(0, SEARCH_LIMIT);

  mostTradedCache = {
    loadedAt: Date.now(),
    rows
  };

  return rows.slice(0, normalizedLimit);
}

async function getListedStocks(exchange = 'ALL') {
  const normalizedExchange = String(exchange || 'ALL').toUpperCase();
  const rows = await getGrowwListedStocks();

  if (normalizedExchange === 'NSE' || normalizedExchange === 'BSE') {
    return rows.filter((stock) => stock.exchange === normalizedExchange);
  }

  return rows;
}

function getProviderStatus() {
  return {
    yahoo: providerStatus.yahoo,
    alphaVantage: providerStatus.alphaVantage
  };
}

module.exports = {
  getHistoricalData,
  getIntradayData,
  getFundamentalSnapshot,
  getListedStocks,
  getMostTradedLastWeek,
  getSymbolNews,
  searchSymbols,
  getProviderStatus
};
