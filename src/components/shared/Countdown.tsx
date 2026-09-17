'use client';

import { useEffect, useRef } from 'react';
import { playSound } from '@/lib/sound';
import { t } from '@/lib/i18n';

/**
 * The countdown is a *display* of the server's activation timestamp, not a
 * timer that decides anything. `seconds` is recomputed from
 * (buzzer_open_at - serverNow) on every tick, so a device that was asleep or
 * lagging snaps to the correct number rather than finishing a stale local
 * count.
 */
export function Countdown({
  seconds,
  roundNumber,
  showRound = true,
}: {
  seconds: number;
  roundNumber: number;
  showRound?: boolean;
}) {
  const lastSpoken = useRef<number | null>(null);

  useEffect(() => {
    if (lastSpoken.current === seconds) return;
    lastSpoken.current = seconds;
    if (seconds > 0) playSound('countdown_tick');
  }, [seconds]);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {showRound ? (
        <p className="font-display text-xl font-bold text-cyan">{t.student.round(roundNumber)}</p>
      ) : null}
      <div
        key={seconds}
        className="animate-count-flip font-display text-[7rem] font-extrabold leading-none text-lemon drop-shadow-[0_0_2rem_hsl(var(--lemon)/0.6)] sm:text-[10rem]"
      >
        {seconds > 0 ? seconds : t.student.getReady}
      </div>
    </div>
  );
}
