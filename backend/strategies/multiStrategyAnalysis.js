const {
  atrSeries,
  emaSeries,
  latestAtr,
  macdSeries,
  rsiSeries,
  standardDeviation,
  stochasticSeries
} = require('./technicalIndicators');
const { round } = require('../utils/statistics');

const DIRECTIONAL_SIGNALS = new Set(['BULLISH_REVERSAL', 'BEARISH_REVERSAL']);

function directionFromSignal(signalType) {
  if (signalType === 'BULLISH_REVERSAL') return 'BUY';
  if (signalType === 'BEARISH_REVERSAL') return 'SELL';
  return 'HOLD';
}

function signedReturnForSignal(signal, horizonKey = 'return5d') {
  const rawReturn = signal.futureReturns?.[horizonKey];
  if (!Number.isFinite(rawReturn)) {
    return null;
  }

  if (signal.signalType === 'BULLISH_REVERSAL') {
    return rawReturn;
  }

  if (signal.signalType === 'BEARISH_REVERSAL') {
    return -rawReturn;
  }

  return null;
}

function scoreStrategy(result) {
  const summary = result.summary || {};
  const directionalSignals = (summary.bullishSignals || 0) + (summary.bearishSignals || 0);
  const drawdownPenalty = Math.min(20, summary.maximumDrawdown || 0) * 0.7;
  const riskRewardBonus = Math.min(12, (summary.riskRewardRatio || 0) * 3);
  const activityScore = Math.min(15, directionalSignals / 5);
  return round(
    (summary.winRate || 0) * 0.45 +
    (summary.profitPercentage || 0) * 1.4 +
    (summary.averageReturn5d || 0) * 8 +
    riskRewardBonus +
    activityScore -
    drawdownPenalty
  );
}

function buildVotes(strategyResults) {
  return strategyResults.reduce((acc, result) => {
    const latest = result.signals[result.signals.length - 1];
    const direction = directionFromSignal(latest?.signalType);
    const rankScore = Math.max(5, scoreStrategy(result));
    const weight = rankScore * ((latest?.confidence || 35) / 100);

    if (direction === 'BUY') {
      acc.buy += weight;
    } else if (direction === 'SELL') {
      acc.sell += weight;
    } else {
      acc.hold += Math.max(3, weight * 0.4);
    }

    return acc;
  }, { buy: 0, sell: 0, hold: 0 });
}

function decide(votes) {
  const buy = votes.buy;
  const sell = votes.sell;
  const hold = votes.hold;

  if (buy > sell * 1.15 && buy > hold * 0.8) return 'BUY';
  if (sell > buy * 1.15 && sell > hold * 0.8) return 'SELL';
  return 'HOLD';
}

function rewardLabel(ratio) {
  return Number.isInteger(ratio) ? String(ratio) : ratio.toFixed(1);
}

function chooseRewardRatio({ confidence = 0, directionalEdge = 0, historicalRiskReward = 0 }) {
  if (confidence >= 78 && directionalEdge >= 0.35 && historicalRiskReward >= 2.2) {
    return 3;
  }

  if (confidence >= 65 && directionalEdge >= 0.25 && historicalRiskReward >= 1.7) {
    return 2.5;
  }

  return 2;
}

function riskPlan(data, decision, options = {}) {
  const latest = data[data.length - 1];
  const entry = latest.close;
  const atr = latestAtr(data, 14);
  const stopDistance = atr ? atr * 1.5 : entry * 0.03;
  const rewardRatio = chooseRewardRatio(options);
  const targetDistance = stopDistance * rewardRatio;
  const riskReward = `1:${rewardLabel(rewardRatio)}`;
  const note = `${riskReward} selected from signal confidence, vote edge, and historical risk/reward.`;

  if (decision === 'BUY') {
    return {
      entry: round(entry),
      stopLoss: round(entry - stopDistance),
      target: round(entry + targetDistance),
      riskReward,
      atr14: round(atr),
      rewardRatio,
      note
    };
  }

  if (decision === 'SELL') {
    return {
      entry: round(entry),
      stopLoss: round(entry + stopDistance),
      target: round(entry - targetDistance),
      riskReward,
      atr14: round(atr),
      rewardRatio,
      note
    };
  }

  return {
    entry: round(entry),
    stopLoss: null,
    target: null,
    riskReward: null,
    atr14: round(atr),
    rewardRatio: null,
    note: 'No trade plan generated because the combined strategy decision is Hold.'
  };
}

function explainDecision(decision, bestStrategy) {
  const bestName = bestStrategy?.strategy?.strategyName || 'No strategy';
  const bestProfit = bestStrategy?.summary?.profitPercentage || 0;
  const bestWinRate = bestStrategy?.summary?.winRate || 0;

  if (decision === 'BUY') {
    return `Combined strategy vote favors Buy. The strongest historical fit is ${bestName}, with ${round(bestWinRate)}% win rate and ${round(bestProfit)}% tested profit.`;
  }

  if (decision === 'SELL') {
    return `Combined strategy vote favors Sell. The strongest historical fit is ${bestName}, with ${round(bestWinRate)}% win rate and ${round(bestProfit)}% tested profit.`;
  }

  return `The strategy votes are mixed, so the safer educational output is Hold. Best historical fit is ${bestName}, but the latest signals do not agree strongly enough.`;
}

function buildEquityAndDrawdown(signals) {
  let equity = 100;
  let peak = 100;

  return signals
    .filter((signal) => DIRECTIONAL_SIGNALS.has(signal.signalType))
    .map((signal) => ({
      date: signal.date,
      value: signedReturnForSignal(signal, 'return5d')
    }))
    .filter((item) => Number.isFinite(item.value))
    .map((item) => {
      equity *= 1 + item.value / 100;
      peak = Math.max(peak, equity);
      const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

      return {
        date: item.date,
        return5d: round(item.value),
        equity: round(equity),
        drawdown: round(drawdown)
      };
    });
}

function calculateRiskReward(signals) {
  const returns = signals
    .filter((signal) => DIRECTIONAL_SIGNALS.has(signal.signalType))
    .map((signal) => signedReturnForSignal(signal, 'return5d'))
    .filter(Number.isFinite);
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  const averageWin = wins.length ? wins.reduce((sum, value) => sum + value, 0) / wins.length : 0;
  const averageLoss = losses.length ? Math.abs(losses.reduce((sum, value) => sum + value, 0) / losses.length) : 0;

  if (!averageLoss) {
    return wins.length ? round(averageWin) : 0;
  }

  return round(averageWin / averageLoss);
}

