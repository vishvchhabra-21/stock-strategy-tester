import { memo } from 'react';

/**
 * Live ticker tape of the most traded stocks. Scrolls continuously,
 * pauses on hover; every entry is a shortcut into the backtester.
 */
function TickerTape({ rows, onPick }) {
  const items = (rows || []).filter((item) => Number.isFinite(item.currentPrice));

  if (items.length < 4) {
    return null;
  }

  // Two copies of the row make the loop seamless.
  const loop = [...items, ...items];
  const duration = Math.max(48, items.length * 5);

  return (
    <div className="tape" aria-label="Most traded stocks ticker">
      <div className="tape-track" style={{ '--tape-time': `${duration}s` }}>
        {loop.map((item, index) => (
          <button
            key={`${item.symbol}-${index}`}
            type="button"
            tabIndex={index < items.length ? 0 : -1}
            aria-hidden={index >= items.length}
            onClick={() => onPick?.(item.symbol)}
            title={`Open ${item.symbol} in the backtester`}
            className="flex shrink-0 items-baseline gap-2 border-r border-line px-4 py-1.5 font-mono text-xs transition hover:bg-panel"
          >
            <span className="font-semibold text-ink">{trimSymbol(item.symbol)}</span>
            <span className="num text-dim">{formatPrice(item.currentPrice)}</span>
            <span className={`num font-semibold ${tone(item.oneDayReturn)}`}>
              {formatReturn(item.oneDayReturn)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(TickerTape);

function trimSymbol(symbol) {
  return String(symbol || '').replace(/\.(NS|BO)$/, '');
}

function formatPrice(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatReturn(value) {
  if (!Number.isFinite(value)) {
    return '·';
  }

  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '·';
  return `${arrow} ${Math.abs(value)}%`;
}

function tone(value) {
  if (value > 0) return 'text-up';
  if (value < 0) return 'text-down';
  return 'text-faint';
}
