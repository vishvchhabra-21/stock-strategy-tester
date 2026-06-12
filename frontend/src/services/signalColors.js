export function signalColor(signalType) {
  if (signalType === 'BULLISH_REVERSAL') return '#2FD584';
  if (signalType === 'BEARISH_REVERSAL') return '#FF5C5C';
  if (signalType === 'POSSIBLE_TREND_CHANGE') return '#6AA6FF';
  if (signalType === 'NEUTRAL') return '#9AA4BA';
  return '#5F6A85';
}
