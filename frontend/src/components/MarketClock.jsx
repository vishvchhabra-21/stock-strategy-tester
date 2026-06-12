import { memo, useEffect, useState } from 'react';

/**
 * NSE session clock. Computes Indian market hours (9:15–15:30 IST,
 * Mon–Fri) from the visitor's clock; exchange holidays are not tracked.
 */
function MarketClock() {
  const [now, setNow] = useState(() => istParts());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(istParts()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const session = sessionState(now);

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-line bg-well px-2.5 py-1.5 sm:px-3"
      title="NSE trading session, Indian Standard Time"
    >
      <span className="dot-live" data-on={session.open ? 'true' : 'false'} aria-hidden="true" />
      <span className="font-mono text-xs font-semibold text-dim">
        NSE <span className="num text-ink">{now.time}</span>
        <span className="hidden sm:inline"> IST</span>
      </span>
      <span className={`font-mono text-[11px] font-bold uppercase tracking-widest ${session.open ? 'text-amber' : 'text-faint'}`}>
        {session.label}
      </span>
    </div>
  );
}

export default memo(MarketClock);

function istParts() {
  const date = new Date();
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short'
  }).format(date);

  const [hours, minutes] = time.split(':').map(Number);

  return {
    time,
    minutesOfDay: hours * 60 + minutes,
    isWeekday: !['Sat', 'Sun'].includes(weekday)
  };
}

function sessionState({ minutesOfDay, isWeekday }) {
  if (!isWeekday) {
    return { open: false, label: 'Closed' };
  }

  if (minutesOfDay >= 540 && minutesOfDay < 555) {
    return { open: true, label: 'Pre-open' };
  }

  if (minutesOfDay >= 555 && minutesOfDay < 930) {
    return { open: true, label: 'Open' };
  }

  return { open: false, label: 'Closed' };
}
