import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Play,
  Search,
  Share2,
  Sparkles,
  Target,
  Zap
} from 'lucide-react';
import { getMostTradedStocks, getStrategies, runMultiStrategyBacktest, searchStocks } from '../services/api.js';
import { ComparisonBarChart, SeriesChart } from './StrategyVisuals.jsx';

const DECISION_STYLES = {
  BUY: 'decision-buy',
  SELL: 'decision-sell',
  HOLD: 'decision-hold',
  NO_CLEAR_SIGNAL: 'decision-hold',
  WAIT: 'decision-wait'
};

function formatDecisionLabel(value) {
  return String(value || '').replace(/_/g, ' ');
}

const PRESETS = [
  {
    id: 'balanced',
    label: 'Balanced',
    strategies: ['box-strategy', 'ema-trend', 'breakout-strategy']
  },
  {
    id: 'breakout',
    label: 'Breakout',
    strategies: ['breakout-strategy', 'volume-breakout', 'momentum-volume']
  },
  {
    id: 'trend',
    label: 'Trend',
    strategies: ['ema-trend', 'sma-crossover', 'macd-strategy']
  },
  {
    id: 'reversal',
    label: 'Reversal',
    strategies: ['box-strategy', 'rsi-strategy', 'bollinger-bands']
  }
];

const RECENT_KEY = 'stock-tester-recent-comparisons';

