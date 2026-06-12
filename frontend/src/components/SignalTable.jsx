import SignalBadge from './SignalBadge.jsx';

export default function SignalTable({ signals }) {
  const rows = (signals || []).slice().reverse();

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="tag">BT · Day-wise record</span>
        <span className="font-mono text-xs text-faint">{rows.length} rows</span>
      </div>

      <div className="table-scroll scrollbar-thin max-h-[520px] overflow-auto rounded-md border border-line">
        <table className="w-full min-w-[980px] border-collapse bg-well text-sm">
          <thead className="sticky top-0 z-10 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-faint shadow-[0_1px_0_#222B3D]">
            <tr>
              <Th>Date</Th>
              <Th>Result</Th>
              <Th>Strength</Th>
              <Th>Close</Th>
              <Th>Details</Th>
              <Th>1D</Th>
              <Th>3D</Th>
              <Th>5D</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((signal) => (
              <tr key={signal.date} className="border-t border-line hover:bg-panel">
                <Td className="num">{signal.date}</Td>
                <Td>
                  <SignalBadge type={signal.signalType} label={signal.label} />
                </Td>
                <Td className="num">{signal.confidence}</Td>
                <Td className="num">{formatNumber(signal.close)}</Td>
                <Td className="max-w-[360px] whitespace-normal font-mono text-xs leading-5 text-faint">{formatSignalDetails(signal)}</Td>
                <ReturnCell value={signal.futureReturns?.return1d} />
                <ReturnCell value={signal.futureReturns?.return3d} />
                <ReturnCell value={signal.futureReturns?.return5d} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children }) {
  return <th className="whitespace-nowrap px-3 py-3 font-semibold">{children}</th>;
}

function Td({ children, className = '' }) {
  return <td className={`whitespace-nowrap px-3 py-3 text-dim ${className}`}>{children}</td>;
}

function ReturnCell({ value }) {
  if (!Number.isFinite(value)) {
    return <Td>-</Td>;
  }

  const tone = value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-dim';
  return <Td className={`num font-semibold ${tone}`}>{value}%</Td>;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function formatSignalDetails(signal) {
  const details = [
    signal.zone ? `Zone: ${signal.zone.replace('-', ' ')}` : null,
    Number.isFinite(signal.boxHigh) ? `Box high: ${formatNumber(signal.boxHigh)}` : null,
    Number.isFinite(signal.boxLow) ? `Box low: ${formatNumber(signal.boxLow)}` : null,
    Number.isFinite(signal.rsi) ? `RSI: ${formatNumber(signal.rsi)}` : null,
    Number.isFinite(signal.macd) ? `MACD: ${formatNumber(signal.macd)}` : null,
    Number.isFinite(signal.macdSignal) ? `Signal: ${formatNumber(signal.macdSignal)}` : null,
    Number.isFinite(signal.stochasticK) ? `%K: ${formatNumber(signal.stochasticK)}` : null,
    Number.isFinite(signal.stochasticD) ? `%D: ${formatNumber(signal.stochasticD)}` : null,
    Number.isFinite(signal.volumeRatio) ? `Vol: ${formatNumber(signal.volumeRatio)}x` : null,
    Number.isFinite(signal.support) ? `Support: ${formatNumber(signal.support)}` : null,
    Number.isFinite(signal.resistance) ? `Resistance: ${formatNumber(signal.resistance)}` : null,
    Number.isFinite(signal.pivot) ? `Pivot: ${formatNumber(signal.pivot)}` : null,
    Number.isFinite(signal.gapPercent) ? `Gap: ${formatNumber(signal.gapPercent)}%` : null,
    Number.isFinite(signal.return3d) ? `3D move: ${formatNumber(signal.return3d)}%` : null,
    Number.isFinite(signal.customBuyScore) ? `Buy score: ${formatNumber(signal.customBuyScore)}` : null,
    Number.isFinite(signal.customSellScore) ? `Sell score: ${formatNumber(signal.customSellScore)}` : null
  ].filter(Boolean);

  return details.slice(0, 4).join(' · ') || '-';
}
