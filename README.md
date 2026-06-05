# Stock Market Analysis App

This app helps you backtest stock strategies before taking a trade. It is built for learning and practice. It is not financial advice.

You can search a stock, check the chart, compare trading strategies, see buy/sell/hold signals, view entry and stop loss levels, and scan NSE/BSE stocks for possible intraday trades.

## What The Website Provides

- Stock search for Indian and global symbols such as `RELIANCE.NS`, `TCS.NS`, `INFY.NS`, `HDFCBANK.NS`, and `ICICIBANK.NS`
- Buy, Sell, or Hold signals
- Entry price, stop loss, and Target 1 / Target 2 / Target 3
- Risk-reward such as `1:2`, `1:2.5`, or `1:3`
- Position size calculator based on account size and risk per trade
- Candlestick chart with volume and signal markers
- Support, resistance, moving averages, RSI, MACD, Bollinger Bands, volume, and candle pattern checks
- Backtest results such as win rate, profit, risk, and past trade history
- Strategy comparison to find which trading strategy worked best for a stock
- NSE/BSE intraday scanner for tomorrow watchlist or live market candidates
- Company strength check using available fundamental data
- News mood check using available market news
- Simple AI-style explanation of why a stock is selected

## Main Pages

### Strategy Back Tester

Use this when you want to backtest one trading method on one stock.

1. Enter a stock symbol.
2. Choose the time period.
3. Run the test.
4. Check the latest signal, chart, past results, and trade history.

### Compare Strategies

Use this when you want the app to compare many trading strategies for one stock.

The app shows:

- Best strategy for that stock
- Buy / Sell / Hold view
- Confidence
- Entry, stop loss, and targets
- Overall score
- Chart strength, company strength, price model, and news mood

### Stock Signals

Use this when you want a quick trade view.

The app shows:

- Final Buy / Sell / Hold signal
- Why the signal is given
- Entry, stop loss, and three targets
- Position size based on your account size
- Risk warning

### Intraday Scanner

Use this to scan NSE/BSE stocks.

If the market is closed, it shows a watchlist for the next trading session.

If the market is open, it shows stocks that look good for intraday at that time.

You can choose:

- NSE, BSE, or both
- How many stocks to scan
- How many top results to show

## Data Sources

The app uses real market data where available:

- Yahoo Finance chart and quote data
- NSE listed stock data
- Groww instrument list for NSE/BSE symbols
- NSE bhavcopy data for high-volume stocks

Some company or news data may not always be available. If a source fails, the app shows a fallback message instead of fake data.

Optional API keys can be added later in `backend/.env`:

```env
ALPHA_VANTAGE_API_KEY=
TWELVE_DATA_API_KEY=
FMP_API_KEY=
NEWS_API_KEY=
```

API keys are backend-only and must not be exposed in the frontend.

## How To Run Locally

Install dependencies from the project root:

```bash
npm install
```

Start the app:

```bash
npm start
```

Open on laptop:

```text
http://localhost:5174
```

Open on phone on the same Wi-Fi:

```text
http://YOUR-LAPTOP-IP:5174
```

Example:

```text
http://192.168.1.41:5174
```

Backend health check:

```text
http://localhost:5002/api/health
```

## Project Structure

```text
backend/
  analysis/                 AI-style analysis modules
  routes/                   API routes
  services/                 Market data fetching
  strategies/               Trading methods and scanner
  utils/                    Shared calculations

frontend/
  src/components/           Website screens and cards
  src/services/api.js       Frontend API calls
  src/App.jsx               Main app shell
```

## Current Trading Checks

The app studies:

- Moving averages
- RSI
- MACD
- Bollinger Bands
- Volume strength
- Support and resistance
- Previous day high-low box
- Breakout and breakdown
- Hammer, shooting star, doji, engulfing, and wick candles
- Short-term price model with walk-forward testing
- Python ML worker for XGBoost, LightGBM, LSTM, GRU, Prophet, and ARIMA-style forecasts
- Level 1 XGBoost false-signal filter that can block weak Buy/Sell setups
- Level 3 FinBERT financial-news sentiment context where news is available
- Intraday signal filters for VWAP, EMA trend, opening range, momentum, pullback, reversal wick, gap, pivot, Supertrend, MACD, Donchian channel, Bollinger expansion, stochastic reversal, and ADX trend strength
- Intraday confidence calibration with completed-candle handling and walk-forward validation where enough same-session data exists
- Company strength where data is available
- News mood where data is available

## Important Disclaimer

This is not financial advice. Use at your own risk.

The app is made for education and trade planning. Always verify levels, news, liquidity, and risk before taking a trade.

## Future Scope

- Full background scan of all NSE/BSE stocks with saved cache
- Better company data from paid APIs
- Better news and sentiment APIs
- User watchlists
- Alerts
- Paper trading
- Portfolio tracking
- Broker integration
- Login and saved trade journal

## Python ML And Sentiment Workers

The backend calls `backend/analysis/python_ml_worker.py` during market analysis. It returns a combined ML score, then applies a Level 1 false-signal filter. If `xgboost` is installed, that filter trains an `XGBClassifier` on historical follow-through labels; otherwise it falls back safely.

The backend also calls `backend/analysis/finbert_sentiment_worker.py` for Level 3 context. If `transformers` and `torch` are installed, it uses `ProsusAI/finbert`; otherwise it falls back to a finance keyword model.

Optional Python ML packages:

```bash
pip install -r backend/requirements-ml.txt
```

Optional backend environment variables:

```env
PYTHON_ML_COMMAND=python
PYTHON_ML_TIMEOUT_MS=12000
FINBERT_TIMEOUT_MS=15000
FINBERT_DISABLED=0
```

If Python is unavailable or a worker fails, the backend automatically falls back to the built-in JavaScript ML and sentiment models.
