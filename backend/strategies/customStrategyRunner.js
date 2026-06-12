const { buildSummary, percentageReturn, round } = require('../utils/statistics');
const { evaluateTradeOutcome, trendAlignedSignalType } = require('../utils/tradeOutcome');
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

function makeSignal(day, index, signalType, confidence, explanation, extras, data) {
  const alignedType = trendAlignedSignalType(data, index, signalType);
  const stoodDown = alignedType !== signalType;
  const finalConfidence = stoodDown ? Math.min(round(confidence, 0), 40) : round(confidence, 0);
  const finalExplanation = stoodDown
    ? `${explanation} Signal stood down because it opposed the dominant trend.`
    : explanation;

  return {
    date: day.date,
    open: day.open,
    high: day.high,
    low: day.low,
    close: day.close,
    volume: day.volume,
    signalType: alignedType,
    label: LABELS[alignedType] || LABELS.NO_CLEAR_SIGNAL,
    confidence: finalConfidence,
    explanation: finalExplanation,
    futureReturns: futureReturns(data, index),
    tradeOutcome: evaluateTradeOutcome(data, index, alignedType),
    ...extras
  };
}

function buildResult(strategy, data, signals) {
  const latestSignal = signals[signals.length - 1] || null;
  const signalsByDate = new Map(signals.map((signal) => [signal.date, signal]));

  return {
    strategy: {
      strategyName: strategy.displayName || strategy.strategyName,
      description: strategy.description,
      parameters: strategy.defaultParameters || {},
      source: 'custom'
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

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function extractPeriods(text) {
  const numbers = [...text.matchAll(/\b(\d{1,3})\b/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 2 && value <= 250);

  return [...new Set(numbers)];
}

function buildRuleContext(description) {
  const text = description.toLowerCase();
  const periods = extractPeriods(text);

  return {
    text,
    usesRsi: text.includes('rsi'),
    usesMacd: text.includes('macd'),
    usesMovingAverage: hasAny(text, ['sma', 'ema', 'moving average', 'ma crossover', 'average crossover']),
    usesEma: text.includes('ema'),
    usesBreakout: hasAny(text, ['breakout', 'resistance', 'support', 'range high', 'range low', 'new high', 'new low']),
    usesVolume: hasAny(text, ['volume', 'volumes', 'high vol', 'strong vol']),
    usesGap: text.includes('gap'),
    usesBollinger: hasAny(text, ['bollinger', 'band']),
    usesStochastic: hasAny(text, ['stochastic', '%k', '%d']),
    usesCandle: hasAny(text, ['candle', 'wick', 'hammer', 'shooting star', 'doji', 'rejection']),
    fastPeriod: periods[0] || 9,
    slowPeriod: periods[1] || (periods[0] && periods[0] < 50 ? 50 : 21),
    lookback: periods.find((period) => period >= 5 && period <= 60) || 20
  };
}

function scoreCustomDay(day, index, data, context, precomputed) {
  const reasons = [];
  let buyScore = 0;
  let sellScore = 0;
  let matchedRules = 0;

  function buy(points, reason) {
    buyScore += points;
    reasons.push(reason);
  }

  function sell(points, reason) {
    sellScore += points;
    reasons.push(reason);
  }

  if (context.usesRsi && Number.isFinite(precomputed.rsi[index])) {
    matchedRules += 1;
    const rsi = precomputed.rsi[index];

    if (rsi <= 35) {
      buy(22, `RSI is ${round(rsi)}, showing oversold pressure.`);
    } else if (rsi >= 65) {
      sell(22, `RSI is ${round(rsi)}, showing overbought pressure.`);
    } else if (rsi >= 55) {
      buy(10, `RSI is ${round(rsi)}, giving mild bullish momentum.`);
    } else if (rsi <= 45) {
      sell(10, `RSI is ${round(rsi)}, giving mild bearish momentum.`);
    }
  }

  if (context.usesMacd && Number.isFinite(precomputed.macd[index]) && Number.isFinite(precomputed.macdSignal[index])) {
    matchedRules += 1;

    if (precomputed.macd[index] > precomputed.macdSignal[index]) {
      buy(20, 'MACD is above its signal line.');
    } else if (precomputed.macd[index] < precomputed.macdSignal[index]) {
      sell(20, 'MACD is below its signal line.');
    }
  }

  if (context.usesMovingAverage) {
    const fast = context.usesEma ? precomputed.fastEma[index] : precomputed.fastSma[index];
    const slow = context.usesEma ? precomputed.slowEma[index] : precomputed.slowSma[index];

    if (Number.isFinite(fast) && Number.isFinite(slow)) {
      matchedRules += 1;

      if (fast > slow && day.close > fast) {
        buy(22, `${context.usesEma ? 'EMA' : 'SMA'} fast average is above slow average and price is above the fast average.`);
      } else if (fast < slow && day.close < fast) {
        sell(22, `${context.usesEma ? 'EMA' : 'SMA'} fast average is below slow average and price is below the fast average.`);
      }
    }
  }

  if (context.usesBreakout) {
    const resistance = highest(data, index, context.lookback, 'high');
    const support = lowest(data, index, context.lookback, 'low');

    if (Number.isFinite(resistance) && Number.isFinite(support)) {
      matchedRules += 1;

      if (day.close > resistance) {
        buy(24, `Close broke above ${context.lookback}-day resistance.`);
      } else if (day.close < support) {
        sell(24, `Close broke below ${context.lookback}-day support.`);
      } else if (day.close <= support + (resistance - support) * 0.1) {
        buy(10, `Price is near ${context.lookback}-day support.`);
      } else if (day.close >= resistance - (resistance - support) * 0.1) {
        sell(10, `Price is near ${context.lookback}-day resistance.`);
      }
    }
  }

  if (context.usesVolume) {
    const avgVolume = averageVolume(data, index, 20);

    if (Number.isFinite(avgVolume) && avgVolume > 0) {
      matchedRules += 1;
      const volumeRatio = day.volume / avgVolume;

      if (volumeRatio >= 1.5 && day.close > day.open) {
        buy(16, `Volume is ${round(volumeRatio)}x average with a bullish candle.`);
      } else if (volumeRatio >= 1.5 && day.close < day.open) {
        sell(16, `Volume is ${round(volumeRatio)}x average with a bearish candle.`);
      }
    }
  }

  if (context.usesGap && index > 0) {
    matchedRules += 1;
    const previous = data[index - 1];
    const gapPercent = percentageReturn(previous.close, day.open);

    if (gapPercent >= 0.7 && day.close > day.open) {
      buy(18, `Gap-up of ${round(gapPercent)}% held into the close.`);
    } else if (gapPercent <= -0.7 && day.close < day.open) {
      sell(18, `Gap-down of ${round(gapPercent)}% held into the close.`);
    } else if (gapPercent >= 0.7 && day.close < day.open) {
      sell(14, 'Gap-up faded by the close.');
    } else if (gapPercent <= -0.7 && day.close > day.open) {
      buy(14, 'Gap-down recovered by the close.');
    }
  }

  if (context.usesBollinger) {
    const bands = bollingerBands(data, index, 20, 2);

    if (bands) {
      matchedRules += 1;

      if (day.close < bands.lower) {
        buy(20, 'Close is below the lower Bollinger Band.');
      } else if (day.close > bands.upper) {
        sell(20, 'Close is above the upper Bollinger Band.');
      }
    }
  }

  if (context.usesStochastic && Number.isFinite(precomputed.stochasticK[index]) && Number.isFinite(precomputed.stochasticD[index])) {
    matchedRules += 1;

    if (precomputed.stochasticK[index] <= 20 && precomputed.stochasticK[index] > precomputed.stochasticD[index]) {
      buy(20, 'Stochastic is oversold and %K is above %D.');
    } else if (precomputed.stochasticK[index] >= 80 && precomputed.stochasticK[index] < precomputed.stochasticD[index]) {
      sell(20, 'Stochastic is overbought and %K is below %D.');
    }
  }

  if (context.usesCandle && index >= 10) {
    matchedRules += 1;
    const body = Math.max(Math.abs(day.close - day.open), day.close * 0.001);
    const upperWick = day.high - Math.max(day.open, day.close);
    const lowerWick = Math.min(day.open, day.close) - day.low;
    const recentHigh = highest(data, index, 10, 'high');
    const recentLow = lowest(data, index, 10, 'low');

    if (lowerWick >= body * 2 && day.close > day.open && day.low <= recentLow) {
      buy(20, 'Long lower wick near recent lows shows buying rejection.');
    } else if (upperWick >= body * 2 && day.close < day.open && day.high >= recentHigh) {
      sell(20, 'Long upper wick near recent highs shows selling rejection.');
    }
  }

  if (matchedRules === 0) {
    const fast = precomputed.fastEma[index];
    const slow = precomputed.slowEma[index];
    const rsi = precomputed.rsi[index];

    if (Number.isFinite(fast) && Number.isFinite(slow) && Number.isFinite(rsi)) {
      if (fast > slow && rsi >= 52 && day.close > day.open) {
        buy(20, 'Generic fallback: EMA trend, RSI, and candle direction lean bullish.');
      } else if (fast < slow && rsi <= 48 && day.close < day.open) {
        sell(20, 'Generic fallback: EMA trend, RSI, and candle direction lean bearish.');
      } else {
        reasons.push('Generic fallback did not find a clear directional edge.');
      }
    }
  }

  return {
    buyScore,
    sellScore,
    reasons,
    matchedRules
  };
}

function createCustomStrategy(config) {
  return {
    strategyName: config.strategyName,
    displayName: config.displayName,
    description: config.description,
    defaultParameters: config.defaultParameters || {},
    runStrategy(data) {
      const context = buildRuleContext(config.description);
      const closes = data.map((day) => day.close);
      const macd = macdSeries(data);
      const stochastic = stochasticSeries(data, 14, 3);
      const precomputed = {
        rsi: rsiSeries(data, 14),
        macd: macd.macd,
        macdSignal: macd.signal,
        stochasticK: stochastic.k,
        stochasticD: stochastic.d,
        fastEma: emaSeries(closes, context.fastPeriod),
        slowEma: emaSeries(closes, context.slowPeriod),
        fastSma: data.map((_, index) => sma(data, index, context.fastPeriod)),
        slowSma: data.map((_, index) => sma(data, index, context.slowPeriod))
      };
      const signals = [];

      data.forEach((day, index) => {
        if (index < 20) return;

        const score = scoreCustomDay(day, index, data, context, precomputed);
        let signalType = 'NEUTRAL';
        let confidence = 35;

        if (score.buyScore > score.sellScore * 1.2 && score.buyScore >= 18) {
          signalType = 'BULLISH_REVERSAL';
          confidence = Math.min(92, 45 + score.buyScore);
        } else if (score.sellScore > score.buyScore * 1.2 && score.sellScore >= 18) {
          signalType = 'BEARISH_REVERSAL';
          confidence = Math.min(92, 45 + score.sellScore);
        }

        const explanation = score.reasons.length
          ? score.reasons.slice(0, 3).join(' ')
          : 'The custom strategy did not find a clear signal on this candle.';

        signals.push(makeSignal(day, index, signalType, confidence, explanation, {
          customBuyScore: roundNullable(score.buyScore),
          customSellScore: roundNullable(score.sellScore),
          matchedRules: score.matchedRules
        }, data));
      });

      return buildResult(this, data, signals);
    }
  };
}

module.exports = {
  createCustomStrategy
};
