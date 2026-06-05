const BADGE_STYLES = {
  BULLISH_REVERSAL: 'bg-green-100 text-green-800 border-green-200',
  BEARISH_REVERSAL: 'bg-red-100 text-red-800 border-red-200',
  NEUTRAL: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  POSSIBLE_TREND_CHANGE: 'bg-blue-100 text-blue-800 border-blue-200',
  NO_CLEAR_SIGNAL: 'bg-stone-100 text-stone-700 border-stone-200'
};

export default function SignalBadge({ type, label }) {
  return (
    <span
      data-signal-type={type || 'NO_CLEAR_SIGNAL'}
      className={`signal-badge inline-flex min-h-7 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${BADGE_STYLES[type] || BADGE_STYLES.NO_CLEAR_SIGNAL}`}
    >
      {label || 'No Clear Signal'}
    </span>
  );
}
