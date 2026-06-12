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

// Collapse the raw per-bar signals into discrete trades. A long run of the same
// directional signal on consecutive bars is a single setup, not one trade per
// day, so only the first bar of each fresh run opens a trade. A NEUTRAL/no-clear
// bar closes the open position so the next directional bar can start a new one.
// This removes the autocorrelation that otherwise counts one bad swing as many
// separate losses and makes the win rate reflect distinct setups.
function collapseSignalsIntoTrades(signals) {
  const trades = [];
  let openDirection = null;

  signals.forEach((signal) => {
    const isDirectional = signal.signalType === 'BULLISH_REVERSAL' || signal.signalType === 'BEARISH_REVERSAL';

    if (!isDirectional) {
      openDirection = null;
      return;
    }

    if (signal.signalType === openDirection) {
      return;
    }

    openDirection = signal.signalType;

    const outcome = signal.tradeOutcome || null;
    const fallbackReturn = signedReturnForSignal(signal, 'return5d');
    const realizedReturn = Number.isFinite(outcome?.returnPercent)
      ? outcome.returnPercent
      : fallbackReturn;

    if (!Number.isFinite(realizedReturn)) {
      return;
    }

    trades.push({
      date: signal.date,
      label: signal.label,
      signalType: signal.signalType,
      win: outcome ? outcome.win === true : realizedReturn > 0,
      realizedReturn,
      futureReturns: signal.futureReturns
    });
  });

  return trades;
}

function buildSummary(signals) {
  const directionalSignals = signals.filter((signal) => (
    signal.signalType === 'BULLISH_REVERSAL' ||
    signal.signalType === 'BEARISH_REVERSAL'
  ));

  const trades = collapseSignalsIntoTrades(signals);
  const winningTrades = trades.filter((trade) => trade.win);
  const tradeReturns = trades.map((trade) => trade.realizedReturn);

  const bestTrade = trades.reduce((best, trade) => {
    if (!best || trade.realizedReturn > best.realizedReturn) {
      return trade;
    }
    return best;
  }, null);

  const worstTrade = trades.reduce((worst, trade) => {
    if (!worst || trade.realizedReturn < worst.realizedReturn) {
      return trade;
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
    winRate: trades.length ? round((winningTrades.length / trades.length) * 100) : 0,
    averageReturn1d: round(average(directionalSignals.map((signal) => signedReturnForSignal(signal, 'return1d')))),
    averageReturn3d: round(average(directionalSignals.map((signal) => signedReturnForSignal(signal, 'return3d')))),
    averageReturn5d: round(average(tradeReturns)),
    profitPercentage: calculateProfitPercentage(tradeReturns),
    maximumDrawdown: calculateMaxDrawdown(tradeReturns),
    riskRewardRatio: calculateRiskRewardRatio(tradeReturns),
    profitFactor: calculateProfitFactor(tradeReturns),
    sharpeRatio: calculateSharpeRatio(tradeReturns),
    tradeCount: trades.length,
    bestTrade: bestTrade ? {
      date: bestTrade.date,
      label: bestTrade.label,
      return5d: round(bestTrade.realizedReturn)
    } : null,
    worstTrade: worstTrade ? {
      date: worstTrade.date,
      label: worstTrade.label,
      return5d: round(worstTrade.realizedReturn)
    } : null
  };
}

module.exports = {
  average,
  buildSummary,
  percentageReturn,
  round
};
