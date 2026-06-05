const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'customStrategies.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function readCustomStrategies() {
  ensureStore();

  try {
    const rows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch (_error) {
    return [];
  }
}

function writeCustomStrategies(strategies) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(strategies, null, 2)}\n`, 'utf8');
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'custom-strategy';
}

function createCustomStrategy({ name, description }) {
  const cleanName = String(name || '').trim();
  const cleanDescription = String(description || '').trim();

  if (cleanName.length < 3) {
    const error = new Error('Strategy name must be at least 3 characters.');
    error.status = 400;
    error.name = 'ValidationError';
    throw error;
  }

  if (cleanDescription.length < 20) {
    const error = new Error('Strategy description must explain the rule in at least 20 characters.');
    error.status = 400;
    error.name = 'ValidationError';
    throw error;
  }

  const now = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const strategy = {
    id,
    strategyName: `custom-${slugify(cleanName)}-${id.slice(-6)}`,
    displayName: cleanName,
    description: cleanDescription,
    defaultParameters: {},
    source: 'custom',
    createdAt: now
  };
  const strategies = readCustomStrategies();
  strategies.push(strategy);
  writeCustomStrategies(strategies);
  return strategy;
}

module.exports = {
  createCustomStrategy,
  readCustomStrategies
};
