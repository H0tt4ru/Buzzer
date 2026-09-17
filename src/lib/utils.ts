import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** HH:MM:SS on the viewer's clock — used for the event history. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour12: false });
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return 'baru saja';
  if (seconds < 60) return `${seconds} detik lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  return `${Math.floor(minutes / 60)} jam lalu`;
}

/** Build a student link. Falls back to the current origin in the browser. */
export function studentLink(token: string, origin?: string): string {
  const base =
    origin ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/\/$/, '')}/play/${token}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older mobile browsers / non-secure contexts.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Turns the teacher's textarea into a name list. Blank lines keep their seat
 * and get an automatic placeholder, so pasting a class list with gaps in it
 * still lines up with the register.
 */
export function parseNames(raw: string, fallbackCount: number): string[] {
  const lines = raw.split('\n').map((line) => line.trim());

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  if (lines.length === 0) {
    return Array.from({ length: Math.max(1, fallbackCount) }, (_, i) => `Siswa ${i + 1}`);
  }

  return lines.map((name, i) => (name.length > 0 ? name : `Siswa ${i + 1}`));
}
