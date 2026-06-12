import { memo } from 'react';
import SignalBadge from './SignalBadge.jsx';

function SignalCard({ result }) {
  if (!result) {
    return (
      <section className="panel p-4 sm:p-5">
        <span className="tag">BT · Latest signal</span>
        <p className="mt-3 text-sm leading-6 text-dim">
          Pick a stock and run a backtest. The latest signal, its strength, and the full
          day-by-day record will land here.
        </p>
      </section>
    );
  }

  const latest = result.signals?.[result.signals.length - 1];
  const metrics = latest ? latestMetrics(latest) : [];

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className="tag">BT · Latest signal</span>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="num text-sm font-bold text-amber">{result.symbol}</span>
            {result.strategy?.strategyName && (
              <span className="rounded border border-line bg-well px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-faint">
                {result.strategy.strategyName}
              </span>
            )}
          </div>
          <h2 className="mobile-safe-text mt-2 font-display text-2xl font-bold uppercase tracking-wide text-ink sm:text-3xl">
            {result.latestSignal}
          </h2>
          {latest && (
            <div className="mt-3">
              <SignalBadge type={latest.signalType} label={latest.label} />
            </div>
          )}
        </div>

        <div className="shrink-0 rounded-md border border-line bg-well px-4 py-3 text-right">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-widest text-faint">
            Signal strength
          </div>
          <div className="num mt-1 text-3xl font-bold text-ink">{result.confidence}</div>
        </div>
      </div>

      <p className="mobile-safe-text mt-4 text-sm leading-6 text-dim">{result.explanation}</p>

      {metrics.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <Metric key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      )}
    </section>
  );
}

export default memo(SignalCard);

function latestMetrics(signal) {
  const candidates = [
    { label: 'Zone', value: signal.zone ? signal.zone.replace('-', ' ') : null },
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

function Metric({ label, value }) {
  return (
    <div className="rounded-md border border-line bg-well px-3 py-2">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-faint">
        {label}
      </div>
      <div className="num mobile-safe-text mt-1 text-sm font-bold capitalize text-ink">{value}</div>
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
