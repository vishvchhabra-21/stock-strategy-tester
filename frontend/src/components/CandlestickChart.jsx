import { memo, useMemo, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { signalColor } from '../services/signalColors.js';

const WIDTH = 1000;
const HEIGHT = 520;
const PADDING = {
  top: 28,
  right: 72,
  bottom: 42,
  left: 46
};
const VOLUME_HEIGHT = 86;
const PRICE_VOLUME_GAP = 22;
const MIN_VISIBLE_CANDLES = 25;
const DEFAULT_VISIBLE_CANDLES = 100;

function CandlestickChart({ data }) {
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_CANDLES);
  const [startIndex, setStartIndex] = useState(null);
  const [indicators, setIndicators] = useState({
    boxes: true,
    sma20: true,
    sma50: false,
    volume: true
  });

  const chartData = useMemo(() => addIndicators((data || []).filter((day) => Number.isFinite(day.close))), [data]);
  const maxVisibleCount = Math.max(MIN_VISIBLE_CANDLES, chartData.length);
  const windowSize = Math.min(visibleCount, chartData.length || visibleCount);
  const maxStart = Math.max(0, chartData.length - windowSize);
  const resolvedStart = startIndex === null ? maxStart : clamp(startIndex, 0, maxStart);
  const visible = chartData.slice(resolvedStart, resolvedStart + windowSize);

  if (!visible.length) {
    return (
      <section className="panel rounded-lg p-3 sm:p-5">
        <h2 className="text-base font-semibold text-ink">Price Chart</h2>
        <div className="mt-4 grid min-h-72 place-items-center rounded-md border border-dashed border-line bg-paper text-sm text-stone-500">
          No chart data available
        </div>
      </section>
    );
  }

  const values = visible.flatMap((day) => [
    day.high,
    day.low,
    indicators.boxes ? day.boxHigh : null,
    indicators.boxes ? day.boxLow : null,
    indicators.boxes ? day.boxMid : null,
    indicators.sma20 ? day.sma20 : null,
    indicators.sma50 ? day.sma50 : null
  ]).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max || 1;
  const chartMin = min - span * 0.08;
  const chartMax = max + span * 0.08;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const priceHeight = HEIGHT - PADDING.top - PADDING.bottom - VOLUME_HEIGHT - PRICE_VOLUME_GAP;
  const volumeTop = PADDING.top + priceHeight + PRICE_VOLUME_GAP;
  const step = plotWidth / Math.max(visible.length, 1);
  const candleWidth = Math.max(4, Math.min(12, step * 0.55));
  const volumeWidth = Math.max(3, Math.min(11, step * 0.62));
  const maxVolume = Math.max(...visible.map((day) => day.volume || 0), 1);

  const y = (value) => PADDING.top + ((chartMax - value) / (chartMax - chartMin)) * priceHeight;
  const volumeY = (value) => volumeTop + VOLUME_HEIGHT - ((value || 0) / maxVolume) * VOLUME_HEIGHT;
  const x = (index) => PADDING.left + step * index + step / 2;

  const gridTicks = Array.from({ length: 5 }, (_, index) => {
    const value = chartMin + ((chartMax - chartMin) / 4) * index;
    return {
      value,
      y: y(value)
    };
  });

  function changeZoom(delta) {
    const nextCount = clamp(visibleCount + delta, MIN_VISIBLE_CANDLES, maxVisibleCount);
    setVisibleCount(nextCount);
    setStartIndex(null);
  }

  function resetView() {
    setVisibleCount(Math.min(DEFAULT_VISIBLE_CANDLES, maxVisibleCount));
    setStartIndex(null);
    setIndicators({
      boxes: true,
      sma20: true,
      sma50: false,
      volume: true
    });
  }

  function toggleIndicator(key) {
    setIndicators((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }

  return (
    <section className="panel rounded-lg p-3 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Candlestick Box Chart</h2>
          <p className="mt-1 text-xs font-medium text-stone-500">
            Showing {visible.length} of {chartData.length} candles
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-medium text-stone-600">
          {indicators.boxes && (
            <>
              <Legend color="#d84a3a" label="Box high" />
              <Legend color="#0f8f63" label="Box low" />
              <Legend color="#d99b1f" label="Mid" />
            </>
          )}
          {indicators.sma20 && <Legend color="#7c3aed" label="SMA 20" />}
          {indicators.sma50 && <Legend color="#0891b2" label="SMA 50" />}
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-md border border-line bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <IconButton label="Zoom in" onClick={() => changeZoom(-20)} disabled={visibleCount <= MIN_VISIBLE_CANDLES}>
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton label="Zoom out" onClick={() => changeZoom(20)} disabled={visibleCount >= maxVisibleCount}>
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton label="Reset chart" onClick={resetView}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3 lg:max-w-sm">
          <span className="text-xs font-semibold text-stone-500">Pan</span>
          <input
            type="range"
            min="0"
            max={maxStart}
            value={resolvedStart}
            onChange={(event) => setStartIndex(Number(event.target.value))}
            disabled={maxStart === 0}
            className="w-full accent-cobalt disabled:opacity-50"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <IndicatorToggle label="Boxes" checked={indicators.boxes} onChange={() => toggleIndicator('boxes')} />
          <IndicatorToggle label="SMA 20" checked={indicators.sma20} onChange={() => toggleIndicator('sma20')} />
          <IndicatorToggle label="SMA 50" checked={indicators.sma50} onChange={() => toggleIndicator('sma50')} />
          <IndicatorToggle label="Volume" checked={indicators.volume} onChange={() => toggleIndicator('volume')} />
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-white">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Candlestick chart with previous day box lines" className="h-auto w-full">
          <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#ffffff" />

          {gridTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={tick.y}
                y2={tick.y}
                stroke="#e7ebe7"
                strokeWidth="1"
              />
              <text x={WIDTH - PADDING.right + 10} y={tick.y + 4} fill="#6b7280" fontSize="12">
                {formatPrice(tick.value)}
              </text>
            </g>
          ))}

          {indicators.volume && (
            <g>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={volumeTop + VOLUME_HEIGHT}
                y2={volumeTop + VOLUME_HEIGHT}
                stroke="#d8ded8"
                strokeWidth="1"
              />
              <text x={WIDTH - PADDING.right + 10} y={volumeTop + 12} fill="#6b7280" fontSize="12">
                Vol
              </text>
              {visible.map((day, index) => {
                const isUp = day.close >= day.open;
                const barTop = volumeY(day.volume);
                return (
                  <rect
                    key={`volume-${day.date}`}
                    x={x(index) - volumeWidth / 2}
                    y={barTop}
                    width={volumeWidth}
                    height={Math.max(1, volumeTop + VOLUME_HEIGHT - barTop)}
                    rx="1"
                    fill={isUp ? 'rgba(15, 143, 99, 0.32)' : 'rgba(216, 74, 58, 0.32)'}
                  >
                    <title>{`${day.date}: ${formatCompact(day.volume)} volume`}</title>
                  </rect>
                );
              })}
            </g>
          )}

          {indicators.boxes && (
            <>
              <PathLine data={visible} field="boxHigh" x={x} y={y} color="#d84a3a" width="1.6" dash="5 5" />
              <PathLine data={visible} field="boxLow" x={x} y={y} color="#0f8f63" width="1.6" dash="5 5" />
              <PathLine data={visible} field="boxMid" x={x} y={y} color="#d99b1f" width="1.4" dash="2 6" />
            </>
          )}
          {indicators.sma20 && (
            <PathLine data={visible} field="sma20" x={x} y={y} color="#7c3aed" width="2.2" />
          )}
          {indicators.sma50 && (
            <PathLine data={visible} field="sma50" x={x} y={y} color="#0891b2" width="2.2" />
          )}

          {visible.map((day, index) => {
            const isUp = day.close >= day.open;
            const color = isUp ? '#0f8f63' : '#d84a3a';
            const bodyTop = y(Math.max(day.open, day.close));
            const bodyBottom = y(Math.min(day.open, day.close));
            const bodyHeight = Math.max(2, bodyBottom - bodyTop);
            const centerX = x(index);

            return (
              <g key={day.date}>
                <line
                  x1={centerX}
                  x2={centerX}
                  y1={y(day.high)}
                  y2={y(day.low)}
                  stroke={color}
                  strokeWidth="1.5"
                />
                <rect
                  x={centerX - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  rx="1"
                  fill={isUp ? '#dff5ea' : '#fde5e0'}
                  stroke={color}
                  strokeWidth="1.4"
                />
                {day.signalType && (
                  <SignalMarker
                    x={centerX}
                    y={day.signalType === 'BULLISH_REVERSAL' ? y(day.low) + 16 : y(day.high) - 16}
                    type={day.signalType}
                    label={`${day.date}: ${day.signalLabel}`}
                  />
                )}
              </g>
            );
          })}

          {visible.filter((_, index) => index % Math.ceil(visible.length / 6) === 0).map((day) => {
            const index = visible.findIndex((item) => item.date === day.date);
            return (
              <text key={day.date} x={x(index)} y={HEIGHT - 16} textAnchor="middle" fill="#6b7280" fontSize="12">
                {shortDate(day.date)}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

export default memo(CandlestickChart);

function addIndicators(rows) {
  return rows.map((day, index) => ({
    ...day,
    sma20: movingAverage(rows, index, 20),
    sma50: movingAverage(rows, index, 50)
  }));
}

function movingAverage(rows, index, period) {
  if (index + 1 < period) {
    return null;
  }

  const slice = rows.slice(index + 1 - period, index + 1);
  const sum = slice.reduce((total, day) => total + day.close, 0);
  return sum / period;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-9 w-9 place-items-center rounded-md border border-line bg-paper text-stone-700 transition hover:border-cobalt hover:text-cobalt disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function IndicatorToggle({ label, checked, onChange }) {
  return (
    <label className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-paper px-3 text-xs font-semibold text-stone-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-cobalt"
      />
      {label}
    </label>
  );
}

function PathLine({ data, field, x, y, color, width, dash }) {
  const points = data
    .map((day, index) => Number.isFinite(day[field]) ? `${x(index)},${y(day[field])}` : null)
    .filter(Boolean)
    .join(' ');

  if (!points) {
    return null;
  }

  return (
    <polyline
      points={points}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dash}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function SignalMarker({ x, y, type, label }) {
  const color = signalColor(type);
  const points = type === 'BULLISH_REVERSAL'
    ? `${x},${y - 7} ${x - 7},${y + 7} ${x + 7},${y + 7}`
    : `${x},${y + 7} ${x - 7},${y - 7} ${x + 7},${y - 7}`;

  return (
    <g>
      <title>{label}</title>
      <polygon points={points} fill={color} stroke="#ffffff" strokeWidth="1.5" />
    </g>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function formatPrice(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function shortDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function formatCompact(value) {
  return Number(value || 0).toLocaleString(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  });
}