function MultiStrategyPage() {
  const [symbol, setSymbol] = useState('');
  const [period, setPeriod] = useState('1y');
  const [preset, setPreset] = useState('balanced');
  const [selectedStrategies, setSelectedStrategies] = useState(PRESETS[0].strategies);
  const [availableStrategies, setAvailableStrategies] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [mostTradedStocks, setMostTradedStocks] = useState([]);
  const [recentRuns, setRecentRuns] = useState(() => readRecentRuns());
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

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

  const strategyOptions = useMemo(() => {
    const byName = new Map(availableStrategies.map((strategy) => [strategy.strategyName, strategy]));
    const fallback = PRESETS.flatMap((item) => item.strategies).map((strategyName) => ({
      strategyName,
      displayName: formatStrategyName(strategyName),
      description: ''
    }));

    return availableStrategies.length ? availableStrategies : fallback.filter((item, index, rows) => (
      rows.findIndex((row) => row.strategyName === item.strategyName) === index && byName
    ));
  }, [availableStrategies]);

  const analysis = result?.analysis;
  const aiAnalysis = result?.aiAnalysis;
  const comparison = analysis?.comparison || [];
  const displayedStocks = suggestions.length > 0 ? suggestions : mostTradedStocks;
  const stockListTitle = suggestions.length > 0 ? `${suggestions.length} listed stocks found` : 'Most traded last week';
  const smartSignal = useMemo(() => (
    analysis?.smartSignal || { action: 'HOLD', confidence: 0, explanation: '' }
  ), [analysis]);
  const bestStrategy = useMemo(() => (
    analysis?.recommendedStrategy || analysis?.bestStrategy
  ), [analysis]);
  const selectedPreset = PRESETS.find((item) => item.id === preset) || PRESETS[0];

  const analyze = useCallback(async (nextSymbol = symbol) => {
    const cleanSymbol = nextSymbol.trim().toUpperCase();
    if (loading || !cleanSymbol) return;

    setLoading(true);
    setError('');

    try {
      const payload = await runMultiStrategyBacktest({
        symbol: cleanSymbol,
        period,
        strategyNames: selectedStrategies
      });
      setResult(payload);
      setSymbol(cleanSymbol);
      setSuggestions([]);
      setRecentRuns((current) => saveRecentRun(current, payload));
    } catch (err) {
      setError(err.message || 'Could not compare trading strategies.');
    } finally {
      setLoading(false);
    }
  }, [loading, period, selectedStrategies, symbol]);

  const choosePreset = useCallback((presetId) => {
    const nextPreset = PRESETS.find((item) => item.id === presetId) || PRESETS[0];
    setPreset(nextPreset.id);
    setSelectedStrategies(nextPreset.strategies);
  }, []);

  const toggleStrategy = useCallback((strategyName) => {
    setSelectedStrategies((current) => {
      if (current.includes(strategyName)) {
        return current.length > 1 ? current.filter((item) => item !== strategyName) : current;
      }

      return [...current, strategyName].slice(0, 6);
    });
  }, []);

  const pickStock = useCallback((nextSymbol) => {
    analyze(nextSymbol);
  }, [analyze]);

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

  const exportResult = useCallback(() => {
    if (!result) return;

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.symbol}-${result.period}-strategy-comparison.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const shareResult = useCallback(async () => {
    if (!analysis || !result) return;

    const text = `${result.symbol}: ${smartSignal.action} ${smartSignal.confidence}% strength. Best strategy: ${bestStrategy?.strategyName || '-'}.`;
    if (navigator.share) {
      await navigator.share({ title: 'Strategy comparison', text }).catch(() => {});
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text).catch(() => {});
    }
  }, [analysis, bestStrategy, result, smartSignal]);

  return (
    <div className="flex flex-col gap-5">
      <section className="panel rounded-lg p-3 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-cobalt" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Compare Trading Strategies</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Compare different trading strategies and see which one worked best for this stock.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => choosePreset(item.id)}
                className={`min-h-9 rounded-md border px-3 text-sm font-semibold transition ${
                  preset === item.id ? 'border-cobalt bg-cobalt/10 text-cobalt' : 'border-line bg-white/75 text-stone-600 hover:border-cobalt'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(130px,0.25fr)_auto] lg:items-end">
          <div>
            <label htmlFor="multi-symbol" className="mb-1 block text-sm font-medium text-stone-700">
              Stock
            </label>
            <div className="flex gap-2">
              <input
                id="multi-symbol"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder="Select a stock to compare"
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

          <label>
            <span className="mb-1 block text-sm font-medium text-stone-700">Period</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink lg:w-36"
            >
              <option value="6mo">6 months</option>
              <option value="1y">1 year</option>
              <option value="2y">2 years</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => analyze()}
            disabled={loading}
            className="glow-button inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-md px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {loading ? 'Running' : 'Compare Strategies'}
          </button>
        </div>

        {displayedStocks.length > 0 && (
          <StockList
            rows={displayedStocks}
            title={stockListTitle}
            onPick={pickStock}
          />
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {strategyOptions.slice(0, 12).map((strategy) => {
            const selected = selectedStrategies.includes(strategy.strategyName);
            return (
              <button
                key={strategy.strategyName}
                type="button"
                onClick={() => toggleStrategy(strategy.strategyName)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-bold transition ${
                  selected ? 'border-mint bg-mint/10 text-mint' : 'border-line bg-white/70 text-stone-600 hover:border-cobalt'
                }`}
              >
                {selected && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                {formatStrategyName(strategy.strategyName)}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs font-semibold text-stone-500">
          Active group: {selectedPreset.label} | Checking {selectedStrategies.length} strategies
        </p>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {analysis ? (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <SmartSignalCard
              result={result}
              smartSignal={smartSignal}
              bestStrategy={bestStrategy}
              riskPlan={aiAnalysis?.signal?.tradePlan || analysis.riskPlan}
              aiAnalysis={aiAnalysis}
            />
            <InsightPanel insights={analysis.insights || []} regime={analysis.marketRegime} />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Metric label="Best Strategy" value={bestStrategy?.strategyName || '-'} />
            <Metric label="Win Rate" value={`${bestStrategy?.winRate || 0}%`} />
            <Metric label="Total Profit" value={`${formatSigned(bestStrategy?.totalProfit || bestStrategy?.profitPercentage || 0)}%`} tone={(bestStrategy?.totalProfit || bestStrategy?.profitPercentage || 0) >= 0 ? 'text-mint' : 'text-coral'} />
            <Metric label="Worst Drop" value={`${bestStrategy?.maxDrawdown || bestStrategy?.maximumDrawdown || 0}%`} />
            <Metric label="Risk Reward" value={bestStrategy?.riskRewardRatio || 0} />
            <Metric label="Compared" value={`${comparison.length} strategies`} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <SeriesChart title="Profit Curve" data={analysis.charts?.profitCurve || []} tone="#0f8f63" />
            <SeriesChart title="Worst Drop Graph" data={analysis.charts?.drawdownCurve || []} tone="#d84a3a" suffix="%" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <ComparisonBarChart strategies={comparison} />
            <StrategyComparison strategies={comparison} />
          </section>

          <section className="panel rounded-lg p-3 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-cobalt" aria-hidden="true" />
                <h3 className="text-base font-semibold text-ink">Recent Strategies</h3>
              </div>
              <div className="flex gap-2">
                <IconButton label="Export result" onClick={exportResult}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                </IconButton>
                <IconButton label="Share result" onClick={shareResult}>
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              </div>
            </div>
            <RecentRuns rows={recentRuns} onPick={(row) => analyze(row.symbol)} />
          </section>
        </>
      ) : (
        <section className="panel rounded-lg p-3 sm:p-5">
          <div className="flex items-center gap-2 text-stone-600">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-semibold">Select trading strategies and compare them side by side.</span>
          </div>
        </section>
      )}
    </div>
  );
}

