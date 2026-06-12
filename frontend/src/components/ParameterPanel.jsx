import { Play, Search } from 'lucide-react';
import { memo } from 'react';

const SAMPLE_STOCKS = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS'];

function ParameterPanel({
  form,
  onFormChange,
  onSubmit,
  loading,
  searching,
  suggestions,
  mostTradedStocks,
  onPickSuggestion,
  onSearch
}) {
  const displayedStocks = suggestions.length > 0 ? suggestions : mostTradedStocks;
  const listTitle = suggestions.length > 0
    ? `${suggestions.length} listed stocks found`
    : 'Most traded last week';

  return (
    <form onSubmit={onSubmit} className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="tag">BT · Backtest setup</span>
        <InfoButton text="Choose a stock, tune the strategy settings, and test how the method worked on past data." />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,1.4fr)_repeat(3,minmax(140px,0.75fr))_minmax(130px,0.55fr)_auto] lg:items-end">
        <div className="min-w-0">
          <FieldLabel
            htmlFor="stock-symbol"
            label="Stock symbol"
            help="Enter the stock code. Use RELIANCE.NS for NSE stocks or AAPL for US stocks."
          />
          <div className="flex gap-2">
            <input
              id="stock-symbol"
              value={form.symbol}
              onChange={(event) => onFormChange('symbol', event.target.value.toUpperCase())}
              placeholder="RELIANCE.NS"
              className="num min-h-11 w-full px-3 text-sm"
            />
            <button
              type="button"
              onClick={onSearch}
              disabled={searching || loading}
              title="Search symbol"
              className="btn-ghost min-h-11 w-11 shrink-0"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <NumberInput
          label="Near high/low range"
          help="How close today must be to yesterday's high or low. Higher values create more trade signals."
          value={form.boxTolerance}
          step="0.01"
          min="0.01"
          max="0.45"
          suffix="×"
          onChange={(value) => onFormChange('boxTolerance', value)}
        />
        <NumberInput
          label="Wick strength"
          help="How strong a candle rejection wick must be before the app treats it as important."
          value={form.wickRatio}
          step="0.1"
          min="0.5"
          max="10"
          suffix="×"
          onChange={(value) => onFormChange('wickRatio', value)}
        />
        <NumberInput
          label="Volume strength"
          help="How much today's volume must beat normal volume before it counts as strong buying or selling interest."
          value={form.volumeMultiplier}
          step="0.1"
          min="0.5"
          max="5"
          suffix="×"
          onChange={(value) => onFormChange('volumeMultiplier', value)}
        />
        <div className="min-w-0">
          <FieldLabel
            htmlFor="period"
            label="Period"
            help="Chooses how much past daily data is used for checking the method."
          />
          <select
            id="period"
            value={form.period}
            onChange={(event) => onFormChange('period', event.target.value)}
            className="min-h-11 w-full px-3 text-sm"
          >
            <option value="3mo">3 months</option>
            <option value="6mo">6 months</option>
            <option value="1y">1 year</option>
            <option value="2y">2 years</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="btn-amber min-h-11 w-full px-5 text-sm lg:w-auto"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          {loading ? 'Running…' : 'Run backtest'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-faint">Try:</span>
        {SAMPLE_STOCKS.map((symbol) => (
          <button
            key={symbol}
            type="button"
            onClick={() => onPickSuggestion(symbol)}
            className="rounded border border-line bg-well px-2.5 py-1 font-mono text-xs font-semibold text-dim transition hover:border-amber hover:text-amber"
          >
            {symbol}
          </button>
        ))}
      </div>

      {displayedStocks.length > 0 && (
        <div className="mt-4 max-h-64 overflow-auto rounded-md border border-line bg-well">
          <div className="sticky top-0 z-10 border-b border-line bg-panel px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-faint">
            {listTitle}
          </div>
          {displayedStocks.map((item) => (
            <StockRow
              key={`${item.symbol}-${item.exchange}`}
              item={item}
              onPick={() => onPickSuggestion(item.symbol)}
            />
          ))}
        </div>
      )}
    </form>
  );
}

export default memo(ParameterPanel);

function StockRow({ item, onPick }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="row-hover grid w-full gap-2 border-b border-line px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-panel sm:grid-cols-[1fr_auto]"
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold text-ink">{item.symbol}</span>
          {item.exchange && (
            <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] font-semibold text-faint">
              {item.exchange}
            </span>
          )}
          {item.source && (
            <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] font-semibold text-faint">
              {item.source}
            </span>
          )}
        </span>
        <span className="mt-1 block truncate text-xs text-faint">{item.name}</span>
      </span>
      <span className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:justify-end sm:gap-3">
        {Number.isFinite(item.totalTradedQuantity) && (
          <span className="min-w-0 text-left sm:text-right">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-faint">Week vol</span>
            <span className="num mobile-safe-text block font-semibold text-dim">{formatCompact(item.totalTradedQuantity)}</span>
          </span>
        )}
        <span className="min-w-0 text-left sm:text-right">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-faint">Price</span>
          <span className="num mobile-safe-text block font-semibold text-ink">{formatPrice(item.currentPrice, item.currency)}</span>
        </span>
        <span className="min-w-0 text-left sm:text-right">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-faint">1D</span>
          <span className={`num mobile-safe-text block font-semibold ${returnTone(item.oneDayReturn)}`}>
            {formatReturn(item.oneDayReturn)}
          </span>
        </span>
      </span>
    </button>
  );
}

function NumberInput({ label, help, value, onChange, step, min, max, suffix }) {
  const id = label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div>
      <FieldLabel htmlFor={id} label={label} help={help} />
      <div className="flex min-h-11 overflow-hidden rounded-md border border-line bg-well focus-within:border-amber">
        <input
          id={id}
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value)}
          className="num w-full rounded-none border-0 bg-transparent px-3 text-sm focus:shadow-none"
        />
        <span className="grid w-10 shrink-0 place-items-center border-l border-line bg-panel font-mono text-xs font-semibold text-faint">
          {suffix}
        </span>
      </div>
    </div>
  );
}

function FieldLabel({ htmlFor, label, help }) {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <label htmlFor={htmlFor} className="block font-mono text-[11px] font-semibold uppercase tracking-widest text-faint">
        {label}
      </label>
      <InfoButton text={help} />
    </div>
  );
}

function InfoButton({ text }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="Show help"
        className="grid h-[18px] w-[18px] place-items-center rounded-full border border-line bg-well font-mono text-[10px] font-bold leading-none text-faint transition hover:border-amber hover:text-amber focus:border-amber focus:text-amber"
      >
        ?
      </button>
      <span className="tip-bubble">{text}</span>
    </span>
  );
}

function formatPrice(value, currency) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return `${currency ? `${currency} ` : ''}${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  })}`;
}

function formatReturn(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value}%`;
}

function returnTone(value) {
  if (value > 0) {
    return 'text-up';
  }

  if (value < 0) {
    return 'text-down';
  }

  return 'text-dim';
}

function formatCompact(value) {
  return Number(value || 0).toLocaleString(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  });
}
