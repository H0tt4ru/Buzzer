import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CreateGamePanel } from '@/components/admin/CreateGamePanel';
import { t } from '@/lib/i18n';

export default function AdminIndexPage() {
  return (
    <main className="stage-backdrop flex min-h-[100dvh] flex-col items-center gap-6 px-4 py-8 sm:px-6">
      <div className="flex w-full max-w-2xl items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t.common.back}
        </Link>
        <span className="font-display text-lg font-bold">{t.app.name}</span>
      </div>

      <CreateGamePanel />
    </main>
  );
}
