// Web Audio API based sound effects.
// No external audio files — synthesized tones with smooth envelopes.

const SOUND_KEY = "chess.sound.v1";
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const Ctor = window.AudioContext || (window as unknown as {
      webkitAudioContext: typeof AudioContext;
    }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

type ToneOptions = {
  freq: number;
  durationMs: number;
  volume?: number;
  type?: OscillatorType;
  attack?: number;
};

function tone({
  freq,
  durationMs,
  volume = 0.07,
  type = "sine",
  attack = 0.005,
}: ToneOptions): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const now = ctx.currentTime;
  const durationSec = durationMs / 1000;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(SOUND_KEY);
  if (v === null) return true;
  return v === "1";
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_KEY, enabled ? "1" : "0");
}

export const sounds = {
  move(): void {
    if (!isSoundEnabled()) return;
    tone({ freq: 360, durationMs: 70, volume: 0.06, type: "sine" });
  },
  capture(): void {
    if (!isSoundEnabled()) return;
    tone({ freq: 220, durationMs: 110, volume: 0.08, type: "triangle" });
  },
  check(): void {
    if (!isSoundEnabled()) return;
    tone({ freq: 660, durationMs: 140, volume: 0.07, type: "sine" });
    setTimeout(() => {
      tone({ freq: 540, durationMs: 100, volume: 0.05, type: "sine" });
    }, 90);
  },
  checkmate(): void {
    if (!isSoundEnabled()) return;
    tone({ freq: 440, durationMs: 180, volume: 0.08, type: "sine" });
    setTimeout(() => {
      tone({ freq: 330, durationMs: 220, volume: 0.07, type: "sine" });
    }, 150);
    setTimeout(() => {
      tone({ freq: 247, durationMs: 320, volume: 0.06, type: "sine" });
    }, 320);
  },
  start(): void {
    if (!isSoundEnabled()) return;
    tone({ freq: 523, durationMs: 90, volume: 0.05, type: "sine" });
  },
};
