import { memo, useCallback, useState } from 'react';
import { AlertTriangle, RefreshCcw, ScanSearch, TrendingDown, TrendingUp } from 'lucide-react';
import { scanIntradayStocks } from '../services/api.js';

const ACTION_STYLES = {
  BUY: 'border-green-200 bg-green-50 text-green-800',
  SELL: 'border-red-200 bg-red-50 text-red-800'
};

function IntradayScannerPage() {
  const [exchange, setExchange] = useState('ALL');
  const [scanLimit, setScanLimit] = useState(80);
  const [resultLimit, setResultLimit] = useState(20);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runScan = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    setError('');

    try {
      setResult(await scanIntradayStocks({
        exchange,
        scanLimit,
        limit: resultLimit
      }));
    } catch (err) {
      setError(err.message || 'Could not scan intraday stocks.');
    } finally {
      setLoading(false);
    }
  }, [exchange, loading, resultLimit, scanLimit]);

  return (
    <div className="flex flex-col gap-5">
      <section className="panel rounded-lg p-3 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ScanSearch className="h-5 w-5 text-cobalt" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">NSE/BSE Intraday Scanner</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Scans stocks and shows simple BUY or SELL ideas for tomorrow or for the live market.
            </p>
          </div>
          <button
            type="button"
            onClick={runScan}
            disabled={loading}
            className="glow-button inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loading ? 'Scanning' : 'Run Scanner'}
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label>
            <span className="mb-1 block text-sm font-medium text-stone-700">Exchange</span>
            <select
              value={exchange}
              onChange={(event) => setExchange(event.target.value)}
              className="min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
            >
              <option value="ALL">NSE + BSE</option>
              <option value="NSE">NSE only</option>
              <option value="BSE">BSE only</option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-stone-700">Scan depth</span>
            <select
              value={scanLimit}
              onChange={(event) => setScanLimit(Number(event.target.value))}
              className="min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
            >
              <option value={80}>Fast 80</option>
              <option value={150}>Deeper 150</option>
              <option value={300}>Wide 300</option>
              <option value={500}>Max 500</option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-stone-700">Show results</span>
            <select
              value={resultLimit}
              onChange={(event) => setResultLimit(Number(event.target.value))}
              className="min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
            >
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
            </select>
          </label>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <>
          <section className="panel rounded-lg p-3 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Mode" value={result.label} />
              <Metric label="Market time" value={result.marketTimeIst} />
              <Metric label="Universe" value={`${result.totalUniverse || 0} stocks`} />
              <Metric label="Scanned" value={`${result.scannedCount || 0} stocks`} />
              <Metric label="Found" value={`${result.resultCount || 0} setups`} />
            </div>
          </section>

          <section className="panel rounded-lg p-3 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-ink">{result.label}</h3>
              <span className="text-xs font-semibold uppercase text-stone-500">{result.generatedFor}</span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {(result.candidates || []).map((candidate) => (
                <CandidateCard key={`${candidate.symbol}-${candidate.action}`} candidate={candidate} />
              ))}
            </div>

            {(!result.candidates || result.candidates.length === 0) && (
              <div className="rounded-md border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-stone-700">
                No high-quality BUY or SELL setups were found in this scan depth.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function CandidateCard({ candidate }) {
  const isBuy = candidate.action === 'BUY';
  const Icon = isBuy ? TrendingUp : TrendingDown;

  return (
    <article className="rounded-lg border border-line bg-white/75 p-3 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mobile-safe-text text-base font-bold text-ink">{candidate.symbol}</span>
            <span className="rounded-sm border border-line bg-paper px-1.5 py-0.5 text-[11px] font-semibold text-stone-500">
              {candidate.exchange}
            </span>
          </div>
          <p className="mobile-safe-text mt-1 text-xs text-stone-500">{candidate.name}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${ACTION_STYLES[candidate.action]}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {candidate.action}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label={isBuy ? 'Buy at' : 'Sell at'} value={formatPrice(candidate.entry)} compact />
        <Metric label="Stoploss" value={formatPrice(candidate.stopLoss)} compact />
        <Metric label="Target 1" value={formatPrice(candidate.target1)} compact />
        <Metric label="Target 2" value={formatPrice(candidate.target2)} compact />
        <Metric label="Target 3" value={formatPrice(candidate.target3 || candidate.target)} compact />
        <Metric label="R:R" value={candidate.riskReward || '-'} compact />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold text-stone-500">
            <span>Strength {candidate.confidence}%</span>
        <span>Score {candidate.score}</span>
        <span>Close {formatPrice(candidate.latestClose)}</span>
      </div>
      {candidate.aiAnalysis && (
        <div className="mt-3 grid grid-cols-4 gap-2 text-xs font-semibold text-stone-500">
          <span>Chart {candidate.technicalScore}</span>
          <span>Company {candidate.fundamentalScore}</span>
          <span>Model {candidate.mlScore}</span>
          <span>News {candidate.sentimentScore}</span>
        </div>
      )}

      <p className="mobile-safe-text mt-3 text-sm leading-6 text-stone-700">{candidate.reason}</p>
      {candidate.note && (
        <p className="mobile-safe-text mt-2 text-xs font-semibold text-stone-500">{candidate.note}</p>
      )}
    </article>
  );
}

function Metric({ label, value, compact = false }) {
  return (
    <div className={`rounded-md border border-line bg-white/70 px-3 py-2 ${compact ? '' : 'shadow-sm'}`}>
      <div className="text-[11px] font-bold uppercase text-stone-500">{label}</div>
      <div className="mobile-safe-text mt-1 text-sm font-bold text-ink">{value}</div>
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

export default memo(IntradayScannerPage);
