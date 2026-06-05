const {
  atrSeries,
  averageVolume,
  bollingerBands,
  emaSeries,
  highest,
  latestAtr,
  lowest,
  macdSeries,
  rsiSeries,
  sma,
  stochasticSeries
} = require('../strategies/technicalIndicators');
const { average, percentageReturn, round } = require('../utils/statistics');

function detectCandles(data) {
  const latest = data[data.length - 1];
  if (!latest) return [];

  const previous = data[data.length - 2];
  const body = Math.abs(latest.close - latest.open);
  const range = Math.max(latest.high - latest.low, latest.close * 0.001);
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;
  const patterns = [];

  if (body <= range * 0.12) patterns.push('Doji');
  if (lowerWick >= Math.max(body * 2, range * 0.35) && upperWick <= range * 0.25) patterns.push('Hammer');
  if (upperWick >= Math.max(body * 2, range * 0.35) && lowerWick <= range * 0.25) patterns.push('Shooting star');

  if (previous) {
    const latestBullish = latest.close > latest.open;
    const previousBearish = previous.close < previous.open;
    const latestBearish = latest.close < latest.open;
    const previousBullish = previous.close > previous.open;
    const engulfed = Math.max(latest.open, latest.close) >= Math.max(previous.open, previous.close) &&
      Math.min(latest.open, latest.close) <= Math.min(previous.open, previous.close);

    if (latestBullish && previousBearish && engulfed) patterns.push('Bullish engulfing');
    if (latestBearish && previousBullish && engulfed) patterns.push('Bearish engulfing');
  }

  return patterns;
}

function supportResistance(data, lookback = 30) {
  const endIndex = data.length - 1;
  const support = lowest(data, endIndex, Math.min(lookback, endIndex), 'low');
  const resistance = highest(data, endIndex, Math.min(lookback, endIndex), 'high');

  return {
    support: Number.isFinite(support) ? round(support) : null,
    resistance: Number.isFinite(resistance) ? round(resistance) : null
  };
}

function vwapFromDaily(data, lookback = 20) {
  const sample = data.slice(-lookback);
  const totalVolume = sample.reduce((sum, day) => sum + (day.volume || 0), 0);
  if (!totalVolume) return null;

  const value = sample.reduce((sum, day) => {
    const typical = (day.high + day.low + day.close) / 3;
    return sum + typical * (day.volume || 0);
  }, 0) / totalVolume;

  return round(value);
}

function analyzeTechnicals(data) {
  const index = data.length - 1;
  const latest = data[index];
  if (!latest) {
    return {
      score: 0,
      direction: 'NEUTRAL',
      confirmations: [],
      warnings: []
    };
  }

  const closes = data.map((day) => day.close);
  const ema20 = emaSeries(closes, 20)[index];
  const ema50 = emaSeries(closes, 50)[index];
  const sma20 = sma(data, index, 20);
  const sma50 = sma(data, index, 50);
  const rsi = rsiSeries(data, 14)[index];
  const macd = macdSeries(data);
  const bands = bollingerBands(data, index, 20, 2);
  const atr = latestAtr(data, 14);
  const avgVol20 = averageVolume(data, index, 20);
  const volumeRatio = avgVol20 ? latest.volume / avgVol20 : 0;
  const sr = supportResistance(data);
  const vwap = vwapFromDaily(data);
  const candles = detectCandles(data);
  const fiveDayReturn = data[index - 5] ? percentageReturn(data[index - 5].close, latest.close) : 0;
  const confirmations = [];
  const warnings = [];
  let bullish = 0;
  let bearish = 0;

  if (Number.isFinite(ema20) && Number.isFinite(ema50)) {
    if (ema20 > ema50 && latest.close > ema20) {
      bullish += 10;
      confirmations.push('Price is above EMA 20 and EMA 20 is above EMA 50.');
    } else if (ema20 < ema50 && latest.close < ema20) {
      bearish += 10;
      confirmations.push('Price is below EMA 20 and EMA 20 is below EMA 50.');
    }
  }

  if (Number.isFinite(rsi)) {
    if (rsi >= 55 && rsi <= 72) bullish += 8;
    if (rsi <= 45 && rsi >= 28) bearish += 8;
    if (rsi > 78) warnings.push('RSI is very high, so chasing a buy has added risk.');
    if (rsi < 22) warnings.push('RSI is very low, so chasing a sell has added risk.');
  }

  if (Number.isFinite(macd.macd[index]) && Number.isFinite(macd.signal[index])) {
    if (macd.macd[index] > macd.signal[index]) bullish += 8;
    if (macd.macd[index] < macd.signal[index]) bearish += 8;
  }

  if (bands) {
    if (latest.close > bands.middle && latest.close < bands.upper) bullish += 5;
    if (latest.close < bands.middle && latest.close > bands.lower) bearish += 5;
    if (latest.close > bands.upper) warnings.push('Price is stretched above the upper Bollinger Band.');
    if (latest.close < bands.lower) warnings.push('Price is stretched below the lower Bollinger Band.');
  }

  if (volumeRatio >= 1.4 && latest.close > latest.open) bullish += 7;
  if (volumeRatio >= 1.4 && latest.close < latest.open) bearish += 7;

  if (sr.resistance && latest.close > sr.resistance) {
    bullish += 8;
    confirmations.push('Close is breaking above recent resistance.');
  }
  if (sr.support && latest.close < sr.support) {
    bearish += 8;
    confirmations.push('Close is breaking below recent support.');
  }

  candles.forEach((pattern) => {
    if (['Hammer', 'Bullish engulfing'].includes(pattern)) bullish += 6;
    if (['Shooting star', 'Bearish engulfing'].includes(pattern)) bearish += 6;
  });

  if (Number.isFinite(fiveDayReturn)) {
    if (fiveDayReturn > 2) bullish += 4;
    if (fiveDayReturn < -2) bearish += 4;
  }

  const rawScore = 50 + bullish - bearish;
  const score = Math.min(100, Math.max(0, round(rawScore, 0)));
  const direction = score >= 58 ? 'BULLISH' : score <= 42 ? 'BEARISH' : 'NEUTRAL';

  return {
    score,
    direction,
    confirmations,
    warnings,
    indicators: {
      sma20: round(sma20),
      sma50: round(sma50),
      ema20: round(ema20),
      ema50: round(ema50),
      rsi14: round(rsi),
      macd: round(macd.macd[index]),
      macdSignal: round(macd.signal[index]),
      bollingerUpper: bands ? round(bands.upper) : null,
      bollingerMiddle: bands ? round(bands.middle) : null,
      bollingerLower: bands ? round(bands.lower) : null,
      vwap20: vwap,
      volumeRatio: round(volumeRatio),
      atr14: round(atr),
      volatilityPercent: round((atr / Math.max(latest.close, 1)) * 100),
      support: sr.support,
      resistance: sr.resistance,
      candlestickPatterns: candles,
      fiveDayReturn: round(fiveDayReturn)
    }
  };
}

module.exports = {
  analyzeTechnicals,
  detectCandles,
  supportResistance
};
