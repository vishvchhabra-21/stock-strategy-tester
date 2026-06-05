import { Layers3 } from 'lucide-react';

const FUTURE_STRATEGIES = [
  'More strategy comparison',
  'Paper trading',
  'Alerts',
  'Portfolio tracking'
];

export default function FutureStrategies() {
  return (
    <section className="panel rounded-lg p-3 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Layers3 className="h-5 w-5 text-cobalt" aria-hidden="true" />
        <h2 className="text-base font-semibold text-ink">More Trading Tools Coming Soon</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {FUTURE_STRATEGIES.map((item) => (
          <span key={item} className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-stone-700">
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
