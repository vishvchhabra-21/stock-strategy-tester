import { ArrowDownRight, ArrowUpRight, BarChart2, LineChart, Percent, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react';
import { memo } from 'react';

function StatsGrid({ summary }) {
  const stats = summary || {};
  const profitPercentage = stats.profitPercentage ?? 0;
  const items = [
    { label: 'Total checks', value: stats.totalSignals ?? 0, icon: BarChart2 },
    { label: 'Bullish', value: stats.bullishSignals ?? 0, icon: ArrowUpRight, tone: 'text-mint' },
    { label: 'Bearish', value: stats.bearishSignals ?? 0, icon: ArrowDownRight, tone: 'text-coral' },
    { label: 'Win rate', value: `${stats.winRate ?? 0}%`, icon: Percent },
    { label: 'Avg 5D return', value: `${stats.averageReturn5d ?? 0}%`, icon: LineChart },
    { label: 'Win quality', value: stats.profitFactor ?? 0, icon: TrendingUp },
    { label: 'Risk score', value: stats.sharpeRatio ?? 0, icon: ShieldCheck },
    {
      label: 'Profit %',
      value: `${profitPercentage > 0 ? '+' : ''}${profitPercentage}%`,
      icon: WalletCards,
      tone: profitPercentage > 0 ? 'text-mint' : profitPercentage < 0 ? 'text-coral' : 'text-stone-500',
      valueTone: profitPercentage > 0 ? 'text-mint' : profitPercentage < 0 ? 'text-coral' : 'text-ink'
    }
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="panel stat-card rounded-lg p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase text-stone-500">{item.label}</span>
              <span className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white/70">
                <Icon className={`h-4 w-4 ${item.tone || 'text-cobalt'}`} aria-hidden="true" />
              </span>
            </div>
            <div className={`mobile-safe-text mt-2 text-xl font-bold sm:text-2xl ${item.valueTone || 'text-ink'}`}>{item.value}</div>
          </div>
        );
      })}
    </section>
  );
}

export default memo(StatsGrid);
