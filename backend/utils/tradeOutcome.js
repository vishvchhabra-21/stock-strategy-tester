const { atrSeries, emaSeries } = require('../strategies/technicalIndicators');
const { round } = require('./statistics');

// A signal is only worth counting as a trade when its forward price path is
// simulated like a real trade: enter at the signal close, place an ATR based
// target and a wider ATR based stop, then walk the actual highs/lows forward
// until the first barrier is touched. This "first-touch" method is how real
// win rates are measured and removes the noise of judging a setup purely on a
// fixed 5-day close.
const DEFAULTS = {
  targetMult: 1.0,
  stopMult: 1.7,
  horizon: 10,
  atrPeriod: 14
};

// Trend gate: a directional signal that fights a strong trend is the lowest
// probability kind of trade, so it is stood down. The threshold keeps weak or
// sideways markets untouched and only blocks clearly counter-trend setups.
const TREND_THRESHOLD = 0.02;

const atrCache = new WeakMap();
const trendCache = new WeakMap();

function getAtrSeries(data) {
  let cached = atrCache.get(data);
  if (!cached) {
    cached = atrSeries(data, DEFAULTS.atrPeriod);
    atrCache.set(data, cached);
  }
  return cached;
}

function getTrendSeries(data) {
  let cached = trendCache.get(data);
  if (!cached) {
    const closes = data.map((day) => day.close);
    cached = {
      fast: emaSeries(closes, 20),
      slow: emaSeries(closes, 50)
    };
    trendCache.set(data, cached);
  }
  return cached;
}

function directionFromSignalType(signalType) {
  if (signalType === 'BULLISH_REVERSAL') return 'LONG';
  if (signalType === 'BEARISH_REVERSAL') return 'SHORT';
  return null;
}

function trendBiasAt(data, index) {
  const { fast, slow } = getTrendSeries(data);
  const fastValue = fast[index];
  const slowValue = slow[index];
  if (!Number.isFinite(fastValue) || !Number.isFinite(slowValue) || slowValue === 0) {
    return 0;
  }

  return (fastValue - slowValue) / slowValue;
}

// Returns a possibly downgraded signal type. A bearish reversal during a strong
// uptrend (or a bullish reversal during a strong downtrend) is turned into
// NEUTRAL so the strategy stops fighting the dominant trend.
function trendAlignedSignalType(data, index, signalType, threshold = TREND_THRESHOLD) {
  const bias = trendBiasAt(data, index);
  if (signalType === 'BEARISH_REVERSAL' && bias > threshold) return 'NEUTRAL';
  if (signalType === 'BULLISH_REVERSAL' && bias < -threshold) return 'NEUTRAL';
  return signalType;
}

function signedPercent(entry, price, isLong) {
  const move = ((price - entry) / entry) * 100;
  return isLong ? move : -move;
}

function buildOutcome(win, returnPercent, exit, barsHeld) {
  return {
    win,
    returnPercent: round(returnPercent),
    exit,
    barsHeld
  };
}

// Simulate the trade implied by a directional signal and report whether it
// would have been a win, its realized return, and how it exited.
function evaluateTradeOutcome(data, index, signalType, options = {}) {
  const direction = directionFromSignalType(signalType);
  if (!direction) return null;

  const cfg = { ...DEFAULTS, ...options };
  const entryBar = data[index];
  if (!entryBar || !Number.isFinite(entryBar.close)) return null;

  const entry = entryBar.close;
  const atrList = getAtrSeries(data);
  let atr = atrList[index];
  if (!Number.isFinite(atr) || atr <= 0) {
    atr = entry * 0.02;
  }

  const isLong = direction === 'LONG';
  const targetDistance = atr * cfg.targetMult;
  const stopDistance = atr * cfg.stopMult;
  const target = isLong ? entry + targetDistance : entry - targetDistance;
  const stop = isLong ? entry - stopDistance : entry + stopDistance;

  const lastIndex = Math.min(index + cfg.horizon, data.length - 1);
  if (lastIndex <= index) return null;

  for (let j = index + 1; j <= lastIndex; j += 1) {
    const bar = data[j];
    if (!bar) break;

    const hitTarget = isLong ? bar.high >= target : bar.low <= target;
    const hitStop = isLong ? bar.low <= stop : bar.high >= stop;

    if (hitTarget && hitStop) {
      // Both barriers touched in the same candle: assume the stop filled first.
      return buildOutcome(false, signedPercent(entry, stop, isLong), 'stop', j - index);
    }
    if (hitTarget) {
      return buildOutcome(true, signedPercent(entry, target, isLong), 'target', j - index);
    }
    if (hitStop) {
      return buildOutcome(false, signedPercent(entry, stop, isLong), 'stop', j - index);
    }
  }

  // No barrier touched inside the window: settle on the closing price.
  const exitReturn = signedPercent(entry, data[lastIndex].close, isLong);
  return buildOutcome(exitReturn > 0, exitReturn, 'timeout', lastIndex - index);
}

module.exports = {
  evaluateTradeOutcome,
  trendAlignedSignalType,
  trendBiasAt
};
