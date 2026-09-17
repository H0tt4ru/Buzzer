# Fix: Excessive `/api/games/[gameId]/state` polling (corrected)

## Bugs found in previous attempt

### Bug 1: 3×403 never fires
`setUnauthorized(true)` was called after every 403. React re-rendered → `refresh` memoized with `unauthorized=true` → polling effect re-ran → counter reset to 0. The first 403 killed all future attempts before the counter could reach 3.

### Bug 2: Shared abort controller
`pollAbortRef` was passed into `refresh()` which is also called by realtime (`onPulse`/`onResync`). Aborting it on game-end or unmount would cancel any in-flight realtime fetch too.

## Architecture (unchanged)
```
PostgreSQL game_pulse
        ↓
Supabase Realtime (PRIMARY sync — drives refresh() on every change)
        ↓
    refresh() ← /api/games/[gameId]/state   (no signal, no 403 counting)

Every 5s backstop poll ───────────────────────→ doPoll()  (with signal + 403 counting)
```

## Changes: `src/hooks/useAdminGame.ts`

Three structural changes:

### 1. Extract shared fetch logic into module-level `fetchSnapshot()`
Moves the raw HTTP call + error-enum throwing out of the hook so both call paths share one source of truth:

```ts
async function fetchSnapshot(
  gameId: string,
  adminToken: string,
  signal?: AbortSignal,
): Promise<AdminSnapshot | null> {
  const response = await fetch(`/api/games/${gameId}/state`, {
    headers: { 'x-admin-token': adminToken },
    cache: 'no-store',
    signal,
  });

  if (response.status === 401 || response.status === 403) throw { kind: 'unauthorized' };
  if (response.status === 404) throw { kind: 'missing' };
  return (await response.json()) as AdminSnapshot;
}
```

### 2. Split into two call paths

**`refresh`** — used by realtime callbacks, mount effect, and action dispatch:
```ts
const refresh = useCallback(async () => {
  if (!adminToken || unauthorized || missing) return;
  try {
    setLoading(true);
    const body = await fetchSnapshot(gameId, adminToken);  // no signal
    setSnapshot(body);
    setUnauthorized(false);
    setMissing(false);
  } catch (err: unknown) {
    const typed = err as { kind?: string };
    if (typed.kind === 'unauthorized') setUnauthorized(true);
    if (typed.kind === 'missing') setMissing(true);
  } finally {
    setLoading(false);
  }
}, [gameId, adminToken, unauthorized, missing]);
```
Note: `unauthorized` stays in deps here because we WANT realtime calls to stop when auth fails permanently. But unlike before, `setUnauthorized` is only called from here when the API returns 401/403 on a non-polling call — which shouldn't happen during normal gameplay.

**`doPoll`** — used only by the 5s interval:
```ts
const doPoll = useCallback(async () => {
  if (!adminToken || unauthorized || missing || pollingStoppedRef.current) return;
  const controller = pollAbortRef.current;
  if (!controller) return;
  try {
    setLoading(true);
    const body = await fetchSnapshot(gameId, adminToken, controller.signal);
    consecutive403Ref.current = 0;           // reset on any success
    setSnapshot(body);
    setUnauthorized(false);
    setMissing(false);
    if (body.game.status === 'ended') {
      pollingStoppedRef.current = true;       // no more polls; no abort needed
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    const typed = err as { kind?: string };
    if (typed.kind === 'unauthorized') {
      consecutive403Ref.current += 1;
      if (consecutive403Ref.current >= MAX_CONSECUTIVE_403) {
        pollingStoppedRef.current = true;
        controller.abort();
        setUnauthorized(true);               // only here, at terminal
      }
    } else if (typed.kind === 'missing') {
      pollingStoppedRef.current = true;
      controller.abort();
      setMissing(true);
    }
  } finally {
    setLoading(false);
  }
}, [gameId, adminToken, unauthorized, missing]);
```

### 3. Update the polling effect
Depends on `doPoll` instead of `refresh`:
```ts
useEffect(() => {
  pollingStoppedRef.current = false;
  consecutive403Ref.current = 0;

  const controller = new AbortController();
  pollAbortRef.current = controller;

  const timer = window.setInterval(() => {
    if (!pollingStoppedRef.current) void doPoll();
  }, POLL_MS);

  return () => {
    window.clearInterval(timer);
    controller.abort();
    pollAbortRef.current = null;
    pollingStoppedRef.current = true;
  };
}, [doPoll]);
```

### Why this fixes both bugs

| Bug | Before | After |
|---|---|---|
| 3×403 never reaches 3 | `setUnauthorized` on every 403 → `refresh` re-memos → counter resets | `setUnauthorized` only on 3rd 403 inside `doPoll`; `refresh` has no 403 counting |
| Shared abort signal | Same `pollAbortRef` used in `refresh()` called by realtime | `fetchSnapshot` called without signal from `refresh`; only `doPoll` passes the signal |

## Behavior matrix

| Scenario | Before fix | After fix |
|---|---|---|
| First 403 (wrong token) | Sets `unauthorized=true`, stops polling | Counts 1/3, tries again |
| Second 403 | No attempt (guard blocked it) | Counts 2/3, tries again |
| Third 403 | N/A | Stops poll, sets `unauthorized=true` |
| 404 (deleted game) | Sets `missing`, still polled briefly | Stops poll immediately |
| Game ends | Pulse-driven; poll kept running | `doPoll` sees `status==='ended'`, sets flag, stops |
| Reconnect | `refresh()` called once | `refresh()` called once (same as before) |
| Unmount | Interval cleared, but shared controller aborted | Same, plus `pollingStoppedRef=true` |
| Transient network error | Retries next tick | Retries next tick (same) |

## Verification checklist
1. [ ] Normal gameplay: realtime drives updates, poll runs as 5s backstop
2. [ ] Supabase Realtime still primary: `useGamePulse` untouched
3. [ ] Initial load: `refresh()` called on mount
4. [ ] Reconnection: `onResync` → `refresh()` once
5. [ ] Game ends: `doPoll` stops after seeing `status==='ended'`
6. [ ] Unmount: `clearInterval` + `abort` + `pollingStoppedRef=true`
7. [ ] Three consecutive 403s: counter reaches 3, `pollingStoppedRef=true`, `unauthorized=true`
8. [ ] Buzzer concurrency: unchanged, server-authoritative
9. [ ] No in-flight abort leaks: realtime `refresh()` has no signal, cannot be aborted by polling controller
