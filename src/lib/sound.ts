'use client';

/**
 * Sound effects are synthesised with WebAudio rather than shipped as files.
 * Reasons: no network fetch to race the buzzer, no decode stall on the first
 * play, nothing to cache-bust, and every cue can be tuned in code.
 *
 * Autoplay policy: browsers refuse to start an AudioContext until the user has
 * interacted with the page. The context is therefore created lazily and
 * unlocked on the first pointer/key event (see unlockAudio). Until then,
 * playSound() is a no-op — it never throws and never blocks, so a student who
 * has not touched the screen yet still gets a working buzzer, just silently.
 */

export type SoundName =
  | 'buzzer_ready'
  | 'buzzer_press'
  | 'win'
  | 'lose'
  | 'countdown_tick'
  | 'countdown_go'
  | 'round_start'
  | 'ready'
  | 'pause'
  | 'resume'
  | 'game_over'
  | 'leaderboard'
  | 'click'
  | 'error';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let unlocked = false;

type WindowWithAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;

  const Ctor = window.AudioContext ?? (window as WindowWithAudio).webkitAudioContext;
  if (!Ctor) return null;

  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a real user gesture. Safe to call repeatedly. */
export function unlockAudio(): void {
  const context = ensureContext();
  if (!context) return;
  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined);
  }
  unlocked = context.state === 'running';
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  if (master && ctx) {
    master.gain.setTargetAtTime(value ? 0.32 : 0, ctx.currentTime, 0.01);
  }
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

interface ToneSpec {
  freq: number;
  /** Seconds from "now" that this tone starts. */
  at?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  /** Linear glide to this frequency over the tone's duration. */
  sweepTo?: number;
}

function tone(spec: ToneSpec): void {
  if (!ctx || !master) return;

  const start = ctx.currentTime + (spec.at ?? 0);
  const duration = spec.duration ?? 0.12;
  const peak = spec.gain ?? 0.6;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = spec.type ?? 'triangle';
  osc.frequency.setValueAtTime(spec.freq, start);
  if (spec.sweepTo) {
    osc.frequency.linearRampToValueAtTime(spec.sweepTo, start + duration);
  }

  // Quick attack, exponential tail: reads as "musical" rather than a click.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(at: number, duration: number, gainValue: number): void {
  if (!ctx || !master) return;

  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }

  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buffer;
  gain.gain.value = gainValue;
  src.connect(gain);
  gain.connect(master);
  src.start(ctx.currentTime + at);
}

const RECIPES: Record<SoundName, () => void> = {
  // Rising two-note fanfare: "go".
  buzzer_ready: () => {
    tone({ freq: 523, duration: 0.09, type: 'square', gain: 0.5 });
    tone({ freq: 784, at: 0.08, duration: 0.16, type: 'square', gain: 0.55 });
    noise(0.08, 0.12, 0.08);
  },
  // Hard, low, immediate — a game-show desk buzzer.
  buzzer_press: () => {
    tone({ freq: 220, duration: 0.22, type: 'sawtooth', gain: 0.7, sweepTo: 130 });
    noise(0, 0.06, 0.12);
  },
  win: () => {
    [523, 659, 784, 1047].forEach((freq, i) =>
      tone({ freq, at: i * 0.085, duration: 0.2, type: 'triangle', gain: 0.55 }),
    );
    noise(0.34, 0.3, 0.05);
  },
  lose: () => {
    tone({ freq: 330, duration: 0.16, type: 'sine', gain: 0.4 });
    tone({ freq: 233, at: 0.14, duration: 0.26, type: 'sine', gain: 0.4 });
  },
  countdown_tick: () => {
    tone({ freq: 660, duration: 0.07, type: 'square', gain: 0.35 });
  },
  countdown_go: () => {
    tone({ freq: 880, duration: 0.18, type: 'square', gain: 0.6 });
  },
  round_start: () => {
    tone({ freq: 392, duration: 0.1, gain: 0.4 });
    tone({ freq: 587, at: 0.1, duration: 0.14, gain: 0.45 });
  },
  ready: () => {
    tone({ freq: 784, duration: 0.08, gain: 0.35 });
    tone({ freq: 1047, at: 0.07, duration: 0.1, gain: 0.35 });
  },
  pause: () => {
    tone({ freq: 494, duration: 0.12, type: 'sine', gain: 0.35 });
    tone({ freq: 370, at: 0.1, duration: 0.18, type: 'sine', gain: 0.35 });
  },
  resume: () => {
    tone({ freq: 370, duration: 0.12, type: 'sine', gain: 0.35 });
    tone({ freq: 494, at: 0.1, duration: 0.18, type: 'sine', gain: 0.35 });
  },
  game_over: () => {
    [784, 659, 523, 392].forEach((freq, i) =>
      tone({ freq, at: i * 0.12, duration: 0.24, type: 'triangle', gain: 0.5 }),
    );
  },
  leaderboard: () => {
    [523, 659, 784, 1047, 1319].forEach((freq, i) =>
      tone({ freq, at: i * 0.07, duration: 0.3, type: 'sine', gain: 0.45 }),
    );
  },
  click: () => {
    tone({ freq: 1200, duration: 0.035, type: 'square', gain: 0.18 });
  },
  error: () => {
    tone({ freq: 196, duration: 0.18, type: 'sawtooth', gain: 0.3 });
  },
};

/**
 * Fire and forget. Never awaited by interaction code: the press handler calls
 * this and moves straight on to the network request.
 */
export function playSound(name: SoundName): void {
  if (!enabled) return;
  const context = ensureContext();
  if (!context || context.state !== 'running') return;

  try {
    RECIPES[name]();
  } catch {
    // A failed sound must never surface as an error to a 13-year-old.
  }
}
