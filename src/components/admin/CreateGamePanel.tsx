'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/input';
import { forgetGame, listGames, rememberGame, type StoredGame } from '@/lib/admin-session';
import { adminErrorMessage, t } from '@/lib/i18n';
import { parseNames } from '@/lib/utils';
import type { CreatedGame } from '@/types/game';

const SAMPLE = 'Andi\nBudi\nCitra\nDimas';

/**
 * The entry point. A game is created from a list of names — no accounts, no
 * class setup — and the admin token that comes back is what authorises every
 * later action, kept on this device and also carried in the dashboard URL so
 * the teacher can move to a projector or tablet.
 */
export function CreateGamePanel() {
  const router = useRouter();
  const [names, setNames] = useState(SAMPLE);
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState<StoredGame[]>([]);

  // localStorage is only available after hydration.
  useEffect(() => {
    setSaved(listGames());
  }, []);

  const parsed = parseNames(names, 1);
  const count = names.trim().length === 0 ? 0 : parsed.length;

  const create = async () => {
    if (count === 0) {
      toast.error(t.errors.admin.no_students);
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ names: parsed }),
      });

      const body = (await response.json()) as CreatedGame | { ok: false; error?: string };

      if (!response.ok || body.ok !== true) {
        toast.error(adminErrorMessage('error' in body ? body.error : undefined));
        return;
      }

      rememberGame({
        gameId: body.game_id,
        adminToken: body.admin_token,
        joinCode: body.join_code,
        studentCount: body.students.length,
        createdAt: new Date().toISOString(),
      });

      router.push(`/admin/${body.game_id}?t=${encodeURIComponent(body.admin_token)}`);
    } catch {
      toast.error(t.errors.network);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t.admin.createTitle}</CardTitle>
          <CardDescription className="text-balance">{t.admin.createSubtitle}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <Label htmlFor="names">{t.admin.namesLabel}</Label>
            <Badge variant={count > 0 ? 'cool' : 'muted'}>
              {t.admin.studentCount}: {count}
            </Badge>
          </div>

          <Textarea
            id="names"
            value={names}
            onChange={(event) => setNames(event.target.value)}
            placeholder={t.admin.namesPlaceholder}
            spellCheck={false}
            className="min-h-48 font-ui"
          />
          <p className="text-xs text-muted-foreground text-balance">{t.admin.namesHelp}</p>

          <Button
            size="lg"
            disabled={creating || count === 0}
            onClick={() => void create()}
            className="mt-1"
          >
            {creating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {creating ? t.admin.creating : t.admin.createButton}
          </Button>
        </CardContent>
      </Card>

      {saved.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.admin.resumeTitle}</CardTitle>
            <CardDescription>{t.admin.resumeBody}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {saved.map((game) => (
              <div
                key={game.gameId}
                className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2"
              >
                <span className="font-mono text-sm font-bold tracking-widest text-cyan">
                  {game.joinCode}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {game.studentCount} siswa · {new Date(game.createdAt).toLocaleString('id-ID')}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    router.push(
                      `/admin/${game.gameId}?t=${encodeURIComponent(game.adminToken)}`,
                    )
                  }
                >
                  {t.admin.openDashboard}
                  <ArrowRight />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t.admin.forget}
                  onClick={() => {
                    forgetGame(game.gameId);
                    setSaved(listGames());
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
