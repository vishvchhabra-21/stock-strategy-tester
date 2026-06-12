const FUTURE_STRATEGIES = [
  'More strategy comparison',
  'Paper trading',
  'Alerts',
  'Portfolio tracking'
];

export default function FutureStrategies() {
  return (
    <section className="panel p-4 sm:p-5">
      <span className="tag">Roadmap</span>
      <div className="mt-3 flex flex-wrap gap-2">
        {FUTURE_STRATEGIES.map((item) => (
          <span key={item} className="rounded border border-dashed border-line px-3 py-1.5 text-sm text-faint">
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
