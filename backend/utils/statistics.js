function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) {
    return 0;
  }

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function percentageReturn(entry, exit) {
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry === 0) {
    return null;
  }

  return ((exit - entry) / entry) * 100;
}

function signedReturnForSignal(signal, horizonKey) {
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

function calculateMaxDrawdown(returns) {
  let equity = 100;
  let peak = equity;
  let maxDrawdown = 0;

  returns.filter(Number.isFinite).forEach((value) => {
    equity *= 1 + value / 100;
    peak = Math.max(peak, equity);
    const drawdown = ((peak - equity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  });

  return round(maxDrawdown);
}

function calculateProfitPercentage(returns) {
  const finalEquity = returns.filter(Number.isFinite).reduce((equity, value) => (
    equity * (1 + value / 100)
  ), 100);

  return round(finalEquity - 100);
}

function calculateRiskRewardRatio(returns) {
  const clean = returns.filter(Number.isFinite);
  const wins = clean.filter((value) => value > 0);
  const losses = clean.filter((value) => value < 0);
  const averageWin = average(wins);
  const averageLoss = Math.abs(average(losses));

  if (!averageLoss) {
    return wins.length ? round(averageWin) : 0;
  }

  return round(averageWin / averageLoss);
}

function calculateProfitFactor(returns) {
  const clean = returns.filter(Number.isFinite);
  const grossProfit = clean.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(clean.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));

  if (!grossLoss) {
    return grossProfit ? round(grossProfit) : 0;
  }

  return round(grossProfit / grossLoss);
}

function calculateSharpeRatio(returns) {
  const clean = returns.filter(Number.isFinite);
  if (clean.length < 2) {
    return 0;
  }

  const mean = average(clean);
  const variance = average(clean.map((value) => (value - mean) ** 2));
  const deviation = Math.sqrt(variance);

  return deviation ? round(mean / deviation) : 0;
}

function buildSummary(signals) {
  const directionalSignals = signals.filter((signal) => (
    signal.signalType === 'BULLISH_REVERSAL' ||
    signal.signalType === 'BEARISH_REVERSAL'
  ));

  const completedTrades = directionalSignals
    .map((signal) => ({
      ...signal,
      strategyReturn5d: signedReturnForSignal(signal, 'return5d')
    }))
    .filter((signal) => Number.isFinite(signal.strategyReturn5d));

  const winningTrades = completedTrades.filter((signal) => signal.strategyReturn5d > 0);
  const fiveDayReturns = completedTrades.map((signal) => signal.strategyReturn5d);

  const bestTrade = completedTrades.reduce((best, signal) => {
    if (!best || signal.strategyReturn5d > best.strategyReturn5d) {
      return signal;
    }
    return best;
  }, null);

  const worstTrade = completedTrades.reduce((worst, signal) => {
    if (!worst || signal.strategyReturn5d < worst.strategyReturn5d) {
      return signal;
    }
    return worst;
  }, null);

  const countByType = signals.reduce((acc, signal) => {
    acc[signal.signalType] = (acc[signal.signalType] || 0) + 1;
    return acc;
  }, {});

  return {
    totalSignals: signals.length,
    bullishSignals: countByType.BULLISH_REVERSAL || 0,
    bearishSignals: countByType.BEARISH_REVERSAL || 0,
    neutralSignals: countByType.NEUTRAL || 0,
    trendChangeSignals: countByType.POSSIBLE_TREND_CHANGE || 0,
    noClearSignals: countByType.NO_CLEAR_SIGNAL || 0,
    winRate: completedTrades.length ? round((winningTrades.length / completedTrades.length) * 100) : 0,
    averageReturn1d: round(average(directionalSignals.map((signal) => signedReturnForSignal(signal, 'return1d')))),
    averageReturn3d: round(average(directionalSignals.map((signal) => signedReturnForSignal(signal, 'return3d')))),
    averageReturn5d: round(average(fiveDayReturns)),
    profitPercentage: calculateProfitPercentage(fiveDayReturns),
    maximumDrawdown: calculateMaxDrawdown(fiveDayReturns),
    riskRewardRatio: calculateRiskRewardRatio(fiveDayReturns),
    profitFactor: calculateProfitFactor(fiveDayReturns),
    sharpeRatio: calculateSharpeRatio(fiveDayReturns),
    tradeCount: completedTrades.length,
    bestTrade: bestTrade ? {
      date: bestTrade.date,
      label: bestTrade.label,
      return5d: round(bestTrade.strategyReturn5d)
    } : null,
    worstTrade: worstTrade ? {
      date: worstTrade.date,
      label: worstTrade.label,
      return5d: round(worstTrade.strategyReturn5d)
    } : null
  };
}

module.exports = {
  average,
  buildSummary,
  percentageReturn,
  round
};