function detectMarketRegime(data) {
  if (!data.length) {
    return 'unknown';
  }

  const sample = data.slice(Math.max(0, data.length - 60));
  const first = sample[0]?.close;
  const latest = sample[sample.length - 1]?.close;
  const change = first ? ((latest - first) / first) * 100 : 0;
  const ranges = sample.map((day) => ((day.high - day.low) / Math.max(day.close, 1)) * 100);
  const averageRange = ranges.reduce((sum, value) => sum + value, 0) / Math.max(ranges.length, 1);

  if (Math.abs(change) >= 8 && averageRange < 4.5) {
    return change > 0 ? 'uptrend' : 'downtrend';
  }

  if (averageRange >= 5) {
    return 'volatile';
  }

  return 'sideways';
}

function insightForStrategy(strategy, regime) {
  const name = strategy.strategyName || '';
  const isTrend = ['sma-crossover', 'ema-trend', 'macd-strategy', 'breakout-strategy', 'volume-breakout', 'momentum-volume', 'pullback-continuation'].includes(name);
  const isMeanReversion = ['box-strategy', 'rsi-strategy', 'bollinger-bands', 'stochastic-oscillator', 'support-resistance', 'candle-reversal', 'pivot-points'].includes(name);

  if (isTrend) {
    return {
      worksBest: 'This strategy works best in trending markets with clean follow-through.',
      failsWhen: 'It can fail during sideways markets where breakouts reverse quickly.'
    };
  }

  if (isMeanReversion) {
    return {
      worksBest: 'This strategy works best when price stretches to an extreme and then mean-reverts.',
      failsWhen: 'It can fail in strong one-way trends because oversold or overbought conditions can persist.'
    };
  }

  if (regime === 'volatile') {
    return {
      worksBest: 'This strategy is most useful when volatility creates repeated tradeable swings.',
      failsWhen: 'It can fail when volatility expands without respecting recent levels.'
    };
  }

  return {
    worksBest: 'This strategy works best when its latest signals match the current market regime.',
    failsWhen: 'It can fail when recent price behavior changes faster than historical signals adapt.'
  };
}

function compareStrategy(result, index, bestName) {
  const latest = result.signals[result.signals.length - 1];
  const summary = result.summary || {};
  const riskRewardRatio = Number.isFinite(summary.riskRewardRatio)
    ? summary.riskRewardRatio
    : calculateRiskReward(result.signals || []);
  const curve = buildEquityAndDrawdown(result.signals || []);

  return {
    id: `strategy-${String.fromCharCode(65 + index)}`,
    label: `Strategy ${String.fromCharCode(65 + index)}`,
    strategyName: result.strategy.strategyName,
    description: result.strategy.description,
    source: result.strategy.source || 'built-in',
    latestSignal: result.latestSignal,
    latestDirection: directionFromSignal(latest?.signalType),
    latestConfidence: latest?.confidence || 0,
    latestExplanation: latest?.explanation || result.explanation,
    winRate: summary.winRate || 0,
    totalProfit: summary.profitPercentage || 0,
    profitPercentage: summary.profitPercentage || 0,
    maxDrawdown: summary.maximumDrawdown || 0,
    maximumDrawdown: summary.maximumDrawdown || 0,
    riskRewardRatio,
    averageReturn5d: summary.averageReturn5d || 0,
    totalSignals: summary.totalSignals || 0,
    bullishSignals: summary.bullishSignals || 0,
    bearishSignals: summary.bearishSignals || 0,
    rankScore: scoreStrategy({ ...result, summary: { ...summary, riskRewardRatio } }),
    recommended: result.strategy.strategyName === bestName,
    equityCurve: curve.map((item) => ({ date: item.date, value: item.equity })),
    drawdownCurve: curve.map((item) => ({ date: item.date, value: item.drawdown }))
  };
}

function buildSmartSignal(bestStrategy, period) {
  if (!bestStrategy) {
    return {
      action: 'HOLD',
      confidence: 0,
      explanation: 'No strategy had enough historical signals to generate a confident signal.'
    };
  }

  const action = bestStrategy.latestDirection || 'HOLD';
  const historicalConfidence = Math.min(95, Math.max(35, bestStrategy.rankScore + 20));
  const latestSignalWeight = Math.min(95, Math.max(25, bestStrategy.latestConfidence || 35));
  const confidence = action === 'HOLD'
    ? Math.min(70, round((historicalConfidence + latestSignalWeight) / 2, 0))
    : round((historicalConfidence * 0.55) + (latestSignalWeight * 0.45), 0);

  return {
    action,
    confidence,
    explanation: `This signal is generated because ${bestStrategy.strategyName} performed best over the last ${period} and its latest setup points to ${action}.`
  };
}

function buildResultInsights(bestStrategy, marketRegime) {
  if (!bestStrategy) {
    return [];
  }

  const regimeLabel = {
    uptrend: 'recent uptrend',
    downtrend: 'recent downtrend',
    sideways: 'sideways market',
    volatile: 'volatile market',
    unknown: 'unclear market'
  }[marketRegime] || 'current market';
  const behavior = insightForStrategy(bestStrategy, marketRegime);

  return [
    `Current stock regime looks like a ${regimeLabel}.`,
    behavior.worksBest,
    behavior.failsWhen,
    `${bestStrategy.strategyName} is recommended for this stock because it has the best blend of profit, win rate, drawdown control, and signal quality in this test.`
  ];
}

function summarizeStrategy(result) {
  const latest = result.signals[result.signals.length - 1];
  const summary = result.summary || {};
  const riskRewardRatio = Number.isFinite(summary.riskRewardRatio)
    ? summary.riskRewardRatio
    : calculateRiskReward(result.signals || []);

  return {
    strategyName: result.strategy.strategyName,
    description: result.strategy.description,
    source: result.strategy.source || 'built-in',
    latestSignal: result.latestSignal,
    latestDirection: directionFromSignal(latest?.signalType),
    latestConfidence: latest?.confidence || 0,
    latestExplanation: latest?.explanation || result.explanation,
    winRate: summary.winRate,
    profitPercentage: summary.profitPercentage,
    totalProfit: summary.profitPercentage,
    maxDrawdown: summary.maximumDrawdown,
    maximumDrawdown: summary.maximumDrawdown,
    riskRewardRatio,
    averageReturn5d: summary.averageReturn5d,
    totalSignals: summary.totalSignals,
    bullishSignals: summary.bullishSignals,
    bearishSignals: summary.bearishSignals,
    rankScore: scoreStrategy({ ...result, summary: { ...summary, riskRewardRatio } })
  };
}

