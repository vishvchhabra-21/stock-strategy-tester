import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Play, PlusCircle, RefreshCcw } from 'lucide-react';
import FutureStrategies from './components/FutureStrategies.jsx';
import MarketClock from './components/MarketClock.jsx';
import ParameterPanel from './components/ParameterPanel.jsx';
import SignalCard from './components/SignalCard.jsx';
import SignalTable from './components/SignalTable.jsx';
import StatsGrid from './components/StatsGrid.jsx';
import TickerTape from './components/TickerTape.jsx';
import { getMostTradedStocks, runBoxBacktest, runStrategyBacktest, searchStocks, addCustomStrategy, getCustomStrategies, getStrategies } from './services/api.js';

const CandlestickChart = lazy(() => import('./components/CandlestickChart.jsx'));
const IntradayScannerPage = lazy(() => import('./components/IntradayScannerPage.jsx'));
const MultiStrategyPage = lazy(() => import('./components/MultiStrategyPage.jsx'));
const StockSignalsPage = lazy(() => import('./components/StockSignalsPage.jsx'));

const DEFAULT_FORM = {
  symbol: '',
  period: '1y',
  boxTolerance: '0.10',
  wickRatio: '2',
  volumeMultiplier: '1.5'
};

const PAGES = [
  { id: 'box', code: 'BT', label: 'Backtest' },
  { id: 'multi', code: 'CMP', label: 'Compare' },
  { id: 'signals', code: 'DESK', label: 'Signal Desk' },
  { id: 'scanner', code: 'SCAN', label: 'Scanner' }
];

