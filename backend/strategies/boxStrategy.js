const { average, buildSummary, percentageReturn, round } = require('../utils/statistics');

const SIGNAL_LABELS = {
  BULLISH_REVERSAL: 'Bullish Reversal Possible',
  BEARISH_REVERSAL: 'Bearish Reversal Possible',
  NEUTRAL: 'Neutral',
  POSSIBLE_TREND_CHANGE: 'Possible Trend Change',
  NO_CLEAR_SIGNAL: 'No Clear Signal'
};

const strategyName = 'box-strategy';

const description = 'Uses the previous day high and low as a box, then studies close location, wick rejection, and volume.';

const defaultParameters = {
  boxTolerance: 0.1,
  wickRatio: 2,
  volumeMultiplier: 1.5
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeParameters(parameters) {
  return {
    boxTolerance: clamp(Number(parameters.boxTolerance) || defaultParameters.boxTolerance, 0.01, 0.45),
    wickRatio: clamp(Number(parameters.wickRatio) || defaultParameters.wickRatio, 0.5, 10),
    volumeMultiplier: clamp(Number(parameters.volumeMultiplier) || defaultParameters.volumeMultiplier, 0.5, 5)
  };
}

function candleMetrics(day) {
  const candleRange = Math.max(day.high - day.low, 0);
  const rawBody = Math.abs(day.close - day.open);
  const body = rawBody || Math.max(candleRange * 0.001, 0.0001);
  const upperWick = Math.max(day.high - Math.max(day.open, day.close), 0);
  const lowerWick = Math.max(Math.min(day.open, day.close) - day.low, 0);
  const closePosition = candleRange > 0 ? (day.close - day.low) / candleRange : 0.5;

  return {
    candleRange,
    body: round(rawBody, 4),
    upperWick: round(upperWick, 4),
    lowerWick: round(lowerWick, 4),
    upperWickRatio: round(upperWick / body, 2),
    lowerWickRatio: round(lowerWick / body, 2),
    closePosition: round(closePosition, 3),
    candleDirection: day.close > day.open ? 'bullish' : day.close < day.open ? 'bearish' : 'flat'
  };
}

function determineZone(day, box, boxTolerance) {
  if (day.close >= box.high - box.range * boxTolerance) {
    return 'near-high';
  }

  if (day.close <= box.low + box.range * boxTolerance) {
    return 'near-low';
  }

  return 'center';
}

function wickStrengthScore(metrics, direction, wickRatio) {
  const ratio = direction === 'bearish' ? metrics.upperWickRatio : metrics.lowerWickRatio;
  return clamp((ratio / (wickRatio * 2.5)) * 35, 0, 35);
}

function positionScore(day, box, zone) {
  if (zone === 'near-high') {
    const distanceFromHigh = Math.abs(box.high - day.close) / box.range;
    return clamp(35 - distanceFromHigh * 100, 15, 35);
  }

  if (zone === 'near-low') {
    const distanceFromLow = Math.abs(day.close - box.low) / box.range;
    return clamp(35 - distanceFromLow * 100, 15, 35);
  }

  const distanceFromMid = Math.abs(day.close - box.mid) / box.range;
  return clamp(30 - distanceFromMid * 70, 5, 30);
}

function calculateConfidence(day, box, zone, metrics, volumeState, signalType, parameters) {
  if (signalType === 'BULLISH_REVERSAL') {
    const directionScore = day.close >= day.open || metrics.closePosition >= 0.5 ? 15 : 5;
    return round(clamp(
      positionScore(day, box, zone) +
      wickStrengthScore(metrics, 'bullish', parameters.wickRatio) +
      volumeState.score +
      directionScore,
      0,
      100
    ), 0);
  }

  if (signalType === 'BEARISH_REVERSAL') {
    const directionScore = day.close <= day.open || metrics.closePosition <= 0.5 ? 15 : 5;
    return round(clamp(
      positionScore(day, box, zone) +
      wickStrengthScore(metrics, 'bearish', parameters.wickRatio) +
      volumeState.score +
      directionScore,
      0,
      100
    ), 0);
  }

  if (signalType === 'POSSIBLE_TREND_CHANGE') {
    return round(clamp(positionScore(day, box, zone) + volumeState.score + 25, 0, 100), 0);
  }

  if (signalType === 'NEUTRAL') {
    return round(clamp(positionScore(day, box, zone) + 25 - volumeState.score / 2, 0, 100), 0);
  }

  return round(clamp(positionScore(day, box, zone) + volumeState.score / 2, 0, 55), 0);
}

function buildExplanation({ zone, signalType, metrics, volumeState }) {
  if (signalType === 'BEARISH_REVERSAL') {
    return `The stock closed near the upper boundary of yesterday's box. A long upper wick appeared with ${volumeState.label.toLowerCase()}, suggesting rejection from higher levels and possible bearish reversal pressure.`;
  }

  if (signalType === 'BULLISH_REVERSAL') {
    return `The stock closed near the lower boundary of yesterday's box. A long lower wick appeared with ${volumeState.label.toLowerCase()}, suggesting rejection from lower levels and possible bullish reversal pressure.`;
  }

  if (signalType === 'POSSIBLE_TREND_CHANGE') {
    return `The stock closed near the center of yesterday's box while volume expanded above its 20-day average. That combination can point to a possible breakout attempt or trend change.`;
  }

  if (signalType === 'NEUTRAL') {
    return `The stock closed near the center of yesterday's box and volume stayed muted, so the box strategy does not show a strong directional edge.`;
  }

  if (zone === 'near-high') {
    return `The stock finished near the upper box boundary, but the upper wick ratio was ${metrics.upperWickRatio}x, which is not enough for a strong John Wick rejection signal.`;
  }

  if (zone === 'near-low') {
    return `The stock finished near the lower box boundary, but the lower wick ratio was ${metrics.lowerWickRatio}x, which is not enough for a strong John Wick rejection signal.`;
  }

  return `The close stayed inside the middle of yesterday's box without a decisive volume clue.`;
}

function getFutureReturns(data, index) {
  const close = data[index].close;
  return {
    return1d: data[index + 1] ? round(percentageReturn(close, data[index + 1].close)) : null,
    return3d: data[index + 3] ? round(percentageReturn(close, data[index + 3].close)) : null,
    return5d: data[index + 5] ? round(percentageReturn(close, data[index + 5].close)) : null
  };
}

function getVolumeState(data, index, volumeMultiplier) {
  const previousVolumes = data.slice(Math.max(0, index - 20), index).map((day) => day.volume);
  const avgVolume20 = average(previousVolumes);
  const ratio = avgVolume20 ? data[index].volume / avgVolume20 : 0;
  const isStrong = avgVolume20 > 0 && ratio >= volumeMultiplier;

  return {
    avgVolume20: round(avgVolume20, 0),
    volumeRatio: round(ratio, 2),
    isStrong,
    label: isStrong ? 'Strong volume' : 'Weak/normal volume',
    score: isStrong ? clamp((ratio / volumeMultiplier) * 20, 12, 25) : clamp(ratio * 8, 0, 10)
  };
}

function classifySignal(day, zone, metrics, volumeState, parameters) {
  const bearishJohnWick = (
    zone === 'near-high' &&
    metrics.upperWickRatio >= parameters.wickRatio &&
    (day.close < day.open || metrics.closePosition <= 0.5)
  );

  const bullishJohnWick = (
    zone === 'near-low' &&
    metrics.lowerWickRatio >= parameters.wickRatio &&
    (day.close > day.open || metrics.closePosition >= 0.5)
  );

  if (bearishJohnWick) {
    return 'BEARISH_REVERSAL';
  }

  if (bullishJohnWick) {
    return 'BULLISH_REVERSAL';
  }

  if (zone === 'center' && volumeState.isStrong) {
    return 'POSSIBLE_TREND_CHANGE';
  }

  if (zone === 'center') {
    return 'NEUTRAL';
  }

  return 'NO_CLEAR_SIGNAL';
}

function buildChartData(data, signalsByDate) {
  return data.map((day, index) => {
    const previousDay = data[index - 1];
    return {
      ...day,
      boxHigh: previousDay ? previousDay.high : null,
      boxLow: previousDay ? previousDay.low : null,
      boxMid: previousDay ? round((previousDay.high + previousDay.low) / 2, 4) : null,
      signalType: signalsByDate.get(day.date)?.signalType || null,
      signalLabel: signalsByDate.get(day.date)?.label || null
    };
  });
}

function runStrategy(rawData, rawParameters = {}) {
  const parameters = normalizeParameters(rawParameters);
  const signals = [];

  for (let index = 1; index < rawData.length; index += 1) {
    const day = rawData[index];
    const previousDay = rawData[index - 1];
    const boxRange = previousDay.high - previousDay.low;

    if (!Number.isFinite(boxRange) || boxRange <= 0) {
      continue;
    }

    const box = {
      high: previousDay.high,
      low: previousDay.low,
      mid: (previousDay.high + previousDay.low) / 2,
      range: boxRange
    };

    const zone = determineZone(day, box, parameters.boxTolerance);
    const metrics = candleMetrics(day);
    const volumeState = getVolumeState(rawData, index, parameters.volumeMultiplier);
    const signalType = classifySignal(day, zone, metrics, volumeState, parameters);
    const confidence = calculateConfidence(day, box, zone, metrics, volumeState, signalType, parameters);

    const signal = {
      date: day.date,
      open: day.open,
      high: day.high,
      low: day.low,
      close: day.close,
      volume: day.volume,
      boxHigh: round(box.high, 4),
      boxLow: round(box.low, 4),
      boxMid: round(box.mid, 4),
      boxRange: round(box.range, 4),
      zone,
      signalType,
      label: SIGNAL_LABELS[signalType],
      confidence,
      volume: day.volume,
      volumeState: volumeState.label,
      volumeRatio: volumeState.volumeRatio,
      avgVolume20: volumeState.avgVolume20,
      candle: metrics,
      futureReturns: getFutureReturns(rawData, index)
    };

    signal.explanation = buildExplanation({
      zone,
      signalType,
      metrics,
      volumeState
    });

    signals.push(signal);
  }

  const signalsByDate = new Map(signals.map((signal) => [signal.date, signal]));
  const latestSignal = signals[signals.length - 1] || null;

  return {
    strategy: {
      strategyName,
      description,
      parameters
    },
    latestSignal: latestSignal ? latestSignal.label : 'No Clear Signal',
    confidence: latestSignal ? latestSignal.confidence : 0,
    explanation: latestSignal ? latestSignal.explanation : 'No strategy result could be calculated.',
    summary: buildSummary(signals),
    signals,
    chartData: buildChartData(rawData, signalsByDate)
  };
}

module.exports = {
  strategyName,
  description,
  defaultParameters,
  runStrategy
};