function analyzeStrategies(data, strategyResults, options = {}) {
  const ranked = [...strategyResults]
    .map((result) => ({ result, score: scoreStrategy(result) }))
    .sort((a, b) => b.score - a.score);

  const bestStrategy = ranked[0]?.result || null;
  const bestName = bestStrategy?.strategy?.strategyName || '';
  const comparison = ranked.map(({ result }, index) => compareStrategy(result, index, bestName));
  const bestComparison = comparison[0] || null;
  const votes = buildVotes(strategyResults);
  const decision = decide(votes);
  const voteTotal = Math.max(votes.buy + votes.sell + votes.hold, 1);
  const directionalEdge = Math.abs(votes.buy - votes.sell) / voteTotal;
  const marketRegime = detectMarketRegime(data);
  const confidence = round(Math.min(95, Math.max(20, directionalEdge * 100 + 35)), 0);

  return {
    decision,
    confidence,
    votes: {
      buy: round(votes.buy),
      sell: round(votes.sell),
      hold: round(votes.hold),
      wait: round(votes.hold)
    },
    bestStrategy: bestStrategy ? summarizeStrategy(bestStrategy) : null,
    recommendedStrategy: bestComparison,
    smartSignal: buildSmartSignal(bestComparison, options.period || '1y'),
    riskPlan: riskPlan(data, decision, {
      confidence,
      directionalEdge,
      historicalRiskReward: bestComparison?.riskRewardRatio || 0
    }),
    explanation: explainDecision(decision, bestStrategy),
    insights: buildResultInsights(bestComparison, marketRegime),
    marketRegime,
    charts: {
      profitCurve: bestComparison?.equityCurve || [],
      drawdownCurve: bestComparison?.drawdownCurve || [],
      comparison: comparison.map((strategy) => ({
        strategyName: strategy.strategyName,
        winRate: strategy.winRate,
        totalProfit: strategy.totalProfit,
        maxDrawdown: strategy.maxDrawdown,
        riskRewardRatio: strategy.riskRewardRatio,
        rankScore: strategy.rankScore
      }))
    },
    comparison,
    strategies: comparison
  };
}

function latestSessionBars(intradayData) {
  if (!intradayData.length) {
    return [];
  }

  const latestDate = intradayData[intradayData.length - 1].date;
  return intradayData.filter((bar) => bar.date === latestDate);
}

function latestCompletedSessionBars(intradayData) {
  const session = latestSessionBars(intradayData);
  if (session.length > 30 && Number(session[session.length - 1]?.volume || 0) <= 0) {
    return session.slice(0, -1);
  }

  return session;
}

function previousSessionSummary(intradayData, currentDate) {
  const previousDates = [...new Set(intradayData.map((bar) => bar.date))]
    .filter((date) => date < currentDate)
    .sort();
  const previousDate = previousDates[previousDates.length - 1];

  if (!previousDate) {
    return null;
  }

  const bars = intradayData.filter((bar) => bar.date === previousDate);
  if (!bars.length) {
    return null;
  }

  return {
    date: previousDate,
    high: Math.max(...bars.map((bar) => bar.high)),
    low: Math.min(...bars.map((bar) => bar.low)),
    close: bars[bars.length - 1].close
  };
}

function calculateSessionVwap(bars) {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  return bars.map((bar) => {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativePriceVolume += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;

    return cumulativeVolume ? cumulativePriceVolume / cumulativeVolume : bar.close;
  });
}

function averagePositive(values) {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!clean.length) {
    return null;
  }

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function hasVolumeConfirmation(volumeRatio, threshold = 1.1) {
  return Number.isFinite(volumeRatio) && volumeRatio >= threshold;
}

function volumePhrase(volumeRatio) {
  return Number.isFinite(volumeRatio)
    ? `${round(volumeRatio)}x volume`
    : 'volume data is unavailable';
}

function percentChange(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) {
    return null;
  }

  return ((to - from) / from) * 100;
}

function intradayVote(name, direction, confidence, reason) {
  return {
    name,
    direction,
    confidence: round(confidence, 0),
    reason
  };
}

function bollingerSnapshot(bars, period = 20, multiplier = 2) {
  if (bars.length < period) {
    return null;
  }

  const closes = bars.slice(-period).map((bar) => bar.close);
  const middle = closes.reduce((sum, value) => sum + value, 0) / closes.length;
  const deviation = standardDeviation(closes);

  return {
    upper: middle + deviation * multiplier,
    middle,
    lower: middle - deviation * multiplier,
    widthPercent: middle ? ((deviation * multiplier * 2) / middle) * 100 : 0
  };
}

function adxSnapshot(bars, period = 14) {
  if (bars.length <= period * 2) {
    return { adx: null, plusDi: null, minusDi: null };
  }

  const rows = [];
  for (let index = 1; index < bars.length; index += 1) {
    const current = bars[index];
    const previous = bars[index - 1];
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;
    const trueRange = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    rows.push({ plusDm, minusDm, trueRange });
  }

  const dxRows = [];
  for (let index = period; index <= rows.length; index += 1) {
    const window = rows.slice(index - period, index);
    const tr = window.reduce((sum, row) => sum + row.trueRange, 0);
    const plus = window.reduce((sum, row) => sum + row.plusDm, 0);
    const minus = window.reduce((sum, row) => sum + row.minusDm, 0);
    const plusDi = tr ? (plus / tr) * 100 : 0;
    const minusDi = tr ? (minus / tr) * 100 : 0;
    const dx = plusDi + minusDi ? (Math.abs(plusDi - minusDi) / (plusDi + minusDi)) * 100 : 0;
    dxRows.push({ dx, plusDi, minusDi });
  }

  const latest = dxRows[dxRows.length - 1] || {};
  const adxWindow = dxRows.slice(-period).map((row) => row.dx);
  const adx = adxWindow.length
    ? adxWindow.reduce((sum, value) => sum + value, 0) / adxWindow.length
    : null;

  return {
    adx,
    plusDi: latest.plusDi,
    minusDi: latest.minusDi
  };
}

