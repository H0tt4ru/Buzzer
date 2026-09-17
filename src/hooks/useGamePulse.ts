'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import type { ConnectionState, GamePulse } from '@/types/game';

/**
 * Subscribes to the one realtime row for a game.
 *
 * Both the teacher and every student use this. A single UPDATE on game_pulse
 * fans out to everyone, so a round transition is one message rather than one
 * per table, and every device flips at the same moment.
 *
 * RECONNECTION
 * ------------
 * The realtime socket is not treated as a source of truth about state, only
 * about liveness. Whenever the channel (re)subscribes, `onResync` fires so the
 * caller can re-read authoritative state from the database. That covers
 * Wi-Fi dropping, a suspended tab, a phone waking up, and Supabase itself
 * reconnecting — in all of those the local copy may be arbitrarily stale, and
 * the round may have moved on without us.
 *
 * `connection` is exported so the UI can refuse to offer a press while the
 * socket is down instead of letting a student tap into a void.
 */
export interface UseGamePulseOptions {
  gameId: string | null;
  /** Called on first subscribe and after every reconnect. */
  onResync?: () => void;
  /** Called with every pulse row as it arrives. */
  onPulse?: (pulse: GamePulse) => void;
}

export interface UseGamePulseResult {
  pulse: GamePulse | null;
  connection: ConnectionState;
  /** Epoch ms (local clock) of the last message or successful resubscribe. */
  lastMessageAt: number;
}

export function useGamePulse({
  gameId,
  onResync,
  onPulse,
}: UseGamePulseOptions): UseGamePulseResult {
  const [pulse, setPulse] = useState<GamePulse | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [lastMessageAt, setLastMessageAt] = useState(() => Date.now());

  // Held in refs so that changing callback identities never tears down and
  // rebuilds the subscription mid-round.
  const onResyncRef = useRef(onResync);
  const onPulseRef = useRef(onPulse);
  const hasSubscribedRef = useRef(false);

  onResyncRef.current = onResync;
  onPulseRef.current = onPulse;

  useEffect(() => {
    if (!gameId) return;

    const supabase = getSupabase();
    let channel: RealtimeChannel | null = null;
    let disposed = false;

    const apply = (row: GamePulse) => {
      setPulse((previous) => {
        // Messages can in principle arrive out of order after a reconnect;
        // revision is monotonic, so older rows are dropped.
        if (previous && previous.revision > row.revision) return previous;
        return row;
      });
      setLastMessageAt(Date.now());
      onPulseRef.current?.(row);
    };

    channel = supabase
      .channel(`pulse:${gameId}`, { config: { private: false } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_pulse', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as GamePulse | undefined;
          if (row && row.game_id) apply(row);
        },
      )
      .subscribe((status) => {
        if (disposed) return;

        if (status === 'SUBSCRIBED') {
          setConnection('connected');
          setLastMessageAt(Date.now());
          // First subscribe and every reconnect both land here. Re-read state
          // rather than assuming what we held is still true.
          onResyncRef.current?.();
          hasSubscribedRef.current = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection(hasSubscribedRef.current ? 'reconnecting' : 'connecting');
        } else if (status === 'CLOSED') {
          setConnection('offline');
        }
      });

    const onOnline = () => {
      setConnection((current) => (current === 'connected' ? current : 'reconnecting'));
    };
    const onOffline = () => setConnection('offline');
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        // A tab that was suspended may hold a socket the OS already killed.
        onResyncRef.current?.();
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [gameId]);

  return { pulse, connection, lastMessageAt };
}
