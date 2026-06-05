import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Moon, Play, RefreshCcw, Sun, PlusCircle, Target } from 'lucide-react';
import FutureStrategies from './components/FutureStrategies.jsx';
import ParameterPanel from './components/ParameterPanel.jsx';
import SignalCard from './components/SignalCard.jsx';
import SignalTable from './components/SignalTable.jsx';
import StatsGrid from './components/StatsGrid.jsx';
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

export default function App() {
  const [activePage, setActivePage] = useState('box');
  const [theme, setTheme] = useState(() => localStorage.getItem('stock-tester-theme') || 'dark');
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
    localStorage.setItem('stock-tester-theme', theme);
  }, [theme]);

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
    <main className="app-shell min-h-screen" data-theme={theme}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:px-8">
        <header className="hero-panel flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow-pill text-xs font-semibold uppercase text-cobalt sm:text-sm">Stock Market Helper</p>
            <h1 className="gradient-title mt-3 text-2xl font-bold sm:text-4xl">
              Simple Stock Signals And Trade Planning
            </h1>
          </div>
          <div className="flex min-w-0 flex-col gap-3 lg:items-end">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <nav className="nav-shell grid w-full grid-cols-2 rounded-lg border border-line bg-white/80 p-1 sm:w-auto lg:grid-cols-4">
                <PageButton active={activePage === 'box'} onClick={() => setActivePage('box')}>
                  Strategy Back Tester
                </PageButton>
                <PageButton active={activePage === 'multi'} onClick={() => setActivePage('multi')}>
                  Compare Strategies
                </PageButton>
                <PageButton active={activePage === 'signals'} onClick={() => setActivePage('signals')}>
                  Stock Signals
                </PageButton>
                <PageButton active={activePage === 'scanner'} onClick={() => setActivePage('scanner')}>
                  Intraday Scanner
                </PageButton>
              </nav>
              <button
                type="button"
                onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
                className="nav-shell grid h-11 w-full place-items-center rounded-lg border border-line bg-white/80 text-ink transition hover:bg-paper sm:w-11"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </header>

        {activePage === 'box' ? (
          <div className="page-enter flex flex-col gap-5">
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

            <section className="panel rounded-lg p-3 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-cobalt" aria-hidden="true" />
                <h2 className="text-base font-semibold text-ink">Add Your Own Method</h2>
              </div>

              <form onSubmit={handleAddCustomStrategy} className="grid gap-4 lg:grid-cols-[0.7fr_1.5fr_auto]">
                <label>
                  <span className="mb-1 block text-sm font-medium text-stone-700">Method name</span>
                  <input
                    value={customForm.name}
                    onChange={(event) => setCustomForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="My RSI Pullback"
                    className="min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-medium text-stone-700">How it works</span>
                  <textarea
                    value={customForm.description}
                    onChange={(event) => setCustomForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Example: Buy when RSI is oversold and price breaks above the 20 day moving average with strong volume. Sell when RSI is overbought or price breaks support."
                    rows={3}
                    className="min-h-24 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink"
                  />
                </label>

                <button
                  type="submit"
                  disabled={savingStrategy || loading}
                  className="glow-button inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-md px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <PlusCircle className="h-4 w-4" aria-hidden="true" />
                  {savingStrategy ? 'Adding' : 'Add'}
                </button>
              </form>

              {customStrategies.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="text-xs font-semibold text-stone-500">{customStrategies.length} custom strategies:</span>
                  {customStrategies.map((strategy) => (
                    <span key={strategy.id} className="rounded-md border border-line bg-white/70 px-2.5 py-1 text-xs font-semibold text-stone-600">
                      {strategy.displayName}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="panel rounded-lg p-3 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Target className="h-5 w-5 text-cobalt" aria-hidden="true" />
                <h2 className="text-base font-semibold text-ink">Available Trading Methods</h2>
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
                <div className="rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-stone-600">
                  No trading methods are available from the backend yet.
                </div>
              )}
            </section>

            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="flex-1">{error}</div>
                <button
                  type="button"
                  title="Retry"
                  onClick={runBacktest}
                  disabled={loading}
                  className="grid h-8 w-8 place-items-center rounded-md border border-red-200 bg-white text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            <SignalCard result={result} />
            <StatsGrid summary={result?.summary} />
            <Suspense fallback={<PanelLoader label="Loading chart" />}>
              <CandlestickChart data={result?.chartData} />
            </Suspense>
            <SignalTable signals={result?.signals || []} />
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
            <Suspense fallback={<PanelLoader label="Loading stock signals" />}>
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
      </div>
    </main>
  );
}

const StrategyCard = memo(function StrategyCard({ strategy, loading, testing, onTest }) {
  const sourceLabel = strategy.source === 'custom' ? 'Custom' : 'Built-in';
  const badgeClass = strategy.source === 'custom'
    ? 'border-blue-100 bg-blue-50 text-cobalt'
    : 'border-green-100 bg-green-50 text-green-700';
  const parameterText = formatParameters(strategy.defaultParameters);

  return (
    <div className="flex min-h-48 min-w-0 flex-col justify-between rounded-lg border border-line bg-white/70 p-3 transition hover:border-cobalt hover:bg-white sm:p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="mobile-safe-text font-semibold text-ink">{strategy.displayName || formatStrategyName(strategy.strategyName)}</h3>
            <p className="mobile-safe-text mt-1 text-xs text-stone-500">{strategy.description}</p>
          </div>
          <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
            {sourceLabel}
          </span>
        </div>

        {parameterText && (
          <p className="mobile-safe-text mt-3 text-[11px] font-medium leading-5 text-stone-500">
            {parameterText}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onTest(strategy)}
        disabled={loading}
        className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cobalt/30 bg-cobalt/10 px-3 text-sm font-semibold text-cobalt transition hover:border-cobalt hover:bg-cobalt/15 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        {testing ? 'Testing' : 'Test'}
      </button>
    </div>
  );
});

function PanelLoader({ label }) {
  return (
    <section className="panel rounded-lg p-3 sm:p-5">
      <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-line bg-paper text-sm font-semibold text-stone-500">
        {label}
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
    .join(' | ');
}

function PageButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mobile-safe-text min-h-10 rounded-md px-1.5 text-center text-[11px] font-semibold leading-4 transition sm:min-h-9 sm:px-3 sm:text-sm ${
        active ? 'nav-active text-white' : 'text-stone-600 hover:bg-paper hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
