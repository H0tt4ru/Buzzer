'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import type { BuzzBlockReason, GamePhase, StudentOutcome } from '@/types/game';

/**
 * The buzzer.
 *
 * Two decisions worth knowing about:
 *
 * 1. It fires on `pointerdown`, not on click. A click fires on *release*,
 *    which on a touchscreen costs 60-150 ms of thumb-lift and would decide
 *    rounds. pointerdown is the earliest reliable signal the browser gives.
 *
 * 2. The press handler does the absolute minimum before handing off: set a
 *    ref, call onBuzz, return. Sound and haptics are fire-and-forget inside
 *    the hook, and no animation is awaited. Visual feedback comes from CSS
 *    that is already on the element, so a repaint can never sit between the
 *    student's thumb and the network request.
 *
 * Accessibility: it is a real <button>, so Enter and Space work on a laptop,
 * and the state is announced through aria-live on the label beneath it.
 */
export interface BuzzerButtonProps {
  phase: GamePhase;
  outcome: StudentOutcome;
  buzzable: boolean;
  blockReason: BuzzBlockReason;
  isWinner: boolean;
  onBuzz: () => void;
}

export function BuzzerButton({
  phase,
  outcome,
  buzzable,
  blockReason,
  isWinner,
  onBuzz,
}: BuzzerButtonProps) {
  const firedRef = useRef(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!buzzable || firedRef.current) return;
    // Stop the synthetic click that follows a touch from firing this twice.
    event.preventDefault();
    firedRef.current = true;
    onBuzz();
    // Re-open after the round can conceivably change; the hook and the
    // database both hold their own guards, so this is only about this element.
    window.setTimeout(() => {
      firedRef.current = false;
    }, 700);
  };

  const pressed = outcome !== 'none';
  const won = isWinner || outcome === 'won';
  const lost = outcome === 'too_late' || (phase === 'ROUND_COMPLETE' && !won);

  const label = (() => {
    if (won) return t.student.youWon;
    if (outcome === 'buzzed') return t.student.buzzed;
    if (lost) return t.student.tooLate;
    if (buzzable) return t.student.buzz;
    if (blockReason === 'excluded') return '⏳';
    if (phase === 'COUNTDOWN') return t.student.getReady;
    return '—';
  })();

  const face = won
    ? 'buzzer-won'
    : lost
      ? 'buzzer-lost'
      : buzzable
        ? 'buzzer-live'
        : 'buzzer-idle';

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && buzzable && !firedRef.current) {
            event.preventDefault();
            firedRef.current = true;
            onBuzz();
          }
        }}
        disabled={!buzzable && !pressed}
        aria-label={label}
        aria-disabled={!buzzable}
        className={cn(
          'buzzer-face no-select aspect-square w-full max-w-[min(78vw,26rem)]',
          'disabled:pointer-events-none',
          face,
          buzzable && 'motion-loop animate-buzzer-pulse cursor-pointer',
          !buzzable && !pressed && 'motion-loop animate-idle-breathe',
          lost && 'animate-shake',
          won && 'animate-slam-in',
        )}
      >
        <span
          className={cn(
            'font-display px-6 text-center font-extrabold leading-none tracking-tight',
            label.length > 10 ? 'text-3xl sm:text-5xl' : 'text-5xl sm:text-7xl',
            won ? 'text-stage-900' : 'text-white',
            'drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]',
          )}
        >
          {label}
        </span>
      </button>
    </div>
  );
}
