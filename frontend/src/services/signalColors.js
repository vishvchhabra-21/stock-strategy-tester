export function signalColor(signalType) {
  if (signalType === 'BULLISH_REVERSAL') return '#0f8f63';
  if (signalType === 'BEARISH_REVERSAL') return '#d84a3a';
  if (signalType === 'POSSIBLE_TREND_CHANGE') return '#2563eb';
  if (signalType === 'NEUTRAL') return '#d99b1f';
  return '#6b7280';
}
