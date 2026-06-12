import { memo, useMemo } from 'react';

const WIDTH = 920;
const HEIGHT = 260;
const PAD = { top: 18, right: 24, bottom: 34, left: 54 };

const CHART_BG = '#0C111D';
const GRID = '#1B2434';
const AXIS_TEXT = '#5F6A85';

function SeriesChartBase({ title, data = [], tone = '#2FD584', suffix = '', emptyText = 'No chart data available' }) {
  const chart = useMemo(() => buildLineChart(data), [data]);

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="tag">{title}</span>
        <span className="font-mono text-xs text-faint">{data.length} points</span>
      </div>

      {chart.points ? (
        <div className="overflow-hidden rounded-md border border-line">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={title}>
            <rect width={WIDTH} height={HEIGHT} fill={CHART_BG} />
            {chart.ticks.map((tick) => (
              <g key={tick.value}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={tick.y} y2={tick.y} stroke={GRID} />
                <text x="12" y={tick.y + 4} fill={AXIS_TEXT} fontSize="12" fontFamily="IBM Plex Mono, monospace">
                  {formatCompact(tick.value)}{suffix}
                </text>
              </g>
            ))}
            <path d={chart.areaPath} fill={tone} opacity="0.1" />
            <polyline
              points={chart.points}
              fill="none"
              stroke={tone}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {chart.labels.map((label) => (
              <text key={label.text} x={label.x} y={HEIGHT - 12} textAnchor="middle" fill={AXIS_TEXT} fontSize="12" fontFamily="IBM Plex Mono, monospace">
                {label.text}
              </text>
            ))}
          </svg>
        </div>
      ) : (
        <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-line bg-well font-mono text-sm text-faint">
          {emptyText}
        </div>
      )}
    </section>
  );
}

function ComparisonBarChartBase({ strategies = [] }) {
  const rows = useMemo(() => strategies.slice(0, 8), [strategies]);
  const maxProfit = Math.max(...rows.map((item) => Math.abs(item.totalProfit || 0)), 1);

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="tag">CMP · Profit by method</span>
        <span className="font-mono text-xs text-faint">Profit vs drawdown</span>
      </div>

      {rows.length ? (
        <div className="space-y-3">
          {rows.map((strategy) => {
            const width = Math.min(100, Math.abs(strategy.totalProfit || 0) / maxProfit * 100);
            const isPositive = (strategy.totalProfit || 0) >= 0;
            return (
              <div key={strategy.strategyName} className="rounded-md border border-line bg-well p-3">
                <div className="mb-2 flex items-start justify-between gap-3 text-sm">
                  <span className="mobile-safe-text min-w-0 font-mono font-semibold text-ink">
                    {strategy.strategyName}
                    {strategy.recommended && (
                      <span className="ml-2 rounded border border-amber/40 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber">
                        Best
                      </span>
                    )}
                  </span>
                  <span className={`num font-bold ${isPositive ? 'text-up' : 'text-down'}`}>
                    {formatSigned(strategy.totalProfit)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line/60">
                  <div
                    className={`h-full rounded-full ${isPositive ? 'bg-up' : 'bg-down'}`}
                    style={{ width: `${Math.max(4, width)}%` }}
                  />
                </div>
                <div className="num mt-2 grid grid-cols-3 gap-2 text-xs text-faint">
                  <span className="mobile-safe-text">Win {strategy.winRate}%</span>
                  <span className="mobile-safe-text">Drop {strategy.maxDrawdown}%</span>
                  <span className="mobile-safe-text">RR {strategy.riskRewardRatio}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-line bg-well font-mono text-sm text-faint">
          Run a comparison to see the chart
        </div>
      )}
    </section>
  );
}

function buildLineChart(data) {
  const clean = data.filter((point) => Number.isFinite(point.value));
  if (clean.length < 2) {
    return { points: '', areaPath: '', ticks: [], labels: [] };
  }

  const values = clean.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(Math.abs(max), 1);
  const chartMin = min - span * 0.08;
  const chartMax = max + span * 0.08;
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index) => PAD.left + (plotWidth / (clean.length - 1)) * index;
  const y = (value) => PAD.top + ((chartMax - value) / (chartMax - chartMin)) * plotHeight;
  const points = clean.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const firstX = x(0);
  const lastX = x(clean.length - 1);
  const baseY = HEIGHT - PAD.bottom;
  const areaPath = `M${firstX},${baseY} L${points.replaceAll(' ', ' L')} L${lastX},${baseY} Z`;
  const ticks = Array.from({ length: 4 }, (_, index) => {
    const value = chartMin + ((chartMax - chartMin) / 3) * index;
    return { value, y: y(value) };
  });
  const labelStep = Math.max(1, Math.floor(clean.length / 3));
  const labels = clean
    .filter((_, index) => index === 0 || index === clean.length - 1 || index % labelStep === 0)
    .slice(0, 4)
    .map((point, index) => ({
      x: x(index === 0 ? 0 : Math.min(clean.length - 1, index * labelStep)),
      text: shortDate(point.date)
    }));

  return { points, areaPath, ticks, labels };
}

function shortDate(date) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCompact(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 1
  });
}

function formatSigned(value) {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${number}`;
}

export const SeriesChart = memo(SeriesChartBase);
export const ComparisonBarChart = memo(ComparisonBarChartBase);
