import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Clock3, Plus, RefreshCcw, Search, X, Zap } from 'lucide-react';
import { getIntradaySignal, getMostTradedStocks, searchStocks } from '../services/api.js';

const DECISION_STYLES = {
  BUY: 'decision-buy',
  SELL: 'decision-sell',
  HOLD: 'decision-hold',
  WAIT: 'decision-wait'
};
const SAMPLE_STOCKS = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS'];
const STORAGE_KEY = 'intraday-desk-symbols';
const SLOT_COUNT = 4;

function readSavedSymbols() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.from({ length: SLOT_COUNT }, (_, index) => (
      typeof saved[index] === 'string' ? saved[index] : ''
    ));
  } catch {
    return Array.from({ length: SLOT_COUNT }, () => '');
  }
}

function StockSignalsPage() {
  const [symbols, setSymbols] = useState(readSavedSymbols);
  const [mostTraded, setMostTraded] = useState([]);
  const [accountSize, setAccountSize] = useState(100000);
  const [riskPercent, setRiskPercent] = useState(1);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  }, [symbols]);

  useEffect(() => {
    let cancelled = false;

    async function loadMostTraded() {
      try {
        const rows = await getMostTradedStocks(12);
        if (!cancelled) setMostTraded(rows);
      } catch {
        if (!cancelled) setMostTraded([]);
      }
    }

    loadMostTraded();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSlotSymbol = useCallback((slotIndex, nextSymbol) => {
    setSymbols((current) => current.map((value, index) => (
      index === slotIndex ? nextSymbol : value
    )));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <section className="panel rounded-lg p-3 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-cobalt" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Intraday Signal Desk</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Track up to four stocks side by side. Each window holds one stock; use its refresh
              button to pull the current market state and get a fresh BUY, SELL, or WAIT call.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-3">
            <label>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-stone-500">Account size</span>
              <input
                type="number"
                min="0"
                value={accountSize}
                onChange={(event) => setAccountSize(Number(event.target.value))}
                className="num min-h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink sm:w-36"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-stone-500">Risk per trade %</span>
              <input
                type="number"
                min="0.1"
                max="5"
                step="0.1"
                value={riskPercent}
                onChange={(event) => setRiskPercent(Number(event.target.value))}
                className="num min-h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink sm:w-36"
              />
            </label>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {symbols.map((symbol, index) => (
          <SignalWindow
            key={index}
            slot={index + 1}
            symbol={symbol}
            onSymbolChange={(next) => setSlotSymbol(index, next)}
            accountSize={accountSize}
            riskPercent={riskPercent}
            mostTraded={mostTraded}
          />
        ))}
      </div>
    </div>
  );
}

function SignalWindow({ slot, symbol, onSymbolChange, accountSize, riskPercent, mostTraded }) {
  const [query, setQuery] = useState(symbol);
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [popKey, setPopKey] = useState(0);
  const loadingRef = useRef(false);

  const load = useCallback(async (nextSymbol) => {
    const clean = String(nextSymbol || '').trim().toUpperCase();
    if (!clean || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const payload = await getIntradaySignal(clean);
      setResult(payload);
      setFetchedAt(new Date());
      setPopKey((key) => key + 1);
      setQuery(clean);
      setSuggestions([]);
      onSymbolChange(clean);
    } catch (err) {
      setError(err.message || 'Could not generate the intraday signal.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [onSymbolChange]);

  // Restore the saved stock for this window on first mount.
  useEffect(() => {
    if (symbol) load(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (result || term.length < 2 || term.includes('.')) {
      setSuggestions([]);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        setSuggestions((await searchStocks(term)).slice(0, 6));
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [query, result]);

  const clearWindow = useCallback(() => {
    setResult(null);
    setError('');
    setQuery('');
    setSuggestions([]);
    setFetchedAt(null);
    onSymbolChange('');
  }, [onSymbolChange]);

  const intraday = result?.intraday;
  const action = intraday?.decision || 'WAIT';
  const plan = intraday?.riskPlan || null;
  const position = calculatePositionSize(accountSize, riskPercent, plan);

  return (
    <section className="panel signal-window rounded-lg p-3 sm:p-4" aria-label={`Signal window ${slot}`}>
      <header className="mb-3 flex items-center gap-2">
        <span className="slot-chip num" aria-hidden="true">W{slot}</span>
        {result ? (
          <>
            <h3 className="mobile-safe-text min-w-0 flex-1 truncate text-sm font-bold text-ink">
              {result.symbol}
            </h3>
            <button
              type="button"
              onClick={() => load(result.symbol)}
              disabled={loading}
              title={`Refresh ${result.symbol} signal`}
              aria-label={`Refresh ${result.symbol} signal`}
              className="icon-button h-9 w-9 text-stone-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={clearWindow}
              disabled={loading}
              title="Remove stock from this window"
              aria-label="Remove stock from this window"
              className="icon-button h-9 w-9 text-stone-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          <h3 className="text-sm font-bold text-stone-500">Add a stock to track</h3>
        )}
      </header>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="mobile-safe-text flex-1">{error}</span>
          {query.trim() && (
            <button
              type="button"
              onClick={() => load(query)}
              className="font-bold underline underline-offset-2"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {result && intraday ? (
        <div className="flex flex-1 flex-col gap-3">
          <div
            key={popKey}
            className={`decision-pop rounded-md border px-3 py-3 ${DECISION_STYLES[action] || DECISION_STYLES.WAIT}`}
          >
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  Intraday call
                </div>
                <div className="mt-1 text-4xl font-bold leading-none">{action}</div>
              </div>
              <div className="num shrink-0 text-right text-sm font-bold">
                {intraday.confidence || 0}%
                <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-80">strength</span>
              </div>
            </div>
            <div className="confidence-track mt-3" role="presentation">
              <div className="confidence-fill" style={{ width: `${Math.min(intraday.confidence || 0, 100)}%` }} />
            </div>
            <p className="mobile-safe-text mt-2 text-xs font-semibold leading-5">
              {intraday.explanation}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniMetric label={action === 'SELL' ? 'Sell at' : action === 'BUY' ? 'Buy at' : 'Entry'} value={formatPrice(plan?.entry)} />
            <MiniMetric label="Stoploss" value={formatPrice(plan?.stopLoss)} />
            <MiniMetric label="Target" value={formatPrice(plan?.target)} />
            <MiniMetric label="Risk reward" value={plan?.riskReward || '-'} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniMetric label="Qty" value={position.quantity} />
            <MiniMetric label="Max loss" value={position.maxLoss} />
            <MiniMetric label="Votes B/S/W" value={`${intraday.votes?.buy ?? '-'} / ${intraday.votes?.sell ?? '-'} / ${intraday.votes?.wait ?? '-'}`} />
            <MiniMetric label="15m check" value={formatValidation(intraday.validation)} />
          </div>

          <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[11px] font-semibold text-stone-500">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Candle {intraday.candleTime || '-'}
            </span>
            <span className="num">
              Checked {fetchedAt ? fetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
            </span>
          </footer>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <div className="relative">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') load(query);
                }}
                placeholder="Symbol, e.g. RELIANCE.NS"
                aria-label={`Stock symbol for window ${slot}`}
                className="min-h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
              />
              <button
                type="button"
                onClick={() => load(query)}
                disabled={loading || !query.trim()}
                title="Get signal"
                aria-label="Get signal"
                className="glow-button grid h-10 w-10 shrink-0 place-items-center rounded-md text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : searching
                    ? <Search className="h-4 w-4 animate-pulse" aria-hidden="true" />
                    : <Plus className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>

            {suggestions.length > 0 && (
              <ul className="absolute inset-x-0 top-12 z-20 max-h-52 overflow-auto rounded-md border border-line bg-white shadow-panel">
                {suggestions.map((item) => (
                  <li key={`${item.symbol}-${item.exchange}`}>
                    <button
                      type="button"
                      onClick={() => load(item.symbol)}
                      className="row-hover flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left text-xs last:border-b-0 hover:bg-paper"
                    >
                      <span className="min-w-0">
                        <span className="block font-bold text-ink">{item.symbol}</span>
                        <span className="block truncate text-stone-500">{item.name}</span>
                      </span>
                      <span className="shrink-0 rounded-sm border border-line bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">
                        {item.exchange || '-'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <span className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Samples</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SAMPLE_STOCKS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => load(item)}
                  disabled={loading}
                  className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-bold text-stone-600 transition hover:border-cobalt hover:text-cobalt disabled:opacity-60"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {mostTraded.length > 0 && (
            <div className="min-h-0">
              <span className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Most traded last week</span>
              <ul className="mt-1.5 max-h-40 overflow-auto rounded-md border border-line bg-white">
                {mostTraded.slice(0, 8).map((item) => (
                  <li key={`${item.symbol}-${item.exchange}`}>
                    <button
                      type="button"
                      onClick={() => load(item.symbol)}
                      disabled={loading}
                      className="row-hover flex w-full items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-left text-xs last:border-b-0 hover:bg-paper disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block font-bold text-ink">{item.symbol}</span>
                        <span className="block truncate text-stone-500">{item.name}</span>
                      </span>
                      <span className="num shrink-0 font-semibold text-stone-600">
                        {formatPrice(item.currentPrice)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-md border border-line bg-white px-2.5 py-1.5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="num mobile-safe-text mt-0.5 text-sm font-bold text-ink">{value}</div>
    </div>
  );
}

function formatPrice(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function formatValidation(validation) {
  if (!validation?.samples) {
    return '-';
  }

  return `${validation.accuracy}% / ${validation.samples}`;
}

function calculatePositionSize(accountSize, riskPercent, plan) {
  const riskAmount = Number(accountSize || 0) * (Number(riskPercent || 0) / 100);
  const riskPerShare = Math.abs(Number(plan?.entry || 0) - Number(plan?.stopLoss || 0));

  if (!riskAmount || !riskPerShare) {
    return {
      quantity: '-',
      maxLoss: '-'
    };
  }

  return {
    quantity: Math.floor(riskAmount / riskPerShare).toLocaleString(),
    maxLoss: formatPrice(riskAmount)
  };
}

export default memo(StockSignalsPage);
