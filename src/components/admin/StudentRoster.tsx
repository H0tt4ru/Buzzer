'use client';

import { Check, Hand, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn, formatRelative } from '@/lib/utils';
import { t } from '@/lib/i18n';
import type { AdminStudentRow } from '@/types/game';

/**
 * Connection and readiness at a glance.
 *
 * "Connected" is deliberately two signals ANDed together: the heartbeat that
 * the database reaps after 25s of silence, and Realtime presence, which
 * reports a join/leave within a second. Presence alone is too optimistic (a
 * suspended tab keeps its socket for a while); the heartbeat alone is too slow
 * for a teacher watching the room. Either one going quiet dims the light.
 */
export function StudentRoster({
  students,
  presentIds,
  excludedIds = [],
  winnerId = null,
}: {
  students: AdminStudentRow[];
  presentIds: Set<string>;
  excludedIds?: string[];
  winnerId?: string | null;
}) {
  if (students.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t.admin.rosterEmpty}</p>;
  }

  const live = students.filter((s) => s.connected && presentIds.has(s.id));
  const ready = students.filter((s) => s.is_ready);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Meter
          label={t.admin.connectedOf(live.length, students.length)}
          value={live.length}
          total={students.length}
          tone="lime"
        />
        <Meter
          label={t.admin.readyOf(ready.length, students.length)}
          value={ready.length}
          total={students.length}
          tone="cyan"
        />
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {students.map((student) => {
          const connected = student.connected && presentIds.has(student.id);

          return (
            <li
              key={student.id}
              className={cn(
                'flex items-center gap-2.5 rounded-md bg-white/5 px-3 py-2',
                student.id === winnerId && 'bg-lemon/15 ring-1 ring-lemon/40',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'size-2.5 shrink-0 rounded-full',
                  connected ? 'bg-lime shadow-[0_0_0.5rem_hsl(var(--lime))]' : 'bg-white/20',
                )}
              />
              <span className="w-6 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                {student.seat_index}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{student.name}</span>

              <span className="flex shrink-0 items-center gap-1.5">
                {student.id === winnerId ? <Trophy className="size-4 text-lemon" /> : null}
                {student.buzzed_this_round && student.id !== winnerId ? (
                  <Hand className="size-4 text-cyan" />
                ) : null}
                {excludedIds.includes(student.id) ? (
                  <Badge variant="warn" className="hidden sm:inline-flex">
                    {t.admin.excludedBadge}
                  </Badge>
                ) : null}
                {student.is_ready ? (
                  <Badge variant="live">
                    <Check className="size-3" />
                    {t.admin.readyBadge}
                  </Badge>
                ) : (
                  <Badge variant="muted">{t.student.notReadyYet}</Badge>
                )}
              </span>

              <span className="hidden w-24 shrink-0 text-right text-[0.7rem] text-muted-foreground lg:block">
                {connected ? t.connection.connected : formatRelative(student.last_seen_at)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Meter({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: 'lime' | 'cyan';
}) {
  return (
    <div className="rounded-md bg-white/5 p-3">
      <p className="mb-2 text-sm font-bold">{label}</p>
      <Progress
        value={total === 0 ? 0 : (value / total) * 100}
        indicatorClassName={tone === 'lime' ? 'bg-lime' : 'bg-cyan'}
      />
    </div>
  );
}
