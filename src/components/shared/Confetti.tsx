'use client';

import { useEffect, useRef } from 'react';

/**
 * Canvas confetti. Hand-rolled rather than a library so it is ~60 lines, has
 * no bundle cost, and — importantly — stops itself. A burst runs for a fixed
 * duration and then cancels its own animation frame, so a long game does not
 * accumulate rAF loops behind the dashboard.
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
}

const COLORS = ['#FF2E88', '#FFD23F', '#22E0D6', '#7CFF6B', '#FFF7ED'];

export function Confetti({
  /** Change this value to fire a fresh burst. */
  trigger,
  count = 130,
  durationMs = 2600,
}: {
  trigger: string | number | null;
  count?: number;
  durationMs?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (trigger === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    context.scale(dpr, dpr);

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: width * (0.5 + (Math.random() - 0.5) * 0.5),
      y: height * 0.35 + Math.random() * 40,
      vx: (Math.random() - 0.5) * 9,
      vy: -6 - Math.random() * 9,
      size: 5 + Math.random() * 7,
      spin: (Math.random() - 0.5) * 0.3,
      angle: Math.random() * Math.PI,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#FFD23F',
    }));

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      context.clearRect(0, 0, width, height);

      const fade = Math.max(0, 1 - Math.max(0, elapsed - durationMs * 0.6) / (durationMs * 0.4));
      context.globalAlpha = fade;

      for (const p of particles) {
        p.vy += 0.24;
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;

        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.angle);
        context.fillStyle = p.color;
        context.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        context.restore();
      }

      if (elapsed < durationMs) {
        frame = requestAnimationFrame(tick);
      } else {
        context.clearRect(0, 0, width, height);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [trigger, count, durationMs]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 size-full"
    />
  );
}
