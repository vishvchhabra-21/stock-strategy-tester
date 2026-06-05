const boxStrategy = require('./boxStrategy');
const { readCustomStrategies } = require('./customStrategyStore');
const { createCustomStrategy } = require('./customStrategyRunner');
const technicalStrategies = require('./technicalStrategies');

function getStrategyMap() {
  return new Map([
    [boxStrategy.strategyName, boxStrategy],
    ...technicalStrategies.map((strategy) => [strategy.strategyName, strategy]),
    ...readCustomStrategies().map((strategy) => {
      const runnableStrategy = createCustomStrategy(strategy);
      return [runnableStrategy.strategyName, runnableStrategy];
    })
  ]);
}

function listStrategies() {
  return Array.from(getStrategyMap().values()).map((strategy) => ({
    strategyName: strategy.strategyName,
    displayName: strategy.displayName || formatStrategyName(strategy.strategyName),
    description: strategy.description,
    defaultParameters: strategy.defaultParameters,
    source: strategy.source || (strategy.displayName ? 'custom' : 'built-in')
  }));
}

function runStrategyByName(strategyName, data, parameters = {}) {
  const strategies = getStrategyMap();
  const strategy = strategies.get(strategyName);
  if (!strategy) {
    const error = new Error(`Unknown strategy: ${strategyName}`);
    error.status = 404;
    error.name = 'StrategyNotFoundError';
    throw error;
  }

  return strategy.runStrategy(data, {
    ...strategy.defaultParameters,
    ...removeUndefinedValues(parameters)
  });
}

function runAllStrategies(data, parameterMap = {}) {
  return Array.from(getStrategyMap().values()).map((strategy) => runStrategyByName(
    strategy.strategyName,
    data,
    parameterMap[strategy.strategyName] || {}
  ));
}

function removeUndefinedValues(values) {
  return Object.entries(values).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function formatStrategyName(strategyName) {
  const acronyms = new Map([
    ['rsi', 'RSI'],
    ['sma', 'SMA'],
    ['ema', 'EMA'],
    ['macd', 'MACD']
  ]);

  return String(strategyName || '')
    .split('-')
    .filter(Boolean)
    .map((part) => acronyms.get(part) || part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

module.exports = {
  listStrategies,
  runAllStrategies,
  runStrategyByName
};
