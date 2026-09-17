import Link from 'next/link';
import { ArrowRight, Bell, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

export default function HomePage() {
  return (
    <main className="stage-backdrop flex min-h-[100dvh] flex-col items-center justify-center gap-10 px-5 py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="animate-idle-breathe motion-loop flex size-20 items-center justify-center rounded-full bg-magenta shadow-[0_0_3rem_hsl(var(--magenta)/0.6)]">
          <Bell className="size-10 text-white" />
        </span>

        <h1 className="font-display text-5xl font-extrabold leading-none sm:text-7xl">
          {t.app.name}
        </h1>
        <p className="max-w-md text-base text-muted-foreground text-balance sm:text-lg">
          {t.app.tagline}
        </p>
      </div>

      <Button size="xl" asChild>
        <Link href="/admin">
          {t.admin.createTitle}
          <ArrowRight />
        </Link>
      </Button>

      <ul className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        <Feature
          icon={<Users className="size-5 text-cyan" />}
          title="Tanpa pendaftaran"
          body="Setiap siswa dapat satu tautan rahasia. Buka, dan langsung siap bermain."
        />
        <Feature
          icon={<Bell className="size-5 text-lemon" />}
          title="Adil sampai milidetik"
          body="Pemenang ditentukan oleh server, bukan oleh HP yang paling cepat memuat halaman."
        />
        <Feature
          icon={<Trophy className="size-5 text-lime" />}
          title="Klasemen langsung"
          body="Poin, ronde tanpa batas, dan podium juara di akhir permainan."
        />
      </ul>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="panel flex flex-col gap-1.5 p-5">
      {icon}
      <p className="font-display text-base font-bold">{title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}
