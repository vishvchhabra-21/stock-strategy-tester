const { buildSummary, percentageReturn, round } = require('../utils/statistics');
const {
  averageVolume,
  bollingerBands,
  emaSeries,
  highest,
  lowest,
  macdSeries,
  roundNullable,
  rsiSeries,
  sma,
  stochasticSeries
} = require('./technicalIndicators');

const LABELS = {
  BULLISH_REVERSAL: 'Buy Bias',
  BEARISH_REVERSAL: 'Sell Bias',
  NEUTRAL: 'Neutral',
  NO_CLEAR_SIGNAL: 'No Clear Signal'
};

function futureReturns(data, index) {
  const close = data[index].close;
  return {
    return1d: data[index + 1] ? round(percentageReturn(close, data[index + 1].close)) : null,
    return3d: data[index + 3] ? round(percentageReturn(close, data[index + 3].close)) : null,
    return5d: data[index + 5] ? round(percentageReturn(close, data[index + 5].close)) : null
  };
}

function buildResult(strategy, data, signals) {
  const latestSignal = signals[signals.length - 1] || null;
  const signalsByDate = new Map(signals.map((signal) => [signal.date, signal]));

  return {
    strategy: {
      strategyName: strategy.strategyName,
      description: strategy.description,
      parameters: strategy.defaultParameters
    },
    latestSignal: latestSignal ? latestSignal.label : 'No Clear Signal',
    confidence: latestSignal ? latestSignal.confidence : 0,
    explanation: latestSignal ? latestSignal.explanation : 'No strategy result could be calculated.',
    summary: buildSummary(signals),
    signals,
    chartData: data.map((day) => ({
      ...day,
      signalType: signalsByDate.get(day.date)?.signalType || null,
      signalLabel: signalsByDate.get(day.date)?.label || null
    }))
  };
}

function makeSignal(day, index, signalType, confidence, explanation, extras = {}, data) {
  return {
    date: day.date,
    open: day.open,
    high: day.high,
    low: day.low,
    close: day.close,
    volume: day.volume,
    signalType,
    label: LABELS[signalType] || LABELS.NO_CLEAR_SIGNAL,
    confidence: round(confidence, 0),
    explanation,
    futureReturns: futureReturns(data, index),
    ...extras
  };
}

const rsiStrategy = {
  strategyName: 'rsi-strategy',
  description: 'Uses RSI 14 to identify oversold buy bias and overbought sell bias.',
  defaultParameters: { period: 14, oversold: 30, overbought: 70 },
  runStrategy(data) {
    const rsi = rsiSeries(data, 14);
    const signals = [];

    data.forEach((day, index) => {
      if (!Number.isFinite(rsi[index])) return;

      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = `RSI is ${round(rsi[index])}, which is inside the neutral zone.`;

      if (rsi[index] <= 30) {
        signalType = 'BULLISH_REVERSAL';
        confidence = Math.min(95, 55 + (30 - rsi[index]) * 2);
        explanation = `RSI is ${round(rsi[index])}, indicating oversold conditions and a possible buy setup.`;
      } else if (rsi[index] >= 70) {
        signalType = 'BEARISH_REVERSAL';
        confidence = Math.min(95, 55 + (rsi[index] - 70) * 2);
        explanation = `RSI is ${round(rsi[index])}, indicating overbought conditions and a possible sell setup.`;
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, { rsi: roundNullable(rsi[index]) }, data));
    });

    return buildResult(this, data, signals);
  }
};