function supertrendSnapshot(bars, period = 10, multiplier = 2.4) {
  const atr = atrSeries(bars, period);
  let upperBand = null;
  let lowerBand = null;
  let direction = 'WAIT';
  let line = null;

  bars.forEach((bar, index) => {
    const atrValue = atr[index];
    if (!Number.isFinite(atrValue)) {
      return;
    }

    const midpoint = (bar.high + bar.low) / 2;
    const basicUpper = midpoint + multiplier * atrValue;
    const basicLower = midpoint - multiplier * atrValue;
    const previousClose = bars[index - 1]?.close || bar.close;
    upperBand = upperBand === null || basicUpper < upperBand || previousClose > upperBand ? basicUpper : upperBand;
    lowerBand = lowerBand === null || basicLower > lowerBand || previousClose < lowerBand ? basicLower : lowerBand;

    if (direction === 'SELL' && bar.close > upperBand) {
      direction = 'BUY';
    } else if (direction === 'BUY' && bar.close < lowerBand) {
      direction = 'SELL';
    } else if (direction === 'WAIT') {
      direction = bar.close >= midpoint ? 'BUY' : 'SELL';
    }

    line = direction === 'BUY' ? lowerBand : upperBand;
  });

  return { direction, line };
}

function recentHighLow(bars, period = 20) {
  if (bars.length <= period) {
    return { high: null, low: null };
  }

  const window = bars.slice(-period - 1, -1);
  return {
    high: Math.max(...window.map((bar) => bar.high)),
    low: Math.min(...window.map((bar) => bar.low))
  };
}

function scoreIntradayVotes(strategies) {
  return strategies.reduce((acc, strategy) => {
    if (strategy.direction === 'BUY') {
      acc.buy += strategy.confidence;
    } else if (strategy.direction === 'SELL') {
      acc.sell += strategy.confidence;
    } else {
      acc.wait += strategy.confidence * 0.45;
    }
    return acc;
  }, { buy: 0, sell: 0, wait: 0 });
}

function decideIntraday(scores, strategies) {
  const total = Math.max(scores.buy + scores.sell + scores.wait, 1);
  const buyConfirmations = strategies.filter((strategy) => strategy.direction === 'BUY' && strategy.confidence >= 58).length;
  const sellConfirmations = strategies.filter((strategy) => strategy.direction === 'SELL' && strategy.confidence >= 58).length;
  const buyEdge = (scores.buy - scores.sell) / total;
  const sellEdge = (scores.sell - scores.buy) / total;

  if (buyConfirmations >= 3 && scores.buy > scores.sell * 1.35 && scores.buy > scores.wait * 0.85 && buyEdge >= 0.18) {
    return 'BUY';
  }

  if (sellConfirmations >= 3 && scores.sell > scores.buy * 1.35 && scores.sell > scores.wait * 0.85 && sellEdge >= 0.18) {
    return 'SELL';
  }

  return 'WAIT';
}

function intradayConfidence(decision, scores, strategies, volumeRatio) {
  const total = Math.max(scores.buy + scores.sell + scores.wait, 1);
  const leadingScore = decision === 'BUY' ? scores.buy : decision === 'SELL' ? scores.sell : scores.wait;
  const directionalEdge = Math.abs(scores.buy - scores.sell) / total;

  if (decision === 'WAIT') {
    return round(Math.min(65, Math.max(25, 30 + (leadingScore / total) * 28 - directionalEdge * 18)), 0);
  }

  const confirmationCount = strategies.filter((strategy) => strategy.direction === decision && strategy.confidence >= 58).length;
  const volumeBonus = hasVolumeConfirmation(volumeRatio, 1.15) ? 4 : 0;
  return round(Math.min(92, Math.max(45, (leadingScore / total) * 64 + confirmationCount * 4 + volumeBonus + 18)), 0);
}

function validateIntradayPrediction(intradayData, options = {}) {
  const dailyBias = options.dailyBias || 'NEUTRAL';
  const session = latestCompletedSessionBars(intradayData);
  if (session.length < 45) {
    return {
      samples: 0,
      accuracy: 0,
      horizon: '15m',
      note: 'Not enough completed intraday candles for walk-forward validation.'
    };
  }

  const checks = [];
  for (let end = 32; end < session.length - 3; end += 3) {
    const currentBar = session[end - 1];
    const futureBar = session[end + 2];
    const prefix = intradayData.filter((bar) => bar.dateTime <= currentBar.dateTime);
    const prediction = intradayPrediction(prefix, { includeValidation: false, dailyBias });

    // Only score confident, committed calls. A trader acts on strong setups, so
    // judging the predictor on those is the honest measure of its accuracy.
    if (!['BUY', 'SELL'].includes(prediction.decision) || prediction.confidence < 58) {
      continue;
    }

    const actual = futureBar.close >= currentBar.close ? 'BUY' : 'SELL';
    checks.push({
      predicted: prediction.decision,
      actual,
      correct: prediction.decision === actual
    });
  }

  const correct = checks.filter((item) => item.correct).length;
  return {
    samples: checks.length,
    accuracy: checks.length ? round((correct / checks.length) * 100, 0) : 0,
    horizon: '15m',
    note: checks.length
      ? 'Walk-forward check uses earlier completed intraday candles and a 3-candle forward direction label.'
      : 'The filters were selective and produced no prior BUY/SELL validation samples today.'
  };
}

// Discipline thresholds. The whole point is to act like a careful trader who
// protects capital: only take A-grade, trend-aligned setups and otherwise WAIT.
const ADX_TREND_MIN = 20;          // below this the market has no real trend (chop)
const ATR_PERCENT_MIN = 0.08;      // below this the candle is too flat to trade
const ATR_PERCENT_MAX = 3.0;       // above this it is news-driven whipsaw territory
const OVEREXTENSION_ATR = 3.5;     // never chase more than this many ATRs from VWAP
const MIN_SESSION_BARS = 15;       // need enough completed candles to judge structure

function waitDecision(reasons) {
  return { decision: 'WAIT', confidence: 30, reasons };
}