export default function App() {
  const [activePage, setActivePage] = useState('box');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [result, setResult] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [mostTradedStocks, setMostTradedStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [availableStrategies, setAvailableStrategies] = useState([]);
  const [customStrategies, setCustomStrategies] = useState([]);
  const [customForm, setCustomForm] = useState({ name: '', description: '' });
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [testingStrategyName, setTestingStrategyName] = useState('');

  const requestPayload = useMemo(() => ({
    symbol: form.symbol,
    period: form.period,
    boxTolerance: Number(form.boxTolerance),
    wickRatio: Number(form.wickRatio),
    volumeMultiplier: Number(form.volumeMultiplier)
  }), [form]);

  useEffect(() => {
    let cancelled = false;

    async function loadMostTradedStocks() {
      try {
        const results = await getMostTradedStocks(40);

        if (!cancelled) {
          setMostTradedStocks(results);
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
    let cancelled = false;

    async function loadStrategies() {
      try {
        const rows = await getStrategies();
        if (!cancelled) {
          setAvailableStrategies(rows);
        }
      } catch {
        if (!cancelled) {
          setAvailableStrategies([]);
        }
      }
    }

    loadStrategies();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomStrategies() {
      try {
        const rows = await getCustomStrategies();
        if (!cancelled) {
          setCustomStrategies(rows);
        }
      } catch {
        if (!cancelled) {
          setCustomStrategies([]);
        }
      }
    }

    loadCustomStrategies();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateForm = useCallback((key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }, []);

  const runBacktest = useCallback(async (event) => {
    event?.preventDefault();
    if (loading) {
      return;
    }

    setError('');
    setLoading(true);

    try {
      const data = await runBoxBacktest(requestPayload);
      setResult(data);
      setSuggestions([]);
    } catch (err) {
      setError(err.message || 'Could not run backtest');
    } finally {
      setLoading(false);
    }
  }, [loading, requestPayload]);

  const handleSearch = useCallback(async () => {
    if (!form.symbol.trim()) {
      return;
    }

    setSearching(true);
    setError('');

    try {
      const results = await searchStocks(form.symbol);
      setSuggestions(results);
    } catch (err) {
      setError(err.message || 'Could not search symbols');
    } finally {
      setSearching(false);
    }
  }, [form.symbol]);

  async function handleAddCustomStrategy(event) {
    event.preventDefault();
    if (savingStrategy || loading) return;

    setSavingStrategy(true);
    setError('');

    try {
      const payload = await addCustomStrategy(customForm);
      setCustomStrategies(payload.strategies || []);
      setCustomForm({ name: '', description: '' });
      try {
        setAvailableStrategies(await getStrategies());
      } catch {
        setAvailableStrategies((current) => current);
      }
    } catch (err) {
      setError(err.message || 'Could not add your trading method');
    } finally {
      setSavingStrategy(false);
    }
  }

  const pickSuggestion = useCallback((symbol) => {
    updateForm('symbol', symbol);
    setSuggestions([]);
  }, [updateForm]);

  const pickFromTape = useCallback((symbol) => {
    updateForm('symbol', symbol);
    setSuggestions([]);
    setActivePage('box');
  }, [updateForm]);

  const testStrategy = useCallback(async (strategy) => {
    if (loading || !form.symbol.trim()) {
      return;
    }

    const strategyParameters = strategy.strategyName === 'box-strategy'
      ? {
          boxTolerance: Number(form.boxTolerance),
          wickRatio: Number(form.wickRatio),
          volumeMultiplier: Number(form.volumeMultiplier)
        }
      : strategy.defaultParameters || {};

    setError('');
    setLoading(true);
    setTestingStrategyName(strategy.strategyName);

    try {
      const data = await runStrategyBacktest(strategy.strategyName, {
        symbol: form.symbol.trim().toUpperCase(),
        period: form.period,
        parameters: strategyParameters
      });
      setResult(data);
      setSuggestions([]);
    } catch (err) {
      setError(err.message || `Could not check ${strategy.displayName || strategy.strategyName}`);
    } finally {
      setLoading(false);
      setTestingStrategyName('');
    }
  }, [form, loading]);

  return (
    <main className="min-h-screen bg-void text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-void">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:gap-x-5 sm:px-6 lg:px-8">
          <BrandMark />

          <nav className="order-3 -mx-3 flex basis-full gap-1 overflow-x-auto border-t border-line px-3 pt-1.5 sm:mx-0 sm:basis-auto md:order-2 md:border-0 md:pt-0" aria-label="Desk functions">
            {PAGES.map((page) => (
              <PageButton
                key={page.id}
                code={page.code}
                active={activePage === page.id}
                onClick={() => setActivePage(page.id)}
              >
                {page.label}
              </PageButton>
            ))}
          </nav>

          <div className="order-2 ml-auto md:order-3">
            <MarketClock />
          </div>
        </div>
      </header>

      <TickerTape rows={mostTradedStocks} onPick={pickFromTape} />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-5 sm:gap-5 sm:px-6 lg:px-8">
        {activePage === 'box' ? (
          <div className="page-enter flex flex-col gap-4 sm:gap-5">
            <ParameterPanel
              form={form}
              onFormChange={updateForm}
              onSubmit={runBacktest}
              loading={loading}
              searching={searching}
              suggestions={suggestions}
              mostTradedStocks={mostTradedStocks}
              onPickSuggestion={pickSuggestion}
              onSearch={handleSearch}
            />

            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-down/35 bg-down/10 px-4 py-3 text-sm">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-down" aria-hidden="true" />
                <div className="flex-1 text-dim">{error}</div>
                <button
                  type="button"
                  title="Retry backtest"
                  onClick={runBacktest}
                  disabled={loading}
                  className="btn-ghost h-8 w-8"
                >
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            <SignalCard result={result} />
            {result && <StatsGrid summary={result.summary} />}
            {result && (
              <Suspense fallback={<PanelLoader label="Loading chart" />}>
                <CandlestickChart data={result.chartData} />
              </Suspense>
            )}
            {result && <SignalTable signals={result.signals || []} />}

            <section className="panel p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="tag">BT · Strategy library</span>
                <span className="font-mono text-xs text-faint">{availableStrategies.length} methods</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {availableStrategies.map((strategy) => (
                  <StrategyCard
                    key={strategy.strategyName}
                    strategy={strategy}
                    loading={loading}
                    testing={testingStrategyName === strategy.strategyName}
                    onTest={testStrategy}
                  />
                ))}
              </div>

              {availableStrategies.length === 0 && (
                <div className="rounded-md border border-dashed border-line bg-well px-4 py-3 text-sm text-dim">
                  No trading methods are available from the backend yet. Start the backend to load the library.
                </div>
              )}
            </section>

            <section className="panel p-4 sm:p-5">
              <div className="mb-4">
                <span className="tag">BT · Add your own method</span>
                <p className="mt-2 text-sm leading-6 text-dim">
                  Describe a rule in plain words and the desk turns it into a testable method.
                </p>
              </div>

              <form onSubmit={handleAddCustomStrategy} className="grid gap-4 lg:grid-cols-[0.7fr_1.5fr_auto]">
                <label>
                  <span className="mb-1 block font-mono text-[11px] font-semibold uppercase tracking-widest text-faint">Method name</span>
                  <input
                    value={customForm.name}
                    onChange={(event) => setCustomForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="My RSI pullback"
                    className="min-h-11 w-full px-3 text-sm"
                  />
                </label>

                <label>
                  <span className="mb-1 block font-mono text-[11px] font-semibold uppercase tracking-widest text-faint">How it works</span>
                  <textarea
                    value={customForm.description}
                    onChange={(event) => setCustomForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Example: Buy when RSI is oversold and price breaks above the 20 day moving average with strong volume. Sell when RSI is overbought or price breaks support."
                    rows={3}
                    className="min-h-24 w-full resize-y px-3 py-2 text-sm leading-6"
                  />
                </label>

                <button
                  type="submit"
                  disabled={savingStrategy || loading}
                  className="btn-amber min-h-11 self-end px-5 text-sm"
                >
                  <PlusCircle className="h-4 w-4" aria-hidden="true" />
                  {savingStrategy ? 'Adding…' : 'Add method'}
                </button>
              </form>

              {customStrategies.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-faint">{customStrategies.length} custom:</span>
                  {customStrategies.map((strategy) => (
                    <span key={strategy.id} className="rounded border border-line bg-well px-2.5 py-1 font-mono text-xs font-semibold text-dim">
                      {strategy.displayName}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <FutureStrategies />
          </div>
        ) : activePage === 'multi' ? (
          <div className="page-enter">
            <Suspense fallback={<PanelLoader label="Loading strategy comparison" />}>
              <MultiStrategyPage />
            </Suspense>
          </div>
        ) : activePage === 'signals' ? (
          <div className="page-enter">
            <Suspense fallback={<PanelLoader label="Loading signal desk" />}>
              <StockSignalsPage />
            </Suspense>
          </div>
        ) : (
          <div className="page-enter">
            <Suspense fallback={<PanelLoader label="Loading intraday scanner" />}>
              <IntradayScannerPage />
            </Suspense>
          </div>
        )}

        <footer className="mt-2 flex flex-col gap-2 border-t border-line pt-4 font-mono text-[11px] text-faint sm:flex-row sm:items-center sm:justify-between">
          <span>SOURTRADES — for learning and trade planning · not financial advice</span>
          <span>Data: Yahoo Finance · NSE · Groww</span>
        </footer>
      </div>
    </main>
  );
}

function BrandMark() {
  return (
    <div className="order-1 flex min-w-0 items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <rect width="32" height="32" rx="7" fill="#FFB52E" />
        <line x1="11" y1="5" x2="11" y2="27" stroke="#0A0E16" strokeWidth="2" />
        <rect x="7" y="10" width="8" height="10" rx="1.5" fill="#0A0E16" />
        <line x1="22" y1="8" x2="22" y2="24" stroke="#0A0E16" strokeWidth="2" />
        <rect x="18" y="13" width="8" height="7" rx="1.5" fill="none" stroke="#0A0E16" strokeWidth="2" />
      </svg>
      <div className="min-w-0 leading-none">
        <span className="font-display text-xl font-bold uppercase tracking-wider text-ink">
          Sour<span className="text-amber">Trades</span>
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-faint lg:block lg:pt-1">
          Test the trade before you take it
        </span>
      </div>
    </div>
  );
}

const StrategyCard = memo(function StrategyCard({ strategy, loading, testing, onTest }) {
  const sourceLabel = strategy.source === 'custom' ? 'Custom' : 'Built-in';
  const parameterText = formatParameters(strategy.defaultParameters);

  return (
    <div className="flex min-h-44 min-w-0 flex-col justify-between rounded-md border border-line bg-well p-3 transition hover:border-amber/60 sm:p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="mobile-safe-text text-sm font-semibold text-ink">{strategy.displayName || formatStrategyName(strategy.strategyName)}</h3>
            <p className="mobile-safe-text mt-1 text-xs leading-5 text-dim">{strategy.description}</p>
          </div>
          <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
            strategy.source === 'custom' ? 'border-amber/40 text-amber' : 'border-line text-faint'
          }`}>
            {sourceLabel}
          </span>
        </div>

        {parameterText && (
          <p className="mobile-safe-text mt-3 font-mono text-[11px] leading-5 text-faint">
            {parameterText}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onTest(strategy)}
        disabled={loading}
        className="btn-ghost mt-4 min-h-10 px-3 text-sm font-semibold"
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        {testing ? 'Testing…' : 'Test on this stock'}
      </button>
    </div>
  );
});

function PanelLoader({ label }) {
  return (
    <section className="panel p-4 sm:p-5">
      <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-line bg-well font-mono text-sm text-faint">
        {label}…
      </div>
    </section>
  );
}

function formatStrategyName(strategyName) {
  const acronyms = new Map([
    ['rsi', 'RSI'],
    ['sma', 'SMA'],
    ['ema', 'EMA'],
    ['macd', 'MACD']
  ]);

  return String(strategyName || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split('-')
    .filter(Boolean)
    .map((part) => acronyms.get(part.toLowerCase()) || part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatParameters(parameters = {}) {
  const entries = Object.entries(parameters);
  if (!entries.length) {
    return '';
  }

  return entries
    .map(([key, value]) => `${formatStrategyName(key)}: ${value}`)
    .join(' · ');
}

function PageButton({ code, active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
        active ? 'text-ink' : 'text-faint hover:text-dim'
      }`}
    >
      <span className={`font-mono text-[10px] font-bold tracking-widest ${active ? 'text-amber' : 'text-faint'}`}>
        {code}
      </span>
      {children}
      <span
        aria-hidden="true"
        className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition ${active ? 'bg-amber' : 'bg-transparent'}`}
      />
    </button>
  );
}