const smaCrossoverStrategy = {
  strategyName: 'sma-crossover',
  description: 'Compares SMA 20 and SMA 50 to identify medium-term trend bias.',
  defaultParameters: { fastPeriod: 20, slowPeriod: 50 },
  runStrategy(data) {
    const signals = [];

    data.forEach((day, index) => {
      const fast = sma(data, index, 20);
      const slow = sma(data, index, 50);
      if (!Number.isFinite(fast) || !Number.isFinite(slow)) return;

      const spread = ((fast - slow) / slow) * 100;
      const signalType = spread > 0 ? 'BULLISH_REVERSAL' : spread < 0 ? 'BEARISH_REVERSAL' : 'NEUTRAL';
      const confidence = Math.min(90, 45 + Math.abs(spread) * 8);
      const explanation = spread > 0
        ? `SMA 20 is above SMA 50 by ${round(spread)}%, showing bullish trend bias.`
        : `SMA 20 is below SMA 50 by ${round(Math.abs(spread))}%, showing bearish trend bias.`;

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        sma20: roundNullable(fast),
        sma50: roundNullable(slow)
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const macdStrategy = {
  strategyName: 'macd-strategy',
  description: 'Uses MACD 12/26 with a 9-period signal line to detect momentum bias.',
  defaultParameters: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  runStrategy(data) {
    const { macd, signal, histogram } = macdSeries(data);
    const signals = [];

    data.forEach((day, index) => {
      if (!Number.isFinite(macd[index]) || !Number.isFinite(signal[index])) return;

      const signalType = macd[index] > signal[index] ? 'BULLISH_REVERSAL' : macd[index] < signal[index] ? 'BEARISH_REVERSAL' : 'NEUTRAL';
      const distance = Math.abs(histogram[index] || 0);
      const confidence = Math.min(88, 45 + (distance / Math.max(day.close, 1)) * 1000);
      const explanation = macd[index] > signal[index]
        ? 'MACD is above the signal line, showing bullish momentum bias.'
        : 'MACD is below the signal line, showing bearish momentum bias.';

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        macd: roundNullable(macd[index]),
        macdSignal: roundNullable(signal[index]),
        macdHistogram: roundNullable(histogram[index])
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const breakoutStrategy = {
  strategyName: 'breakout-strategy',
  description: 'Looks for close above 20-day resistance or below 20-day support.',
  defaultParameters: { lookback: 20 },
  runStrategy(data) {
    const signals = [];

    data.forEach((day, index) => {
      const resistance = highest(data, index, 20, 'high');
      const support = lowest(data, index, 20, 'low');
      if (!Number.isFinite(resistance) || !Number.isFinite(support)) return;

      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = 'Price remains inside its 20-day range.';

      if (day.close > resistance) {
        signalType = 'BULLISH_REVERSAL';
        confidence = Math.min(95, 60 + ((day.close - resistance) / resistance) * 500);
        explanation = 'Close broke above 20-day resistance, showing bullish breakout pressure.';
      } else if (day.close < support) {
        signalType = 'BEARISH_REVERSAL';
        confidence = Math.min(95, 60 + ((support - day.close) / support) * 500);
        explanation = 'Close broke below 20-day support, showing bearish breakdown pressure.';
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        support: roundNullable(support),
        resistance: roundNullable(resistance)
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const volumeBreakoutStrategy = {
  strategyName: 'volume-breakout',
  description: 'Confirms 20-day price breakouts only when volume is above 1.5x its 20-day average.',
  defaultParameters: { lookback: 20, volumeMultiplier: 1.5 },
  runStrategy(data) {
    const signals = [];

    data.forEach((day, index) => {
      const resistance = highest(data, index, 20, 'high');
      const support = lowest(data, index, 20, 'low');
      const avgVolume = averageVolume(data, index, 20);
      if (!Number.isFinite(resistance) || !Number.isFinite(support) || !Number.isFinite(avgVolume)) return;

      const volumeRatio = avgVolume ? day.volume / avgVolume : 0;
      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = `Volume is ${round(volumeRatio)}x average without a confirmed breakout.`;

      if (day.close > resistance && volumeRatio >= 1.5) {
        signalType = 'BULLISH_REVERSAL';
        confidence = Math.min(96, 60 + volumeRatio * 10);
        explanation = `Price broke above resistance with ${round(volumeRatio)}x volume, confirming bullish breakout interest.`;
      } else if (day.close < support && volumeRatio >= 1.5) {
        signalType = 'BEARISH_REVERSAL';
        confidence = Math.min(96, 60 + volumeRatio * 10);
        explanation = `Price broke below support with ${round(volumeRatio)}x volume, confirming bearish breakdown pressure.`;
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        support: roundNullable(support),
        resistance: roundNullable(resistance),
        volumeRatio: roundNullable(volumeRatio)
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const supportResistanceStrategy = {
  strategyName: 'support-resistance',
  description: 'Uses the 20-day high/low range to identify rejection near support or resistance.',
  defaultParameters: { lookback: 20, tolerance: 0.1 },
  runStrategy(data) {
    const signals = [];

    data.forEach((day, index) => {
      const resistance = highest(data, index, 20, 'high');
      const support = lowest(data, index, 20, 'low');
      if (!Number.isFinite(resistance) || !Number.isFinite(support) || resistance <= support) return;

      const range = resistance - support;
      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = 'Price is between support and resistance without a clean edge signal.';

      if (day.close <= support + range * 0.1) {
        signalType = 'BULLISH_REVERSAL';
        confidence = 65;
        explanation = 'Price closed near 20-day support, suggesting a possible bounce setup.';
      } else if (day.close >= resistance - range * 0.1) {
        signalType = 'BEARISH_REVERSAL';
        confidence = 65;
        explanation = 'Price closed near 20-day resistance, suggesting a possible rejection setup.';
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        support: roundNullable(support),
        resistance: roundNullable(resistance)
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const emaTrendStrategy = {
  strategyName: 'ema-trend',
  description: 'Uses EMA 9 and EMA 21 to identify short-term trend direction.',
  defaultParameters: { fastPeriod: 9, slowPeriod: 21 },
  runStrategy(data) {
    const closes = data.map((day) => day.close);
    const fast = emaSeries(closes, 9);
    const slow = emaSeries(closes, 21);
    const signals = [];

    data.forEach((day, index) => {
      if (!Number.isFinite(fast[index]) || !Number.isFinite(slow[index])) return;

      const spread = ((fast[index] - slow[index]) / slow[index]) * 100;
      const signalType = spread > 0 ? 'BULLISH_REVERSAL' : spread < 0 ? 'BEARISH_REVERSAL' : 'NEUTRAL';
      const confidence = Math.min(90, 45 + Math.abs(spread) * 12);
      const explanation = spread > 0
        ? `EMA 9 is above EMA 21 by ${round(spread)}%, showing short-term bullish trend.`
        : `EMA 9 is below EMA 21 by ${round(Math.abs(spread))}%, showing short-term bearish trend.`;

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        ema9: roundNullable(fast[index]),
        ema21: roundNullable(slow[index])
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const bollingerStrategy = {
  strategyName: 'bollinger-bands',
  description: 'Uses 20-period Bollinger Bands to study mean reversion and volatility extremes.',
  defaultParameters: { period: 20, multiplier: 2 },
  runStrategy(data) {
    const signals = [];

    data.forEach((day, index) => {
      const bands = bollingerBands(data, index, 20, 2);
      if (!bands) return;

      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = 'Price is trading inside the Bollinger Bands without an extreme signal.';

      if (day.close < bands.lower) {
        signalType = 'BULLISH_REVERSAL';
        confidence = Math.min(90, 60 + ((bands.lower - day.close) / day.close) * 500);
        explanation = 'Close is below the lower Bollinger Band, suggesting an oversold mean-reversion setup.';
      } else if (day.close > bands.upper) {
        signalType = 'BEARISH_REVERSAL';
        confidence = Math.min(90, 60 + ((day.close - bands.upper) / day.close) * 500);
        explanation = 'Close is above the upper Bollinger Band, suggesting an overbought mean-reversion setup.';
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        bollingerUpper: roundNullable(bands.upper),
        bollingerMiddle: roundNullable(bands.middle),
        bollingerLower: roundNullable(bands.lower)
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const stochasticStrategy = {
  strategyName: 'stochastic-oscillator',
  description: 'Uses Stochastic %K/%D to identify overbought and oversold momentum conditions.',
  defaultParameters: { kPeriod: 14, dPeriod: 3, oversold: 20, overbought: 80 },
  runStrategy(data) {
    const { k, d } = stochasticSeries(data, 14, 3);
    const signals = [];

    data.forEach((day, index) => {
      if (!Number.isFinite(k[index]) || !Number.isFinite(d[index])) return;

      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = `Stochastic is ${round(k[index])}, which is in the neutral zone.`;

      if (k[index] <= 20 && k[index] > d[index]) {
        signalType = 'BULLISH_REVERSAL';
        confidence = Math.min(92, 58 + (20 - k[index]) * 1.5);
        explanation = 'Stochastic is oversold and %K is above %D, suggesting a possible bullish reversal.';
      } else if (k[index] >= 80 && k[index] < d[index]) {
        signalType = 'BEARISH_REVERSAL';
        confidence = Math.min(92, 58 + (k[index] - 80) * 1.5);
        explanation = 'Stochastic is overbought and %K is below %D, suggesting a possible bearish reversal.';
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        stochasticK: roundNullable(k[index]),
        stochasticD: roundNullable(d[index])
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const gapAndGoStrategy = {
  strategyName: 'gap-and-go',
  description: 'Studies opening gaps with candle direction and volume confirmation for intraday-style gap continuation or gap fade bias.',
  defaultParameters: { minGapPercent: 0.7, volumeMultiplier: 1.2 },
  runStrategy(data) {
    const signals = [];

    data.forEach((day, index) => {
      if (index === 0) return;

      const previous = data[index - 1];
      const gapPercent = percentageReturn(previous.close, day.open);
      const intradayMove = percentageReturn(day.open, day.close);
      const avgVolume = averageVolume(data, index, 20);
      const volumeRatio = avgVolume ? day.volume / avgVolume : 1;
      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = `Opening gap is ${round(gapPercent)}%, without enough follow-through for a clear gap setup.`;

      if (gapPercent >= 0.7 && intradayMove > 0 && volumeRatio >= 1.2) {
        signalType = 'BULLISH_REVERSAL';
        confidence = Math.min(92, 58 + gapPercent * 5 + volumeRatio * 6);
        explanation = `Stock gapped up by ${round(gapPercent)}% and closed stronger with ${round(volumeRatio)}x volume, showing gap-and-go buy pressure.`;
      } else if (gapPercent <= -0.7 && intradayMove < 0 && volumeRatio >= 1.2) {
        signalType = 'BEARISH_REVERSAL';
        confidence = Math.min(92, 58 + Math.abs(gapPercent) * 5 + volumeRatio * 6);
        explanation = `Stock gapped down by ${round(Math.abs(gapPercent))}% and closed weaker with ${round(volumeRatio)}x volume, showing gap-and-go sell pressure.`;
      } else if (gapPercent >= 0.7 && intradayMove < -0.4) {
        signalType = 'BEARISH_REVERSAL';
        confidence = Math.min(86, 54 + Math.abs(intradayMove) * 6);
        explanation = 'A gap-up opening faded by the close, suggesting possible rejection after the gap.';
      } else if (gapPercent <= -0.7 && intradayMove > 0.4) {
        signalType = 'BULLISH_REVERSAL';
        confidence = Math.min(86, 54 + intradayMove * 6);
        explanation = 'A gap-down opening recovered by the close, suggesting possible buying interest after the gap.';
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        gapPercent: roundNullable(gapPercent),
        intradayMove: roundNullable(intradayMove),
        volumeRatio: roundNullable(volumeRatio)
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const pivotPointStrategy = {
  strategyName: 'pivot-points',
  description: 'Uses previous day pivot, first support, and first resistance to study range-break or rejection bias.',
  defaultParameters: { tolerance: 0.15 },
  runStrategy(data) {
    const signals = [];

    data.forEach((day, index) => {
      if (index === 0) return;

      const previous = data[index - 1];
      const previousRange = Math.max(previous.high - previous.low, previous.close * 0.005);
      const pivot = (previous.high + previous.low + previous.close) / 3;
      const resistance1 = 2 * pivot - previous.low;
      const support1 = 2 * pivot - previous.high;
      const nearBand = previousRange * 0.15;
      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = 'Price is between pivot support and resistance without a strong pivot signal.';

      if (day.close > resistance1) {
        signalType = 'BULLISH_REVERSAL';
        confidence = Math.min(90, 58 + ((day.close - resistance1) / day.close) * 600);
        explanation = 'Close moved above first pivot resistance, suggesting breakout-style buy pressure.';
      } else if (day.close < support1) {
        signalType = 'BEARISH_REVERSAL';
        confidence = Math.min(90, 58 + ((support1 - day.close) / day.close) * 600);
        explanation = 'Close moved below first pivot support, suggesting breakdown-style sell pressure.';
      } else if (day.low <= support1 + nearBand && day.close > day.open) {
        signalType = 'BULLISH_REVERSAL';
        confidence = 64;
        explanation = 'Price tested pivot support and closed bullish, suggesting a possible support bounce.';
      } else if (day.high >= resistance1 - nearBand && day.close < day.open) {
        signalType = 'BEARISH_REVERSAL';
        confidence = 64;
        explanation = 'Price tested pivot resistance and closed bearish, suggesting a possible resistance rejection.';
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        pivot: roundNullable(pivot),
        support1: roundNullable(support1),
        resistance1: roundNullable(resistance1)
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const candleReversalStrategy = {
  strategyName: 'candle-reversal',
  description: 'Detects hammer and shooting-star style candles using wick/body ratios near short-term extremes.',
  defaultParameters: { wickRatio: 2, lookback: 10 },
  runStrategy(data) {
    const signals = [];

    data.forEach((day, index) => {
      if (index < 10) return;

      const body = Math.max(Math.abs(day.close - day.open), day.close * 0.001);
      const upperWick = day.high - Math.max(day.open, day.close);
      const lowerWick = Math.min(day.open, day.close) - day.low;
      const recentHigh = highest(data, index, 10, 'high');
      const recentLow = lowest(data, index, 10, 'low');
      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = 'No strong hammer or shooting-star candle is visible at the current price area.';

      if (lowerWick >= body * 2 && day.close > day.open && day.low <= recentLow) {
        signalType = 'BULLISH_REVERSAL';
        confidence = Math.min(90, 58 + (lowerWick / body) * 6);
        explanation = 'A long lower wick near recent lows suggests buyers rejected lower prices.';
      } else if (upperWick >= body * 2 && day.close < day.open && day.high >= recentHigh) {
        signalType = 'BEARISH_REVERSAL';
        confidence = Math.min(90, 58 + (upperWick / body) * 6);
        explanation = 'A long upper wick near recent highs suggests sellers rejected higher prices.';
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        upperWick: roundNullable(upperWick),
        lowerWick: roundNullable(lowerWick),
        body: roundNullable(body)
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const momentumVolumeStrategy = {
  strategyName: 'momentum-volume',
  description: 'Combines short-term price momentum with above-average volume to find directional intraday-style pressure.',
  defaultParameters: { lookback: 3, volumeMultiplier: 1.3 },
  runStrategy(data) {
    const signals = [];

    data.forEach((day, index) => {
      if (index < 20) return;

      const return3d = percentageReturn(data[index - 3].close, day.close);
      const avgVolume = averageVolume(data, index, 20);
      const volumeRatio = avgVolume ? day.volume / avgVolume : 0;
      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = `3-day move is ${round(return3d)}% with ${round(volumeRatio)}x volume, not enough for a confirmed momentum signal.`;

      if (return3d >= 2 && volumeRatio >= 1.3 && day.close > day.open) {
        signalType = 'BULLISH_REVERSAL';
        confidence = Math.min(94, 58 + return3d * 3 + volumeRatio * 8);
        explanation = `Positive momentum of ${round(return3d)}% with ${round(volumeRatio)}x volume suggests buy-side pressure.`;
      } else if (return3d <= -2 && volumeRatio >= 1.3 && day.close < day.open) {
        signalType = 'BEARISH_REVERSAL';
        confidence = Math.min(94, 58 + Math.abs(return3d) * 3 + volumeRatio * 8);
        explanation = `Negative momentum of ${round(Math.abs(return3d))}% with ${round(volumeRatio)}x volume suggests sell-side pressure.`;
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        return3d: roundNullable(return3d),
        volumeRatio: roundNullable(volumeRatio)
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

const pullbackContinuationStrategy = {
  strategyName: 'pullback-continuation',
  description: 'Looks for a pullback toward EMA 20 inside an EMA 20/50 trend and then checks for trend continuation.',
  defaultParameters: { fastPeriod: 20, slowPeriod: 50, tolerance: 0.01 },
  runStrategy(data) {
    const closes = data.map((day) => day.close);
    const ema20 = emaSeries(closes, 20);
    const ema50 = emaSeries(closes, 50);
    const signals = [];

    data.forEach((day, index) => {
      if (!Number.isFinite(ema20[index]) || !Number.isFinite(ema50[index])) return;

      const uptrend = ema20[index] > ema50[index];
      const downtrend = ema20[index] < ema50[index];
      let signalType = 'NEUTRAL';
      let confidence = 35;
      let explanation = 'No clean pullback continuation setup is present around EMA 20.';

      if (uptrend && day.low <= ema20[index] * 1.01 && day.close > ema20[index] && day.close > day.open) {
        signalType = 'BULLISH_REVERSAL';
        confidence = 68;
        explanation = 'Price pulled back toward EMA 20 in an uptrend and closed bullish, suggesting continuation buy bias.';
      } else if (downtrend && day.high >= ema20[index] * 0.99 && day.close < ema20[index] && day.close < day.open) {
        signalType = 'BEARISH_REVERSAL';
        confidence = 68;
        explanation = 'Price pulled back toward EMA 20 in a downtrend and closed bearish, suggesting continuation sell bias.';
      }

      signals.push(makeSignal(day, index, signalType, confidence, explanation, {
        ema20: roundNullable(ema20[index]),
        ema50: roundNullable(ema50[index])
      }, data));
    });

    return buildResult(this, data, signals);
  }
};

module.exports = [
  rsiStrategy,
  smaCrossoverStrategy,
  macdStrategy,
  breakoutStrategy,
  volumeBreakoutStrategy,
  supportResistanceStrategy,
  emaTrendStrategy,
  bollingerStrategy,
  stochasticStrategy,
  gapAndGoStrategy,
  pivotPointStrategy,
  candleReversalStrategy,
  momentumVolumeStrategy,
  pullbackContinuationStrategy
];
