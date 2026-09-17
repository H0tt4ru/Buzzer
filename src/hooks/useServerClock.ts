'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

/**
 * CLOCK SYNCHRONISATION STRATEGY
 * ------------------------------
 * The teacher's "aktifkan buzzer" does not tell devices to start a timer; it
 * writes a server timestamp (`rounds.buzzer_open_at`) that every device counts
 * down to. For that to feel simultaneous, each device needs to know how far
 * its own Date.now() is from the database's clock.
 *
 * Method (a deliberately small NTP):
 *   1. t0 = local time, call server_now(), t1 = local time on reply.
 *   2. Assume the request and response legs are symmetric, so the server's
 *      reading corresponds to local time (t0 + t1) / 2.
 *      offset = serverMs - (t0 + t1) / 2
 *   3. Repeat a handful of times and keep the sample with the smallest
 *      round trip — the least-delayed sample is the least distorted one.
 *      (Taking a mean would let one slow request skew everything.)
 *
 * serverNow() then returns Date.now() + offset. Drift is small over a lesson,
 * but the sync is repeated every 60s anyway, and once more after any
 * reconnect, because a suspended tab can come back with a jumped clock.
 *
 * None of this is trusted for correctness: the database independently refuses
 * any press arriving before buzzer_open_at. The sync exists so the countdown
 * on 30 phones hits zero together.
 */

const SAMPLES = 5;
const RESYNC_INTERVAL_MS = 60_000;

interface Sample {
  offset: number;
  roundTrip: number;
}

export interface ServerClock {
  /** Epoch ms on the server's clock. */
  serverNow: () => number;
  /** Local minus server, in ms. */
  offsetMs: number;
  roundTripMs: number;
  synced: boolean;
  resync: () => Promise<void>;
}

export function useServerClock(): ServerClock {
  const offsetRef = useRef(0);
  const [offsetMs, setOffsetMs] = useState(0);
  const [roundTripMs, setRoundTripMs] = useState(0);
  const [synced, setSynced] = useState(false);

  const takeSample = useCallback(async (): Promise<Sample | null> => {
    const supabase = getSupabase();
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('server_now');
    const t1 = Date.now();

    if (error || !data) return null;

    const serverMs = new Date(data as string).getTime();
    if (!Number.isFinite(serverMs)) return null;

    return { offset: serverMs - (t0 + t1) / 2, roundTrip: t1 - t0 };
  }, []);

  const resync = useCallback(async () => {
    const samples: Sample[] = [];

    for (let i = 0; i < SAMPLES; i += 1) {
      const sample = await takeSample();
      if (sample) samples.push(sample);
    }

    if (samples.length === 0) {
      // Fall back to the route handler, which reads the same database clock.
      try {
        const t0 = Date.now();
        const response = await fetch('/api/time', { cache: 'no-store' });
        const t1 = Date.now();
        const body = (await response.json()) as { now?: string };
        if (body.now) {
          const serverMs = new Date(body.now).getTime();
          offsetRef.current = serverMs - (t0 + t1) / 2;
          setOffsetMs(offsetRef.current);
          setRoundTripMs(t1 - t0);
          setSynced(true);
        }
      } catch {
        // Leave the offset at whatever it was; 0 means "trust the device".
      }
      return;
    }

    const best = samples.reduce((a, b) => (b.roundTrip < a.roundTrip ? b : a));
    offsetRef.current = best.offset;
    setOffsetMs(best.offset);
    setRoundTripMs(best.roundTrip);
    setSynced(true);
  }, [takeSample]);

  useEffect(() => {
    void resync();
    const timer = window.setInterval(() => void resync(), RESYNC_INTERVAL_MS);

    const onWake = () => {
      if (document.visibilityState === 'visible') void resync();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [resync]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { serverNow, offsetMs, roundTripMs, synced, resync };
}

/**
 * A ticking value on the server clock. `intervalMs` is 100 by default so the
 * countdown and the activation flip land within a tenth of a second of the
 * target without burning a frame budget on a phone.
 */
export function useServerTick(clock: ServerClock, intervalMs = 100): number {
  const [now, setNow] = useState(() => clock.serverNow());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(clock.serverNow()), intervalMs);
    return () => window.clearInterval(timer);
  }, [clock, intervalMs]);

  return now;
}