// The core "should I trade?" brain. Returns BUY/SELL only when an independent
// set of confirmations (trend structure, location vs VWAP, momentum, directional
// strength) line up AND the higher-timeframe daily trend is not against it AND
// price is not over-extended. Anything less is a WAIT, with a plain-English
// reason so the user learns why the trade was skipped.
function disciplinedIntradayDecision(ctx) {
  const reasons = [];

  // 1) Hard protective gates --------------------------------------------------
  if (ctx.barsInSession < MIN_SESSION_BARS) {
    reasons.push('Not enough completed candles in this session yet, so no trade.');
    return waitDecision(reasons);
  }
  if (![ctx.ema9, ctx.ema21, ctx.ema50, ctx.vwap, ctx.rsi, ctx.macd, ctx.macdSignal].every(Number.isFinite)) {
    reasons.push('The trend structure is not fully formed yet, so there is no reliable read to trade.');
    return waitDecision(reasons);
  }
  if (!Number.isFinite(ctx.atrPercent) || ctx.atrPercent < ATR_PERCENT_MIN) {
    reasons.push('Volatility is too low right now; the market is flat with no tradeable edge.');
    return waitDecision(reasons);
  }
  if (ctx.atrPercent > ATR_PERCENT_MAX) {
    reasons.push('Volatility is abnormally high; staying out to avoid getting whipsawed.');
    return waitDecision(reasons);
  }

  // 2) Regime gate: only trade a real trend or a clean, volume-backed breakout -
  const adxStrong = Number.isFinite(ctx.adx) && ctx.adx >= ADX_TREND_MIN;
  const breakoutUp = ctx.close > ctx.openingHigh && ctx.volumeRatio >= 1.15;
  const breakoutDown = ctx.close < ctx.openingLow && ctx.volumeRatio >= 1.15;
  if (!adxStrong && !breakoutUp && !breakoutDown) {
    reasons.push(`Trend strength is weak (ADX ${Number.isFinite(ctx.adx) ? round(ctx.adx) : 'NA'}); no clean trend or breakout to trade.`);
    return waitDecision(reasons);
  }

  // 3) Directional confluence across independent families ---------------------
  const emaStackBull = ctx.ema9 > ctx.ema21 && ctx.ema21 >= ctx.ema50;
  const emaStackBear = ctx.ema9 < ctx.ema21 && ctx.ema21 <= ctx.ema50;
  const locBull = ctx.close > ctx.vwap;
  const locBear = ctx.close < ctx.vwap;
  // Momentum confirmation: MACD on the right side of its signal and RSI in the
  // healthy-trend band (not yet exhausted). The over-extension gate below is
  // what stops us chasing, so the RSI ceiling/floor here stays generous.
  const momBull = ctx.macd > ctx.macdSignal && ctx.rsi >= 50 && ctx.rsi <= 78;
  const momBear = ctx.macd < ctx.macdSignal && ctx.rsi <= 50 && ctx.rsi >= 22;
  const volOk = ctx.volumeRatio >= 1.1;
  const diBull = !Number.isFinite(ctx.plusDi) || !Number.isFinite(ctx.minusDi) || ctx.plusDi >= ctx.minusDi;
  const diBear = !Number.isFinite(ctx.plusDi) || !Number.isFinite(ctx.minusDi) || ctx.minusDi >= ctx.plusDi;

  // A trade needs trend structure (EMA stack), the right side of VWAP, agreeing
  // directional movement, and EITHER a strong ADX trend OR a volume breakout.
  // Momentum (MACD/RSI) is a confidence booster, not a hard gate, so a single
  // last candle cannot veto an otherwise textbook trend.
  const longSetup = emaStackBull && locBull && diBull && (adxStrong || (breakoutUp && volOk));
  const shortSetup = emaStackBear && locBear && diBear && (adxStrong || (breakoutDown && volOk));

  if (!longSetup && !shortSetup) {
    reasons.push('Trend, momentum, and price location do not agree, so there is no high-quality setup.');
    return waitDecision(reasons);
  }

  // 4) Higher-timeframe alignment: do not fight the daily trend ----------------
  if (longSetup && ctx.dailyBias === 'BEARISH') {
    reasons.push('Intraday looks bullish but the daily trend is down, so a long is too risky. Waiting.');
    return waitDecision(reasons);
  }
  if (shortSetup && ctx.dailyBias === 'BULLISH') {
    reasons.push('Intraday looks bearish but the daily trend is up, so a short is too risky. Waiting.');
    return waitDecision(reasons);
  }

  // 5) Never chase an over-extended move. Distance is measured from the fast EMA
  //    (not session VWAP, which lags far behind price in any real trend) so we
  //    only stand aside when price has sprinted away from its own trend line.
  if (longSetup && ctx.distanceFromFastAtr > OVEREXTENSION_ATR) {
    reasons.push('Price has sprinted far above its fast average; waiting for a pullback instead of chasing the long.');
    return waitDecision(reasons);
  }
  if (shortSetup && ctx.distanceFromFastAtr < -OVEREXTENSION_ATR) {
    reasons.push('Price has dropped far below its fast average; waiting for a bounce instead of chasing the short.');
    return waitDecision(reasons);
  }

  // 6) Approved trade: size up the confidence from how much lines up ----------
  const decision = longSetup ? 'BUY' : 'SELL';
  const momentumAligned = decision === 'BUY' ? momBull : momBear;
  const breakoutAligned = decision === 'BUY' ? breakoutUp : breakoutDown;
  const dailyAligned = ctx.dailyBias === (decision === 'BUY' ? 'BULLISH' : 'BEARISH');

  let confidence = 56;
  if (adxStrong) confidence += Math.min(15, (ctx.adx - ADX_TREND_MIN) * 0.6);
  if (momentumAligned) confidence += 8;
  if (volOk) confidence += 6;
  if (breakoutAligned) confidence += 6;
  if (dailyAligned) confidence += 8;
  if (ctx.supertrendDir === decision) confidence += 4;
  confidence = round(Math.min(92, confidence), 0);

  reasons.push(decision === 'BUY'
    ? `Aligned long: EMA9>EMA21>EMA50, price above VWAP, ADX ${Number.isFinite(ctx.adx) ? round(ctx.adx) : 'NA'}${dailyAligned ? ', and the daily trend is up' : ''}.`
    : `Aligned short: EMA9<EMA21<EMA50, price below VWAP, ADX ${Number.isFinite(ctx.adx) ? round(ctx.adx) : 'NA'}${dailyAligned ? ', and the daily trend is down' : ''}.`);

  return { decision, confidence, reasons };
}

