import { useEffect, useRef } from 'react';
import { MOVES, type Move } from '../game';
import { Hand } from './Hand';

export function Reel({
  spinning,
  target,
  reduced,
}: {
  spinning: boolean;
  target: Move | null;
  reduced: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const spin = useRef<Animation | null>(null);
  useEffect(() => {
    spin.current?.cancel();
    const node = strip.current;
    if (!node || reduced) return;
    if (spinning) {
      spin.current = node.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-660px)' }],
        { duration: 430, iterations: Infinity, easing: 'linear' },
      );
    } else if (target) {
      const offset = (3 + MOVES.indexOf(target)) * 220;
      spin.current = node.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(-${offset}px)` }],
        { duration: 1250, easing: 'cubic-bezier(.12,.7,.12,1)', fill: 'forwards' },
      );
    }
    return () => spin.current?.cancel();
  }, [spinning, target, reduced]);
  if (reduced)
    return target && !spinning ? <Hand move={target} /> : <div className="bot-mystery">?</div>;
  if (!spinning && !target) return <div className="bot-mystery">?</div>;
  return (
    <div className={`reel ${spinning ? 'is-spinning' : ''}`} aria-hidden="true">
      <div ref={strip} className="reel-strip">
        {Array.from({ length: 9 }, (_, i) => (
          <div className="reel-item" key={i}>
            <Hand move={MOVES[i % 3]} />
          </div>
        ))}
      </div>
    </div>
  );
}
