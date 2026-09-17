'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { listGames, rememberGame, tokenFor } from '@/lib/admin-session';
import { t } from '@/lib/i18n';

/**
 * Resolves the teacher credential before the dashboard mounts.
 *
 * Two sources, in order: the `?t=` parameter (so a dashboard link can be
 * bookmarked, or opened on the projector laptop) and this device's
 * localStorage (so the URL can be shared without the token in it). A token
 * arriving by URL is written to storage, which means the teacher only needs
 * the long link once.
 */
export function AdminGateway({
  gameId,
  tokenFromUrl,
}: {
  gameId: string;
  tokenFromUrl: string | null;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const stored = tokenFor(gameId);
    const next = tokenFromUrl ?? stored;

    if (next && next !== stored) {
      const existing = listGames().find((game) => game.gameId === gameId);
      rememberGame({
        gameId,
        adminToken: next,
        joinCode: existing?.joinCode ?? '',
        studentCount: existing?.studentCount ?? 0,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      });
    }

    setToken(next);
    setResolved(true);
  }, [gameId, tokenFromUrl]);

  if (!resolved) {
    return (
      <div className="stage-backdrop flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-lemon" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="stage-backdrop flex min-h-[100dvh] items-center justify-center px-4">
        <div className="panel flex max-w-sm flex-col items-center gap-3 p-8 text-center">
          <p className="font-display text-2xl font-bold">{t.errors.gameMissing}</p>
          <p className="text-sm leading-relaxed text-muted-foreground text-balance">
            {t.errors.unauthorized}
          </p>
          <Button variant="outline" asChild>
            <Link href="/admin">{t.common.back}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <AdminDashboard gameId={gameId} adminToken={token} />;
}