function SmartSignalCard({ result, smartSignal, bestStrategy, riskPlan, aiAnalysis }) {
  const action = aiAnalysis?.signal?.action || smartSignal.action || 'HOLD';
  const confidence = aiAnalysis?.signal?.confidence || smartSignal.confidence;

  return (
    <section className={`decision-card rounded-lg border p-5 ${DECISION_STYLES[action] || DECISION_STYLES.HOLD}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Zap className="h-5 w-5" aria-hidden="true" />
            <h3 className="text-base font-semibold">Final Trade View</h3>
          </div>
          <p className="text-xs font-semibold uppercase">{result.symbol} | {result.period}</p>
          <h2 className="mt-2 text-4xl font-bold sm:text-5xl">{formatDecisionLabel(action)}</h2>
          <p className="mobile-safe-text mt-3 text-sm leading-6">{aiAnalysis?.explanation?.whySignal || smartSignal.explanation}</p>
        </div>
        <div className="rounded-md border border-line bg-white/60 px-4 py-3 text-center sm:shrink-0">
          <div className="text-xs font-bold uppercase">Signal strength</div>
          <div className="mt-1 text-3xl font-bold">{confidence}%</div>
        </div>
      </div>
      <div className="mt-4 rounded-md border border-line bg-white/55 p-3 text-sm font-semibold">
        <span className="mobile-safe-text block">Best strategy for this stock = {bestStrategy?.strategyName || '-'} based on past data.</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <PlanMetric label={entryLabel(action)} value={formatPlanPrice(riskPlan?.entry)} />
        <PlanMetric label="Stoploss" value={formatPlanPrice(riskPlan?.stopLoss)} />
        <PlanMetric label="Target 1" value={formatPlanPrice(riskPlan?.target1 || riskPlan?.targets?.[0])} />
        <PlanMetric label="Target 2" value={formatPlanPrice(riskPlan?.target2 || riskPlan?.targets?.[1])} />
        <PlanMetric label="Target 3" value={formatPlanPrice(riskPlan?.target3 || riskPlan?.target || riskPlan?.targets?.[2])} />
        <PlanMetric label="Risk reward" value={riskPlan?.riskReward || '-'} />
      </div>
      {riskPlan?.note && (
        <div className="mobile-safe-text mt-4 rounded-md border border-line bg-white/55 px-3 py-2 text-sm font-semibold">
          {riskPlan.note}
        </div>
      )}
      {aiAnalysis && <AiScorePanel aiAnalysis={aiAnalysis} />}
    </section>
  );
}

function AiScorePanel({ aiAnalysis }) {
  const score = aiAnalysis.rankingScore || {};
  const ml = aiAnalysis.ml || {};
  const levelOne = aiAnalysis.signal?.levels?.level1 || ml.level1Filter || {};
  const levelThree = aiAnalysis.signal?.levels?.level3 || aiAnalysis.sentiment || {};
  const headlines = (levelThree.headlines || []).slice(0, 3);

  return (
    <div className="mt-4 rounded-md border border-line bg-white/55 p-3">
      <div className="mb-2 text-xs font-bold uppercase">Overall stock score</div>
      <div className="grid gap-2 text-sm font-semibold sm:grid-cols-5">
        <span>Total {score.total}/100</span>
        <span>Chart {score.technical}</span>
        <span>Company {score.fundamental}</span>
        <span>Price model {score.ml}</span>
        <span>News mood {score.sentiment}</span>
      </div>
      <p className="mobile-safe-text mt-2 text-xs font-semibold">
        Price model check: {ml.validation?.accuracy || 0}% accuracy over {ml.validation?.samples || 0} past samples.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-white/65 px-3 py-2">
          <div className="text-xs font-bold uppercase">Level 1 XGBoost filter</div>
          <div className="mobile-safe-text mt-1 text-sm font-semibold">
            {levelOne.status || 'UNKNOWN'} | {levelOne.probability || 0}% follow-through
          </div>
          <p className="mobile-safe-text mt-1 text-xs leading-5 text-stone-600">
            {levelOne.reason || 'No Level 1 filter result is available.'}
          </p>
        </div>
        <div className="rounded-md border border-line bg-white/65 px-3 py-2">
          <div className="text-xs font-bold uppercase">Level 3 FinBERT context</div>
          <div className="mobile-safe-text mt-1 text-sm font-semibold">
            {levelThree.direction || 'NEUTRAL'} | {levelThree.score ?? levelThree.contextScore ?? 50}/100
          </div>
          <p className="mobile-safe-text mt-1 text-xs leading-5 text-stone-600">
            Model: {levelThree.model || 'news sentiment unavailable'}
          </p>
        </div>
      </div>
      {headlines.length > 0 && (
        <div className="mt-3 space-y-2">
          {headlines.map((headline) => (
            <div key={`${headline.title}-${headline.providerPublishTime || headline.link}`} className="rounded-md border border-line bg-white/65 px-3 py-2 text-xs leading-5 text-stone-700">
              <span className="font-bold">{headline.finbertLabel || 'NEWS'}</span>
              {Number.isFinite(headline.finbertConfidence) && <span> {headline.finbertConfidence}%</span>}
              <span className="mobile-safe-text block">{headline.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanMetric({ label, value }) {
  return (
    <div className="rounded-md border border-line bg-white/60 px-3 py-2">
      <div className="text-xs font-bold uppercase">{label}</div>
      <div className="mobile-safe-text mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function entryLabel(action) {
  if (action === 'BUY') return 'Buy at';
  if (action === 'SELL') return 'Sell at';
  return 'Entry';
}

function formatPlanPrice(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function InsightPanel({ insights, regime }) {
  return (
    <section className="panel rounded-lg p-3 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-cobalt" aria-hidden="true" />
        <h3 className="text-base font-semibold text-ink">Result Insight Panel</h3>
      </div>
      <div className="mb-3 rounded-md border border-line bg-white/70 px-3 py-2 text-sm font-bold capitalize text-ink">
        Market type: {regime || 'unknown'}
      </div>
      <div className="space-y-2">
        {insights.map((insight) => (
          <div key={insight} className="rounded-md border border-line bg-white/70 px-3 py-2 text-sm leading-6 text-stone-700">
            {insight}
          </div>
        ))}
      </div>
    </section>
  );
}

function StrategyComparison({ strategies }) {
  return (
    <section className="panel rounded-lg p-3 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-cobalt" aria-hidden="true" />
        <h3 className="text-base font-semibold text-ink">Strategy Comparison</h3>
      </div>
      <div className="table-scroll rounded-md border border-line">
        <table className="min-w-[880px] w-full bg-white text-sm">
          <thead className="bg-paper text-left text-xs uppercase text-stone-500">
            <tr>
              <Th>Strategy</Th>
              <Th>Result</Th>
              <Th>Win Rate</Th>
              <Th>Total Profit</Th>
              <Th>Worst Drop</Th>
              <Th>Risk Reward</Th>
              <Th>Score</Th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((strategy) => (
              <tr key={strategy.strategyName} className={strategy.recommended ? 'border-t border-line bg-mint/5' : 'row-hover border-t border-line hover:bg-paper'}>
                <Td>
                  <span className="font-semibold text-ink">{strategy.label}: {strategy.strategyName}</span>
                  {strategy.recommended && (
                    <span className="ml-2 rounded-sm bg-mint/10 px-1.5 py-0.5 text-[11px] font-bold text-mint">
                      Best Strategy
                    </span>
                  )}
                </Td>
                <Td>{strategy.latestDirection}</Td>
                <Td>{strategy.winRate}%</Td>
                <Td className={strategy.totalProfit >= 0 ? 'font-semibold text-mint' : 'font-semibold text-coral'}>
                  {formatSigned(strategy.totalProfit)}%
                </Td>
                <Td>{strategy.maxDrawdown}%</Td>
                <Td>{strategy.riskRewardRatio}</Td>
                <Td>{strategy.rankScore}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentRuns({ rows, onPick }) {
  if (!rows.length) {
    return <div className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-stone-500">Recent comparisons will appear here.</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {rows.map((row) => (
        <button
          key={`${row.symbol}-${row.createdAt}`}
          type="button"
          onClick={() => onPick(row)}
          className="row-hover rounded-md border border-line bg-white/70 p-3 text-left"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-ink">{row.symbol}</span>
            <span className={row.action === 'BUY' ? 'text-mint' : row.action === 'SELL' ? 'text-coral' : 'text-amber'}>
              {row.action}
            </span>
          </div>
          <div className="mt-2 text-xs font-semibold text-stone-500">{row.bestStrategy}</div>
        </button>
      ))}
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

function Metric({ label, value, tone = 'text-ink' }) {
  return (
    <div className="panel stat-card rounded-lg p-4">
      <div className="text-xs font-semibold uppercase text-stone-500">{label}</div>
      <div className={`mobile-safe-text mt-2 text-xl font-bold sm:text-2xl ${tone}`}>{value}</div>
    </div>
  );
}

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white/70 text-stone-700 transition hover:border-cobalt hover:text-cobalt"
    >
      {children}
    </button>
  );
}

function Th({ children }) {
  return <th className="whitespace-nowrap px-3 py-3 font-semibold">{children}</th>;
}

function Td({ children, className = '' }) {
  return <td className={`px-3 py-3 align-top text-stone-700 ${className}`}>{children}</td>;
}

function readRecentRuns() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecentRun(current, payload) {
  const analysis = payload.analysis || {};
  const next = [
    {
      symbol: payload.symbol,
      period: payload.period,
      action: analysis.smartSignal?.action || 'HOLD',
      bestStrategy: analysis.recommendedStrategy?.strategyName || analysis.bestStrategy?.strategyName || '-',
      createdAt: new Date().toISOString()
    },
    ...current
  ].slice(0, 6);

  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

function formatStrategyName(strategyName) {
  const acronyms = new Map([
    ['rsi', 'RSI'],
    ['sma', 'SMA'],
    ['ema', 'EMA'],
    ['macd', 'MACD']
  ]);

  return String(strategyName || '')
    .split('-')
    .filter(Boolean)
    .map((part) => acronyms.get(part) || part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSigned(value) {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${number}`;
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

export default memo(MultiStrategyPage);
