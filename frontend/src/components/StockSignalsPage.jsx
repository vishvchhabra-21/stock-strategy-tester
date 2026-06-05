import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Clock3, Play, Search, Target, Zap } from 'lucide-react';
import { getIntradaySignal, getMostTradedStocks, searchStocks } from '../services/api.js';

const DECISION_STYLES = {
  BUY: 'decision-buy',
  SELL: 'decision-sell',
  HOLD: 'decision-hold',
  WAIT: 'decision-wait'
};
const SAMPLE_STOCKS = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS'];

function StockSignalsPage() {
  const [symbol, setSymbol] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [mostTradedStocks, setMostTradedStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [accountSize, setAccountSize] = useState(100000);
  const [riskPercent, setRiskPercent] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function loadMostTradedStocks() {
      try {
        const rows = await getMostTradedStocks(40);
        if (!cancelled) {
          setMostTradedStocks(rows);
        }
      } catch {
        if (!cancelled) {
          setMostTradedStocks([]);
        }
      }
    }

    loadMostTradedStocks();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const query = symbol.trim();
      if (query.length < 2 || query.includes('.')) {
        setSuggestions([]);
        return;
      }

      setSearching(true);
      try {
        setSuggestions(await searchStocks(query));
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [symbol]);

  const intraday = result?.intraday;
  const displayedStocks = suggestions.length > 0 ? suggestions : mostTradedStocks;
  const stockListTitle = suggestions.length > 0 ? `${suggestions.length} listed stocks found` : 'Most traded last week';
  const action = intraday?.decision || 'WAIT';

  const generateSignal = useCallback(async (nextSymbol = symbol) => {
    const cleanSymbol = nextSymbol.trim().toUpperCase();
    if (loading || !cleanSymbol) return;

    setLoading(true);
    setError('');

    try {
      const payload = await getIntradaySignal(cleanSymbol);
      setResult(payload);
      setSymbol(cleanSymbol);
      setSuggestions([]);
    } catch (err) {
      setError(err.message || 'Could not generate intraday signal.');
    } finally {
      setLoading(false);
    }
  }, [loading, symbol]);

  const handleSearch = useCallback(async () => {
    if (!symbol.trim()) return;

    setSearching(true);
    setError('');

    try {
      setSuggestions(await searchStocks(symbol));
    } catch (err) {
      setError(err.message || 'Could not search stocks.');
    } finally {
      setSearching(false);
    }
  }, [symbol]);

  const plan = intraday?.riskPlan || null;
  const position = calculatePositionSize(accountSize, riskPercent, plan);
  const metrics = intraday?.metrics || {};
  const visibleReasons = useMemo(() => (intraday?.reasons || []).slice(0, 6), [intraday]);

  return (
    <div className="flex flex-col gap-5">
      <section className="panel rounded-lg p-3 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-cobalt" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Intraday Signal</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Shows only the intraday view for the selected stock: BUY, SELL, or WAIT.
            </p>
          </div>
          <button
            type="button"
            onClick={() => generateSignal()}
            disabled={loading}
            className="glow-button inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {loading ? 'Checking' : 'Get Intraday Signal'}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)] lg:items-end">
          <div>
            <label htmlFor="signals-symbol" className="mb-1 block text-sm font-medium text-stone-700">
              Stock
            </label>
            <div className="flex gap-2">
              <input
                id="signals-symbol"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder="Select a stock for intraday signal"
                className="min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching || loading}
                title="Search stock"
                className="grid min-h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-white text-stone-700 transition hover:border-cobalt hover:text-cobalt disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-stone-500">Sample Indian stocks:</span>
          {SAMPLE_STOCKS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => generateSignal(item)}
              disabled={loading}
              className="rounded-md border border-line bg-white/75 px-2.5 py-1 text-xs font-bold text-stone-600 transition hover:border-cobalt hover:text-cobalt disabled:opacity-60"
            >
              {item}
            </button>
          ))}
        </div>

        {displayedStocks.length > 0 && (
          <StockList
            rows={displayedStocks}
            title={stockListTitle}
            onPick={generateSignal}
          />
        )}
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {intraday ? (
        <>
          <section className={`decision-card rounded-lg border p-3 sm:p-5 ${DECISION_STYLES[action] || DECISION_STYLES.HOLD}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <Zap className="h-5 w-5" aria-hidden="true" />
                  <h3 className="text-base font-semibold">Intraday Trade View</h3>
                </div>
                <p className="text-xs font-semibold uppercase">
                  {result.symbol} | intraday only {intraday.candleTime ? `| ${intraday.candleTime}` : ''}
                </p>
                <h2 className="mt-2 text-5xl font-bold sm:text-6xl">{action}</h2>
                <p className="mobile-safe-text mt-3 max-w-3xl text-sm leading-6">
                  {intraday.explanation}
                </p>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:min-w-[360px]">
                <SignalMetric label="Signal strength" value={`${intraday.confidence || 0}%`} />
                <SignalMetric label={entryLabel(action)} value={formatPlanPrice(plan?.entry)} />
                <SignalMetric label="Stoploss" value={formatPlanPrice(plan?.stopLoss)} />
                <SignalMetric label="Target" value={formatPlanPrice(plan?.target)} />
                <SignalMetric label="Risk reward" value={plan?.riskReward || '-'} />
                <SignalMetric label="Position size" value={position.quantity} />
                <SignalMetric label="Max loss" value={position.maxLoss} />
                <SignalMetric label="Buy vote" value={intraday.votes?.buy ?? '-'} />
                <SignalMetric label="Sell vote" value={intraday.votes?.sell ?? '-'} />
                <SignalMetric label="Wait vote" value={intraday.votes?.wait ?? '-'} />
                <SignalMetric label="15m validation" value={formatValidation(intraday.validation)} />
              </div>
            </div>
            {plan?.note && (
              <div className="mobile-safe-text mt-4 rounded-md border border-line bg-white/55 px-3 py-2 text-sm font-semibold">
                {plan.note}
              </div>
            )}
            <div className="mt-4 grid gap-3 rounded-md border border-line bg-white/55 p-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-bold uppercase">Account size</span>
                <input
                  type="number"
                  min="0"
                  value={accountSize}
                  onChange={(event) => setAccountSize(Number(event.target.value))}
                  className="min-h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold uppercase">Risk per trade %</span>
                <input
                  type="number"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={riskPercent}
                  onChange={(event) => setRiskPercent(Number(event.target.value))}
                  className="min-h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
                />
              </label>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <IntradayReasons reasons={visibleReasons} />
            <IntradayMetrics metrics={metrics} lastUpdated={intraday.lastUpdated} />
          </section>
        </>
      ) : (
        <section className="panel rounded-lg p-3 sm:p-5">
          <div className="flex items-center gap-2 text-stone-600">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-semibold">Choose a stock to generate its intraday signal.</span>
          </div>
        </section>
      )}
    </div>
  );
}

function SignalMetric({ label, value }) {
  return (
    <div className="rounded-md border border-line bg-white/60 px-3 py-2">
      <div className="text-xs font-bold uppercase">{label}</div>
      <div className="mobile-safe-text mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function StockList({ rows, title, onPick }) {
  return (
    <div className="mt-4 max-h-64 overflow-auto rounded-md border border-line bg-white shadow-panel">
      <div className="sticky top-0 z-10 border-b border-line bg-paper px-3 py-2 text-xs font-semibold text-stone-600">
        {title}
      </div>
      {rows.map((item) => (
        <button
          key={`${item.symbol}-${item.exchange}`}
          type="button"
          onClick={() => onPick(item.symbol)}
          className="row-hover grid w-full gap-2 border-b border-line px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-paper sm:grid-cols-[1fr_auto]"
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{item.symbol}</span>
              {item.exchange && (
                <span className="rounded-sm border border-line bg-paper px-1.5 py-0.5 text-[11px] font-semibold text-stone-500">
                  {item.exchange}
                </span>
              )}
              {item.source && (
                <span className="rounded-sm border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-cobalt">
                  {item.source}
                </span>
              )}
            </span>
            <span className="mt-1 block truncate text-xs text-stone-500">{item.name}</span>
          </span>
          <span className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3 sm:justify-end">
            {Number.isFinite(item.totalTradedQuantity) && (
              <span className="min-w-0 text-left sm:text-right">
                <span className="block text-xs font-semibold text-stone-500">Week vol</span>
                <span className="mobile-safe-text block font-semibold text-ink">{formatCompact(item.totalTradedQuantity)}</span>
              </span>
            )}
            <span className="min-w-0 text-left sm:text-right">
              <span className="block text-xs font-semibold text-stone-500">Price</span>
              <span className="mobile-safe-text block font-semibold text-ink">{formatPrice(item.currentPrice, item.currency)}</span>
            </span>
            <span className="min-w-0 text-left sm:text-right">
              <span className="block text-xs font-semibold text-stone-500">1D</span>
              <span className={`mobile-safe-text ${returnTone(item.oneDayReturn)}`}>{formatReturn(item.oneDayReturn)}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function entryLabel(action) {
  if (action === 'BUY') return 'Buy at';
  if (action === 'SELL') return 'Sell at';
  return 'Entry';
}

function IntradayReasons({ reasons }) {
  return (
    <section className="panel rounded-lg p-3 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-cobalt" aria-hidden="true" />
        <h3 className="text-base font-semibold text-ink">Intraday Reasons</h3>
      </div>
      {reasons.length ? (
        <div className="space-y-2">
          {reasons.map((reason) => (
            <div key={reason} className="rounded-md border border-line bg-white/70 px-3 py-2 text-sm leading-6 text-stone-700">
              {reason}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-stone-500">
          No strong intraday reason is available yet.
        </div>
      )}
    </section>
  );
}

function IntradayMetrics({ metrics, lastUpdated }) {
  const rows = [
    ['Close', formatPlanPrice(metrics.close)],
    ['VWAP', formatPlanPrice(metrics.vwap)],
    ['EMA 9', formatPlanPrice(metrics.ema9)],
    ['EMA 21', formatPlanPrice(metrics.ema21)],
    ['EMA 50', formatPlanPrice(metrics.ema50)],
    ['RSI 14', formatPlanPrice(metrics.rsi14)],
    ['MACD', formatPlanPrice(metrics.macd)],
    ['MACD signal', formatPlanPrice(metrics.macdSignal)],
    ['Stochastic %K', formatPlanPrice(metrics.stochasticK)],
    ['Stochastic %D', formatPlanPrice(metrics.stochasticD)],
    ['ADX 14', formatPlanPrice(metrics.adx14)],
    ['Opening high', formatPlanPrice(metrics.openingHigh)],
    ['Opening low', formatPlanPrice(metrics.openingLow)],
    ['Volume', Number.isFinite(metrics.volumeRatio) ? `${metrics.volumeRatio}x` : '-'],
    ['Gap', Number.isFinite(metrics.gapPercent) ? `${metrics.gapPercent}%` : '-'],
    ['ATR 14', formatPlanPrice(metrics.atr14)]
  ];

  return (
    <section className="panel rounded-lg p-3 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock3 className="h-5 w-5 text-cobalt" aria-hidden="true" />
        <h3 className="text-base font-semibold text-ink">Intraday Levels</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <SignalMetric key={label} label={label} value={value} />
        ))}
      </div>
      {lastUpdated && (
        <p className="mt-3 text-xs font-semibold text-stone-500">Last updated: {lastUpdated}</p>
      )}
    </section>
  );
}

function formatPlanPrice(value) {
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
    maxLoss: formatPlanPrice(riskAmount)
  };
}

function formatReturn(value) {
  if (!Number.isFinite(value)) return '-';
  return `${value > 0 ? '+' : ''}${value}%`;
}

function formatPrice(value, currency) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return `${currency ? `${currency} ` : ''}${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  })}`;
}

function formatCompact(value) {
  return Number(value || 0).toLocaleString(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  });
}

function returnTone(value) {
  if (value > 0) return 'font-semibold text-mint';
  if (value < 0) return 'font-semibold text-coral';
  return 'font-semibold text-stone-600';
}

export default memo(StockSignalsPage);
