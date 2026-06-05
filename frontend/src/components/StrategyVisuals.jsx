import { memo, useMemo } from 'react';

const WIDTH = 920;
const HEIGHT = 260;
const PAD = { top: 18, right: 24, bottom: 34, left: 54 };

function SeriesChartBase({ title, data = [], tone = '#0f8f63', suffix = '', emptyText = 'No chart data available' }) {
  const chart = useMemo(() => buildLineChart(data), [data]);

  return (
    <section className="panel rounded-lg p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="mobile-safe-text text-base font-semibold text-ink">{title}</h3>
        <span className="text-xs font-semibold text-stone-500">{data.length} points</span>
      </div>

      {chart.points ? (
        <div className="overflow-hidden rounded-md border border-line bg-white">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={title}>
            <rect width={WIDTH} height={HEIGHT} fill="#ffffff" />
            {chart.ticks.map((tick) => (
              <g key={tick.value}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={tick.y} y2={tick.y} stroke="#e7ebe7" />
                <text x="12" y={tick.y + 4} fill="#6b7280" fontSize="12">
                  {formatCompact(tick.value)}{suffix}
                </text>
              </g>
            ))}
            <path d={chart.areaPath} fill={tone} opacity="0.08" />
            <polyline
              points={chart.points}
              fill="none"
              stroke={tone}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {chart.labels.map((label) => (
              <text key={label.text} x={label.x} y={HEIGHT - 12} textAnchor="middle" fill="#6b7280" fontSize="12">
                {label.text}
              </text>
            ))}
          </svg>
        </div>
      ) : (
        <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-line bg-paper text-sm font-medium text-stone-500">
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
    <section className="panel rounded-lg p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink">Method Comparison Chart</h3>
        <span className="text-xs font-semibold text-stone-500">Profit vs drawdown</span>
      </div>

      {rows.length ? (
        <div className="space-y-3">
          {rows.map((strategy) => {
            const width = Math.min(100, Math.abs(strategy.totalProfit || 0) / maxProfit * 100);
            const isPositive = (strategy.totalProfit || 0) >= 0;
            return (
              <div key={strategy.strategyName} className="rounded-md border border-line bg-white/75 p-3">
                <div className="mb-2 flex items-start justify-between gap-3 text-sm">
                  <span className="mobile-safe-text min-w-0 font-semibold text-ink">
                    {strategy.strategyName}
                    {strategy.recommended && (
                      <span className="ml-2 rounded-sm bg-mint/10 px-1.5 py-0.5 text-[11px] font-bold text-mint">
                        Recommended
                      </span>
                    )}
                  </span>
                  <span className={isPositive ? 'font-bold text-mint' : 'font-bold text-coral'}>
                    {formatSigned(strategy.totalProfit)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-paper">
                  <div
                    className={isPositive ? 'h-full rounded-full bg-mint' : 'h-full rounded-full bg-coral'}
                    style={{ width: `${Math.max(4, width)}%` }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-semibold text-stone-500">
                  <span className="mobile-safe-text">Win {strategy.winRate}%</span>
                  <span className="mobile-safe-text">Drop {strategy.maxDrawdown}%</span>
                  <span className="mobile-safe-text">RR {strategy.riskRewardRatio}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-line bg-paper text-sm font-medium text-stone-500">
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
