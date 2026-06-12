import { memo } from 'react';

const TONES = {
  BUY: 'flip-buy',
  SELL: 'flip-sell'
};

/**
 * Split-flap verdict board: each letter flips into place like the old
 * exchange announcement boards. Re-mounts (via key upstream) to replay.
 */
function FlipVerdict({ text, className = '' }) {
  const label = String(text || '').replace(/_/g, ' ').trim().toUpperCase();
  const tone = TONES[label] || 'flip-wait';

  return (
    <span className={`flip-board ${tone} ${className}`} role="text" aria-label={label}>
      {label.split('').map((char, index) => (
        char === ' '
          ? <span key={index} className="flip-gap" aria-hidden="true" />
          : (
            <span
              key={index}
              className="flip-cell"
              style={{ animationDelay: `${index * 60}ms` }}
              aria-hidden="true"
            >
              {char}
            </span>
          )
      ))}
    </span>
  );
}

export default memo(FlipVerdict);
