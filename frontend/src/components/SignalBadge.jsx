const BADGE_STYLES = {
  BULLISH_REVERSAL: 'border-up/40 bg-up/10 text-up',
  BEARISH_REVERSAL: 'border-down/40 bg-down/10 text-down',
  NEUTRAL: 'border-line bg-well text-dim',
  POSSIBLE_TREND_CHANGE: 'border-info/40 bg-info/10 text-info',
  NO_CLEAR_SIGNAL: 'border-line bg-well text-faint'
};

export default function SignalBadge({ type, label }) {
  return (
    <span
      data-signal-type={type || 'NO_CLEAR_SIGNAL'}
      className={`inline-flex min-h-6 items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${BADGE_STYLES[type] || BADGE_STYLES.NO_CLEAR_SIGNAL}`}
    >
      {label || 'No Clear Signal'}
    </span>
  );
}