// Daily (higher timeframe) trend bias used to keep intraday trades on the right
// side of the bigger move. Works for both bullish and bearish regimes.
function dailyTrendBias(dailyRows) {
  if (!Array.isArray(dailyRows) || dailyRows.length < 55) {
    return 'NEUTRAL';
  }

  const closes = dailyRows.map((row) => row.close).filter(Number.isFinite);
  if (closes.length < 55) {
    return 'NEUTRAL';
  }

  const ema20 = emaSeries(closes, 20).at(-1);
  const ema50 = emaSeries(closes, 50).at(-1);
  const price = closes.at(-1);
  if (!Number.isFinite(ema20) || !Number.isFinite(ema50)) {
    return 'NEUTRAL';
  }

  if (ema20 > ema50 && price > ema50) return 'BULLISH';
  if (ema20 < ema50 && price < ema50) return 'BEARISH';
  return 'NEUTRAL';
}

function intradayPrediction(intradayData, options = {}) {
  const includeValidation = options.includeValidation !== false;
  const dailyBias = options.dailyBias || 'NEUTRAL';
  const session = latestCompletedSessionBars(intradayData);

  if (session.length < 25) {
    return {
      decision: 'WAIT',
      confidence: 20,
      explanation: 'Not enough recent intraday candles are available, so the predictor says Wait.',
      reasons: [],
      strategies: [],
      metrics: {},
      validation: {
        samples: 0,
        accuracy: 0,
        horizon: '15m',
        note: 'Not enough completed intraday candles for walk-forward validation.'
      },
      riskPlan: {
        entry: null,
        stopLoss: null,
        target: null,
        riskReward: null
      },
      lastUpdated: intradayData[intradayData.length - 1]?.dateTime || null
    };
  }

  const latest = session[session.length - 1];
  const closes = session.map((bar) => bar.close);
  const ema9 = emaSeries(closes, 9);
  const ema21 = emaSeries(closes, 21);
  const ema50 = emaSeries(closes, 50);
  const rsi = rsiSeries(session, 14);
  const macd = macdSeries(session);
  const stochastic = stochasticSeries(session);
  const vwap = calculateSessionVwap(session);
  const atr = atrSeries(session, 14);
  const openingRange = session.slice(0, Math.min(6, session.length));
  const openingHigh = Math.max(...openingRange.map((bar) => bar.high));
  const openingLow = Math.min(...openingRange.map((bar) => bar.low));
  const previousSession = previousSessionSummary(intradayData, latest.date);
  const averageRecentVolume = averagePositive(
    session
      .slice(Math.max(0, session.length - 21), session.length - 1)
      .map((bar) => bar.volume)
  );
  const volumeRatio = averageRecentVolume && latest.volume > 0 ? latest.volume / averageRecentVolume : null;
  const currentVwap = vwap[vwap.length - 1];
  const currentEma9 = ema9[ema9.length - 1];
  const currentEma21 = ema21[ema21.length - 1];
  const currentEma50 = ema50[ema50.length - 1];
  const currentRsi = rsi[rsi.length - 1];
  const currentMacd = macd.macd[macd.macd.length - 1];
  const currentMacdSignal = macd.signal[macd.signal.length - 1];
  const currentMacdHistogram = macd.histogram[macd.histogram.length - 1];
  const previousMacdHistogram = macd.histogram[macd.histogram.length - 2];
  const currentStochasticK = stochastic.k[stochastic.k.length - 1];
  const currentStochasticD = stochastic.d[stochastic.d.length - 1];
  const previousStochasticK = stochastic.k[stochastic.k.length - 2];
  const previousStochasticD = stochastic.d[stochastic.d.length - 2];
  const bollinger = bollingerSnapshot(session);
  const donchian = recentHighLow(session, 20);
  const adx = adxSnapshot(session);
  const supertrend = supertrendSnapshot(session);
  const body = Math.max(Math.abs(latest.close - latest.open), latest.close * 0.0005);
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;
  const gapPercent = previousSession ? percentChange(previousSession.close, session[0].open) : null;
  const strategies = [];

  strategies.push(latest.close > currentVwap && latest.close > latest.open
    ? intradayVote('VWAP Trend', 'BUY', 68, 'Price is above VWAP and the latest candle is bullish.')
    : latest.close < currentVwap && latest.close < latest.open
      ? intradayVote('VWAP Trend', 'SELL', 68, 'Price is below VWAP and the latest candle is bearish.')
      : intradayVote('VWAP Trend', 'WAIT', 42, 'Price is not giving a clean VWAP direction.'));

  strategies.push(currentEma9 > currentEma21 && latest.close > currentEma9
    ? intradayVote('EMA Scalping Trend', 'BUY', 66, 'EMA 9 is above EMA 21 and price is holding above the fast average.')
    : currentEma9 < currentEma21 && latest.close < currentEma9
      ? intradayVote('EMA Scalping Trend', 'SELL', 66, 'EMA 9 is below EMA 21 and price is holding below the fast average.')
      : intradayVote('EMA Scalping Trend', 'WAIT', 42, 'The fast and slow EMAs are not giving a clean scalp direction.'));

  strategies.push(latest.close > openingHigh && hasVolumeConfirmation(volumeRatio, 1.1)
    ? intradayVote('Opening Range Breakout', 'BUY', 72, 'Price is above the opening range high with volume confirmation.')
    : latest.close < openingLow && hasVolumeConfirmation(volumeRatio, 1.1)
      ? intradayVote('Opening Range Breakout', 'SELL', 72, 'Price is below the opening range low with volume confirmation.')
      : intradayVote('Opening Range Breakout', 'WAIT', 40, 'Price is inside the opening range or volume is not confirming a breakout.'));

  strategies.push(currentRsi >= 56 && hasVolumeConfirmation(volumeRatio, 1.2) && latest.close > latest.open
    ? intradayVote('Momentum With Volume', 'BUY', 70, `RSI is ${round(currentRsi)} with ${volumePhrase(volumeRatio)} and a bullish candle.`)
    : currentRsi <= 44 && hasVolumeConfirmation(volumeRatio, 1.2) && latest.close < latest.open
      ? intradayVote('Momentum With Volume', 'SELL', 70, `RSI is ${round(currentRsi)} with ${volumePhrase(volumeRatio)} and a bearish candle.`)
      : intradayVote('Momentum With Volume', 'WAIT', 42, `RSI is ${round(currentRsi)} and ${volumePhrase(volumeRatio)}, so momentum is not decisive.`));

  strategies.push(currentEma9 > currentEma21 && latest.low <= currentEma9 * 1.002 && latest.close > currentEma9
    ? intradayVote('Pullback Continuation', 'BUY', 62, 'Price pulled back near EMA 9 in an uptrend and recovered.')
    : currentEma9 < currentEma21 && latest.high >= currentEma9 * 0.998 && latest.close < currentEma9
      ? intradayVote('Pullback Continuation', 'SELL', 62, 'Price pulled back near EMA 9 in a downtrend and rejected.')
      : intradayVote('Pullback Continuation', 'WAIT', 38, 'No clean pullback continuation setup is visible.'));

  strategies.push(currentRsi <= 38 && lowerWick >= body * 1.8
    ? intradayVote('Reversal Wick', 'BUY', 64, 'RSI is low and the latest candle has a long lower wick.')
    : currentRsi >= 62 && upperWick >= body * 1.8
      ? intradayVote('Reversal Wick', 'SELL', 64, 'RSI is high and the latest candle has a long upper wick.')
      : intradayVote('Reversal Wick', 'WAIT', 38, 'The latest candle does not show a strong reversal wick.'));

  strategies.push(Number.isFinite(gapPercent) && gapPercent >= 0.4 && latest.close > session[0].open && hasVolumeConfirmation(volumeRatio, 1.1)
    ? intradayVote('Gap And Go', 'BUY', 66, `Opening gap is +${round(gapPercent)}% and price is holding above the open.`)
    : Number.isFinite(gapPercent) && gapPercent <= -0.4 && latest.close < session[0].open && hasVolumeConfirmation(volumeRatio, 1.1)
      ? intradayVote('Gap And Go', 'SELL', 66, `Opening gap is ${round(gapPercent)}% and price is holding below the open.`)
      : Number.isFinite(gapPercent) && gapPercent >= 0.4 && latest.close < session[0].open
        ? intradayVote('Gap And Go', 'SELL', 58, 'Gap-up open is fading below the opening price.')
        : Number.isFinite(gapPercent) && gapPercent <= -0.4 && latest.close > session[0].open
          ? intradayVote('Gap And Go', 'BUY', 58, 'Gap-down open is recovering above the opening price.')
          : intradayVote('Gap And Go', 'WAIT', 36, 'There is no meaningful gap setup from the previous session.'));

  if (previousSession) {
    const pivot = (previousSession.high + previousSession.low + previousSession.close) / 3;
    const resistance1 = 2 * pivot - previousSession.low;
    const support1 = 2 * pivot - previousSession.high;
    strategies.push(latest.close > resistance1
      ? intradayVote('Pivot Point', 'BUY', 64, 'Price is above first pivot resistance.')
      : latest.close < support1
        ? intradayVote('Pivot Point', 'SELL', 64, 'Price is below first pivot support.')
        : intradayVote('Pivot Point', 'WAIT', 38, 'Price is between first pivot support and resistance.'));
  } else {
    strategies.push(intradayVote('Pivot Point', 'WAIT', 36, 'Previous session data is not available for pivot levels.'));
  }

  strategies.push(supertrend.direction === 'BUY' && latest.close > supertrend.line
    ? intradayVote('Supertrend Filter', 'BUY', 67, 'Price is above the intraday Supertrend line.')
    : supertrend.direction === 'SELL' && latest.close < supertrend.line
      ? intradayVote('Supertrend Filter', 'SELL', 67, 'Price is below the intraday Supertrend line.')
      : intradayVote('Supertrend Filter', 'WAIT', 39, 'Supertrend does not confirm a clean direction.'));

  strategies.push(Number.isFinite(currentMacdHistogram) && Number.isFinite(previousMacdHistogram) && currentMacd > currentMacdSignal && currentMacdHistogram > previousMacdHistogram && latest.close > currentVwap
    ? intradayVote('MACD Scalping Momentum', 'BUY', 64, 'MACD is above signal, histogram is improving, and price is above VWAP.')
    : Number.isFinite(currentMacdHistogram) && Number.isFinite(previousMacdHistogram) && currentMacd < currentMacdSignal && currentMacdHistogram < previousMacdHistogram && latest.close < currentVwap
      ? intradayVote('MACD Scalping Momentum', 'SELL', 64, 'MACD is below signal, histogram is weakening, and price is below VWAP.')
      : intradayVote('MACD Scalping Momentum', 'WAIT', 38, 'MACD momentum is not aligned with VWAP.'));

  strategies.push(Number.isFinite(donchian.high) && latest.close > donchian.high && hasVolumeConfirmation(volumeRatio, 1.05)
    ? intradayVote('Donchian Breakout', 'BUY', 66, 'Price broke the recent intraday high with volume confirmation.')
    : Number.isFinite(donchian.low) && latest.close < donchian.low && hasVolumeConfirmation(volumeRatio, 1.05)
      ? intradayVote('Donchian Breakout', 'SELL', 66, 'Price broke the recent intraday low with volume confirmation.')
      : intradayVote('Donchian Breakout', 'WAIT', 38, 'Price has not broken the recent intraday channel.'));

  strategies.push(bollinger && latest.close > bollinger.upper && bollinger.widthPercent >= 0.8 && hasVolumeConfirmation(volumeRatio, 1.05)
    ? intradayVote('Bollinger Expansion', 'BUY', 63, 'Price closed above the upper Bollinger band during intraday expansion.')
    : bollinger && latest.close < bollinger.lower && bollinger.widthPercent >= 0.8 && hasVolumeConfirmation(volumeRatio, 1.05)
      ? intradayVote('Bollinger Expansion', 'SELL', 63, 'Price closed below the lower Bollinger band during intraday expansion.')
      : intradayVote('Bollinger Expansion', 'WAIT', 37, 'Bollinger bands do not show a confirmed expansion breakout.'));

  strategies.push(Number.isFinite(currentStochasticK) && Number.isFinite(currentStochasticD) && Number.isFinite(previousStochasticK) && Number.isFinite(previousStochasticD) && previousStochasticK <= previousStochasticD && currentStochasticK > currentStochasticD && currentStochasticK <= 35
    ? intradayVote('Stochastic Reversal', 'BUY', 58, 'Stochastic crossed up from the lower zone.')
    : Number.isFinite(currentStochasticK) && Number.isFinite(currentStochasticD) && Number.isFinite(previousStochasticK) && Number.isFinite(previousStochasticD) && previousStochasticK >= previousStochasticD && currentStochasticK < currentStochasticD && currentStochasticK >= 65
      ? intradayVote('Stochastic Reversal', 'SELL', 58, 'Stochastic crossed down from the upper zone.')
      : intradayVote('Stochastic Reversal', 'WAIT', 35, 'Stochastic does not show a high-quality reversal cross.'));

  strategies.push(Number.isFinite(adx.adx) && adx.adx >= 20 && adx.plusDi > adx.minusDi && latest.close > currentEma50
    ? intradayVote('ADX Trend Strength', 'BUY', 62, 'ADX shows trend strength with positive directional movement.')
    : Number.isFinite(adx.adx) && adx.adx >= 20 && adx.minusDi > adx.plusDi && latest.close < currentEma50
      ? intradayVote('ADX Trend Strength', 'SELL', 62, 'ADX shows trend strength with negative directional movement.')
      : intradayVote('ADX Trend Strength', 'WAIT', 36, 'ADX trend strength is not strong enough for confirmation.'));

  const scores = scoreIntradayVotes(strategies);
  const latestAtrValue = atr.filter(Number.isFinite).at(-1) || latest.close * 0.003;
  const atrPercent = (latestAtrValue / Math.max(latest.close, 1)) * 100;
  const distanceFromFastAtr = latestAtrValue && Number.isFinite(currentEma9)
    ? (latest.close - currentEma9) / latestAtrValue
    : 0;

  // Replace the old "always pick a side" vote with a disciplined trader brain
  // that mostly waits and only commits to A-grade, trend-aligned setups.
  const disciplined = disciplinedIntradayDecision({
    close: latest.close,
    vwap: currentVwap,
    ema9: currentEma9,
    ema21: currentEma21,
    ema50: currentEma50,
    rsi: currentRsi,
    macd: currentMacd,
    macdSignal: currentMacdSignal,
    macdHist: currentMacdHistogram,
    macdHistPrev: previousMacdHistogram,
    adx: adx.adx,
    plusDi: adx.plusDi,
    minusDi: adx.minusDi,
    supertrendDir: supertrend.direction,
    atrPercent,
    distanceFromFastAtr,
    volumeRatio,
    openingHigh,
    openingLow,
    dailyBias,
    barsInSession: session.length
  });

  const decision = disciplined.decision;
  const totalScore = Math.max(scores.buy + scores.sell + scores.wait, 1);
  const validation = includeValidation ? validateIntradayPrediction(intradayData, { dailyBias }) : null;
  const confidence = validation?.samples >= 5 ? disciplined.confidence : Math.min(disciplined.confidence, 72);
  const stopDistance = latestAtrValue * 1.4;
  const directionalEdge = Math.abs(scores.buy - scores.sell) / totalScore;
  const rewardRatio = decision === 'WAIT'
    ? null
    : confidence >= 78
      ? 2.5
      : confidence >= 66
        ? 2
        : 1.8;
  const targetDistance = rewardRatio ? stopDistance * rewardRatio : null;
  const riskReward = rewardRatio ? `1:${rewardLabel(rewardRatio)}` : null;
  const riskNote = riskReward
    ? `${riskReward} selected from a trend-aligned, confluence-confirmed setup.`
    : 'No trade plan generated because discipline says wait for a better setup.';
  const riskPlan = decision === 'BUY'
    ? {
        entry: round(latest.close),
        stopLoss: round(latest.close - stopDistance),
        target: round(latest.close + targetDistance),
        riskReward,
        rewardRatio,
        note: riskNote
      }
    : decision === 'SELL'
      ? {
          entry: round(latest.close),
          stopLoss: round(latest.close + stopDistance),
          target: round(latest.close - targetDistance),
          riskReward,
          rewardRatio,
          note: riskNote
        }
      : {
          entry: round(latest.close),
          stopLoss: null,
          target: null,
          riskReward: null,
          rewardRatio: null,
          note: riskNote
        };
  // Lead with the disciplined trade/no-trade reasoning, then add the supporting
  // sub-strategy views that agree with the final decision.
  const supportingReasons = strategies
    .filter((strategy) => strategy.direction === decision && decision !== 'WAIT')
    .slice(0, 4)
    .map((strategy) => `${strategy.name}: ${strategy.reason}`);
  const reasons = [...disciplined.reasons, ...supportingReasons].slice(0, 6);

  return {
    decision,
    confidence,
    explanation: decision === 'WAIT'
      ? `No trade: ${disciplined.reasons[0] || 'conditions are not favorable for a high-quality setup.'}`
      : `${decision} setup is trend-aligned and confirmed: ${disciplined.reasons[disciplined.reasons.length - 1]}`,
    reasons,
    strategies,
    votes: {
      buy: round(scores.buy),
      sell: round(scores.sell),
      wait: round(scores.wait)
    },
    metrics: {
      close: round(latest.close),
      vwap: round(currentVwap),
      ema9: round(currentEma9),
      ema21: round(currentEma21),
      ema50: Number.isFinite(currentEma50) ? round(currentEma50) : null,
      rsi14: round(currentRsi),
      macd: Number.isFinite(currentMacd) ? round(currentMacd) : null,
      macdSignal: Number.isFinite(currentMacdSignal) ? round(currentMacdSignal) : null,
      stochasticK: Number.isFinite(currentStochasticK) ? round(currentStochasticK) : null,
      stochasticD: Number.isFinite(currentStochasticD) ? round(currentStochasticD) : null,
      adx14: Number.isFinite(adx.adx) ? round(adx.adx) : null,
      openingHigh: round(openingHigh),
      openingLow: round(openingLow),
      volumeRatio: Number.isFinite(volumeRatio) ? round(volumeRatio) : null,
      gapPercent: Number.isFinite(gapPercent) ? round(gapPercent) : null,
      atr14: round(latestAtrValue)
    },
    validation,
    riskPlan,
    lastUpdated: latest.dateTime,
    candleTime: `${latest.date} ${latest.time}`
  };
}

module.exports = {
  analyzeStrategies,
  dailyTrendBias,
  intradayPrediction
};
