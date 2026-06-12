import { ArrowDownRight, ArrowUpRight, BarChart2, LineChart, Percent, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react';
import { memo } from 'react';

function StatsGrid({ summary }) {
  const stats = summary || {};
  const profitPercentage = stats.profitPercentage ?? 0;
  const items = [
    { label: 'Total checks', value: stats.totalSignals ?? 0, icon: BarChart2 },
    { label: 'Bullish', value: stats.bullishSignals ?? 0, icon: ArrowUpRight, valueTone: 'text-up' },
    { label: 'Bearish', value: stats.bearishSignals ?? 0, icon: ArrowDownRight, valueTone: 'text-down' },
    { label: 'Win rate', value: `${stats.winRate ?? 0}%`, icon: Percent },
    { label: 'Avg 5D return', value: `${stats.averageReturn5d ?? 0}%`, icon: LineChart },
    { label: 'Win quality', value: stats.profitFactor ?? 0, icon: TrendingUp },
    { label: 'Risk score', value: stats.sharpeRatio ?? 0, icon: ShieldCheck },
    {
      label: 'Profit %',
      value: `${profitPercentage > 0 ? '+' : ''}${profitPercentage}%`,
      icon: WalletCards,
      valueTone: profitPercentage > 0 ? 'text-up' : profitPercentage < 0 ? 'text-down' : 'text-ink'
    }
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="panel p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-faint">
                {item.label}
              </span>
              <Icon className="h-4 w-4 text-faint" aria-hidden="true" />
            </div>
            <div className={`num mobile-safe-text mt-2 text-xl font-bold sm:text-2xl ${item.valueTone || 'text-ink'}`}>
              {item.value}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default memo(StatsGrid);
