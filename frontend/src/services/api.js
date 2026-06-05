const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const CACHE_TTL_MS = 2 * 60 * 1000;
const responseCache = new Map();

function cacheKey(path, options) {
  return `${options.method || 'GET'}:${path}:${options.body || ''}`;
}

async function request(path, options = {}) {
  const key = cacheKey(path, options);
  const cached = responseCache.get(key);
  const canCache = options.cache !== false && (options.method || 'GET') !== 'POST_MUTATION';
  const fetchOptions = {
    ...options,
    method: options.method === 'POST_MUTATION' ? 'POST' : options.method
  };
  delete fetchOptions.cache;

  if (canCache && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.payload;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers
      },
      ...fetchOptions
    });
  } catch {
    throw new Error('API server is unreachable. If this is local, start the backend. If this is live, check /api/status.');
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed');
  }

  if (canCache) {
    responseCache.set(key, {
      loadedAt: Date.now(),
      payload
    });
  }

  return payload;
}

export async function searchStocks(query) {
  if (!query.trim()) {
    return [];
  }

  const payload = await request(`/stocks/search?query=${encodeURIComponent(query.trim())}`);
  return payload.results || [];
}

export async function getMostTradedStocks(limit = 30) {
  const payload = await request(`/stocks/most-traded?limit=${encodeURIComponent(limit)}`);
  return payload.results || [];
}

export async function scanIntradayStocks({ exchange = 'ALL', scanLimit = 80, limit = 20 } = {}) {
  const params = new URLSearchParams({
    exchange,
    scanLimit: String(scanLimit),
    limit: String(limit)
  });

  return request(`/stocks/intraday-scan?${params.toString()}`, {
    cache: false
  });
}

export async function getIntradaySignal(symbol) {
  return request('/stocks/intraday-signal', {
    method: 'POST',
    cache: false,
    body: JSON.stringify({ symbol })
  });
}

export async function runBoxBacktest(parameters) {
  return request('/backtest/box-strategy', {
    method: 'POST',
    body: JSON.stringify(parameters)
  });
}

export async function runStrategyBacktest(strategyName, parameters) {
  return request(`/backtest/strategy/${encodeURIComponent(strategyName)}`, {
    method: 'POST',
    body: JSON.stringify(parameters)
  });
}

export async function runMultiStrategyBacktest(parameters) {
  return request('/backtest/multi-strategy', {
    method: 'POST',
    body: JSON.stringify(parameters)
  });
}

export async function getStrategies() {
  const payload = await request('/strategies');
  return payload.strategies || [];
}

export async function getCustomStrategies() {
  const payload = await request('/strategies/custom');
  return payload.strategies || [];
}

export async function addCustomStrategy(strategy) {
  responseCache.clear();
  return request('/strategies/custom', {
    method: 'POST_MUTATION',
    body: JSON.stringify(strategy)
  });
}
