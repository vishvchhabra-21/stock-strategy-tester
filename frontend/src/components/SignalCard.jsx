import { Activity, BarChart3, Gauge } from 'lucide-react';
import { memo } from 'react';
import SignalBadge from './SignalBadge.jsx';

function SignalCard({ result }) {
  if (!result) {
    return (
      <section className="panel rounded-lg p-3 sm:p-5">
        <div className="flex items-center gap-2 text-stone-600">
          <Activity className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-semibold">Waiting For Stock Check</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Enter a stock code and check it to see the latest signal, confidence, and past results.
        </p>
      </section>
    );
  }

  const latest = result.signals?.[result.signals.length - 1];
  const metrics = latest ? latestMetrics(latest) : [];

  return (
    <section className="panel rounded-lg p-3 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow-pill text-xs font-semibold uppercase text-cobalt">{result.symbol}</p>
          {result.strategy?.strategyName && (
            <p className="mt-2 text-xs font-semibold uppercase text-stone-500">{result.strategy.strategyName}</p>
          )}
          <h2 className="mobile-safe-text mt-1 text-xl font-bold text-ink sm:text-2xl">{result.latestSignal}</h2>
          {latest && (
            <div className="mt-3">
              <SignalBadge type={latest.signalType} label={latest.label} />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-white/75 px-4 py-3 shadow-panel">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-600">
            <Gauge className="h-4 w-4" aria-hidden="true" />
            Signal strength
          </div>
          <div className="gradient-title mt-1 text-3xl font-bold">{result.confidence}</div>
        </div>
      </div>

      <p className="mobile-safe-text mt-4 text-sm leading-6 text-stone-700">{result.explanation}</p>

      {metrics.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <Metric key={metric.label} icon={metric.icon} label={metric.label} value={metric.value} />
          ))}
        </div>
      )}
    </section>
  );
}

export default memo(SignalCard);

function latestMetrics(signal) {
  const candidates = [
    { label: 'Zone', value: signal.zone ? signal.zone.replace('-', ' ') : null, icon: <BarChart3 className="h-4 w-4" /> },
    { label: 'RSI', value: formatOptionalNumber(signal.rsi) },
    { label: 'MACD', value: formatOptionalNumber(signal.macd) },
    { label: 'Stochastic %K', value: formatOptionalNumber(signal.stochasticK) },
    { label: 'Volume', value: Number.isFinite(signal.volumeRatio) ? `${signal.volumeRatio}x avg` : null },
    { label: 'Gap', value: Number.isFinite(signal.gapPercent) ? `${signal.gapPercent}%` : null },
    { label: 'Support', value: formatOptionalNumber(signal.support || signal.support1) },
    { label: 'Resistance', value: formatOptionalNumber(signal.resistance || signal.resistance1) },
    { label: 'Pivot', value: formatOptionalNumber(signal.pivot) },
    { label: 'EMA', value: Number.isFinite(signal.ema9) && Number.isFinite(signal.ema21) ? `${formatNumber(signal.ema9)} / ${formatNumber(signal.ema21)}` : null },
    { label: 'Close', value: formatNumber(signal.close) }
  ];

  return candidates.filter((metric) => metric.value !== null && metric.value !== undefined).slice(0, 3);
}

function Metric({ icon, label, value }) {
  return (
    <div className="rounded-md border border-line bg-white/75 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-stone-500">
        {icon}
        {label}
      </div>
      <div className="mobile-safe-text mt-1 text-sm font-bold capitalize text-ink">{value}</div>
    </div>
  );
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function formatOptionalNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return formatNumber(value);
}
