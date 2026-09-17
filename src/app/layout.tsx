import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/ui/sonner';
import { t } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: `${t.app.name} — ${t.app.tagline}`,
  description: t.app.tagline,
  applicationName: t.app.name,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // A student jabbing at a 300px buzzer should not pinch-zoom the page.
  maximumScale: 1,
  userScalable: false,
  themeColor: '#150b2b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <head>
        {/*
          Fonts are linked rather than imported through next/font so the build
          never needs network access; the stack in globals.css falls back to
          system fonts if fonts.googleapis.com is unreachable from the
          classroom.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body className="min-h-[100dvh] bg-background font-ui text-foreground antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
