const { average, round } = require('../utils/statistics');

function sma(data, index, period, field = 'close') {
  if (index + 1 < period) {
    return null;
  }

  return average(data.slice(index + 1 - period, index + 1).map((day) => day[field]));
}

function emaSeries(values, period) {
  const multiplier = 2 / (period + 1);
  const output = [];
  let previousEma = null;

  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      output.push(null);
      return;
    }

    if (index + 1 < period) {
      output.push(null);
      return;
    }

    if (previousEma === null) {
      previousEma = average(values.slice(index + 1 - period, index + 1));
    } else {
      previousEma = (value - previousEma) * multiplier + previousEma;
    }

    output.push(previousEma);
  });

  return output;
}

function standardDeviation(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) {
    return 0;
  }

  const mean = average(clean);
  const variance = average(clean.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function rsiSeries(data, period = 14) {
  const output = data.map(() => null);
  let averageGain = 0;
  let averageLoss = 0;

  for (let index = 1; index < data.length; index += 1) {
    const change = data[index].close - data[index - 1].close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    if (index <= period) {
      averageGain += gain;
      averageLoss += loss;

      if (index === period) {
        averageGain /= period;
        averageLoss /= period;
      }
    } else {
      averageGain = (averageGain * (period - 1) + gain) / period;
      averageLoss = (averageLoss * (period - 1) + loss) / period;
    }

    if (index >= period) {
      if (averageLoss === 0) {
        output[index] = 100;
      } else {
        const relativeStrength = averageGain / averageLoss;
        output[index] = 100 - (100 / (1 + relativeStrength));
      }
    }
  }

  return output;
}

function macdSeries(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const closes = data.map((day) => day.close);
  const fast = emaSeries(closes, fastPeriod);
  const slow = emaSeries(closes, slowPeriod);
  const macd = closes.map((_, index) => (
    Number.isFinite(fast[index]) && Number.isFinite(slow[index]) ? fast[index] - slow[index] : null
  ));
  const signal = emaSeries(macd, signalPeriod);
  const histogram = macd.map((value, index) => (
    Number.isFinite(value) && Number.isFinite(signal[index]) ? value - signal[index] : null
  ));

  return { macd, signal, histogram };
}

function bollingerBands(data, index, period = 20, multiplier = 2) {
  if (index + 1 < period) {
    return null;
  }

  const closes = data.slice(index + 1 - period, index + 1).map((day) => day.close);
  const middle = average(closes);
  const deviation = standardDeviation(closes);

  return {
    upper: middle + deviation * multiplier,
    middle,
    lower: middle - deviation * multiplier
  };
}

function stochasticSeries(data, kPeriod = 14, dPeriod = 3) {
  const k = data.map((_, index) => {
    if (index + 1 < kPeriod) {
      return null;
    }

    const window = data.slice(index + 1 - kPeriod, index + 1);
    const high = Math.max(...window.map((day) => day.high));
    const low = Math.min(...window.map((day) => day.low));

    if (high === low) {
      return 50;
    }

    return ((data[index].close - low) / (high - low)) * 100;
  });

  const d = k.map((_, index) => {
    if (index + 1 < kPeriod + dPeriod - 1) {
      return null;
    }

    return average(k.slice(index + 1 - dPeriod, index + 1));
  });

  return { k, d };
}

function atrSeries(data, period = 14) {
  const trueRanges = data.map((day, index) => {
    if (index === 0) {
      return day.high - day.low;
    }

    const previousClose = data[index - 1].close;
    return Math.max(
      day.high - day.low,
      Math.abs(day.high - previousClose),
      Math.abs(day.low - previousClose)
    );
  });

  return trueRanges.map((_, index) => {
    if (index + 1 < period) {
      return null;
    }

    return average(trueRanges.slice(index + 1 - period, index + 1));
  });
}

function highest(data, endIndex, period, field = 'high') {
  if (endIndex < period) {
    return null;
  }

  return Math.max(...data.slice(endIndex - period, endIndex).map((day) => day[field]));
}

function lowest(data, endIndex, period, field = 'low') {
  if (endIndex < period) {
    return null;
  }

  return Math.min(...data.slice(endIndex - period, endIndex).map((day) => day[field]));
}

function averageVolume(data, index, period = 20) {
  if (index < period) {
    return null;
  }

  return average(data.slice(index - period, index).map((day) => day.volume));
}

function latestAtr(data, period = 14) {
  const values = atrSeries(data, period).filter(Number.isFinite);
  return values[values.length - 1] || 0;
}

function roundNullable(value, digits = 2) {
  return Number.isFinite(value) ? round(value, digits) : null;
}

module.exports = {
  atrSeries,
  averageVolume,
  bollingerBands,
  emaSeries,
  highest,
  latestAtr,
  lowest,
  macdSeries,
  roundNullable,
  rsiSeries,
  sma,
  standardDeviation,
  stochasticSeries
};
