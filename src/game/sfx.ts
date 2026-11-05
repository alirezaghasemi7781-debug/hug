// صداگذاری (WebAudio) و لرزش
let ctx: AudioContext | null = null;
export const sfxCfg = { sound: true, haptics: true };
const last: Record<string, number> = {};

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

type Kind = 'shot' | 'boom' | 'coin' | 'alert' | 'leak' | 'build' | 'spell' | 'win' | 'lose';
const CFG: Record<Kind, { f: number; f2: number; d: number; type: OscillatorType; v: number; gap: number }> = {
  shot: { f: 520, f2: 200, d: 0.06, type: 'square', v: 0.025, gap: 0.07 },
  boom: { f: 140, f2: 40, d: 0.28, type: 'sawtooth', v: 0.06, gap: 0.08 },
  coin: { f: 880, f2: 1320, d: 0.1, type: 'triangle', v: 0.04, gap: 0.05 },
  alert: { f: 440, f2: 330, d: 0.3, type: 'square', v: 0.04, gap: 0.8 },
  leak: { f: 200, f2: 90, d: 0.4, type: 'sawtooth', v: 0.07, gap: 0.2 },
  build: { f: 330, f2: 660, d: 0.15, type: 'triangle', v: 0.05, gap: 0.05 },
  spell: { f: 90, f2: 600, d: 0.5, type: 'sawtooth', v: 0.06, gap: 0.3 },
  win: { f: 523, f2: 1046, d: 0.6, type: 'triangle', v: 0.06, gap: 1 },
  lose: { f: 300, f2: 60, d: 0.8, type: 'sawtooth', v: 0.06, gap: 1 },
};

export function play(kind: Kind) {
  if (!sfxCfg.sound) return;
  const c = ac();
  if (!c) return;
  const cfg = CFG[kind];
  const now = c.currentTime;
  if (last[kind] && now - last[kind] < cfg.gap) return;
  last[kind] = now;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = cfg.type;
    o.frequency.setValueAtTime(cfg.f, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, cfg.f2), now + cfg.d);
    g.gain.setValueAtTime(cfg.v, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + cfg.d);
    o.connect(g).connect(c.destination);
    o.start(now);
    o.stop(now + cfg.d + 0.02);
  } catch {}
}

export function haptic(ms: number | number[]) {
  if (!sfxCfg.haptics) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(ms); } catch {}
  }
}
