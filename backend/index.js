const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const backtestRoutes = require('./routes/backtestRoutes');
const { getProviderStatus } = require('./services/marketDataService');

const app = express();
const PORT = process.env.PORT || 5002;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '';

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    const configuredOrigins = CLIENT_ORIGIN
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (!configuredOrigins.length) {
      callback(null, true);
      return;
    }

    const isLocalDev = !origin || /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):\d+$/.test(origin);
    const isConfigured = configuredOrigins.includes(origin);

    if (isLocalDev || isConfigured) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked origin ${origin}`));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'Stock Strategy Tester API',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    service: 'Stock Strategy Tester API',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    providers: getProviderStatus()
  });
});

app.use('/api', backtestRoutes);

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      message: `No route matched ${req.method} ${req.originalUrl}`
    });
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.name || 'ServerError',
    message: err.message || 'Unexpected server error'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Stock Strategy Tester API running on http://localhost:${PORT}`);
});
