import type { Synth } from './Synth';

interface Theme { bpm: number; root: number; scale: number[]; prog: number[]; arp: number[]; swing: number }

/** minor / dorian / major-ish pentatonic-friendly scales as semitone offsets */
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

const THEMES: Record<string, Theme> = {
  menu: { bpm: 96, root: 45, scale: MINOR, prog: [0, 5, 2, 6], arp: [0, 2, 4, 2, 7, 4, 2, 4], swing: 0 },
  neon_street: { bpm: 122, root: 45, scale: MINOR, prog: [0, 5, 2, 6], arp: [0, 2, 4, 7, 4, 2, 7, 9], swing: 0 },
  red_canyon: { bpm: 104, root: 50, scale: DORIAN, prog: [0, 3, 5, 3], arp: [0, 4, 2, 4, 7, 4, 2, 0], swing: 0.12 },
  coast_highway: { bpm: 126, root: 48, scale: MAJOR, prog: [0, 4, 5, 3], arp: [0, 2, 4, 2, 7, 9, 7, 4], swing: 0 },
  alpine_pass: { bpm: 98, root: 52, scale: MINOR, prog: [0, 6, 5, 4], arp: [0, 4, 7, 4, 9, 7, 4, 2], swing: 0.08 },
  harbor_docks: { bpm: 110, root: 42, scale: MINOR, prog: [0, 0, 5, 6], arp: [0, 0, 4, 0, 7, 0, 4, 2], swing: 0.1 },
  sunset_downtown: { bpm: 120, root: 43, scale: MAJOR, prog: [0, 5, 3, 4], arp: [0, 4, 7, 4, 2, 4, 7, 9], swing: 0 },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Small procedural synthwave loop on the shared audio context (bass, arp, kick, hat, pad). */
export class Music {
  private theme: Theme = THEMES.menu;
  private step = 0;
  private nextT = 0;
  private timer: number | null = null;
  private gain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  intensity = 0.5;

  constructor(private synth: Synth) {}

  /** Call after the synth's context exists (first user gesture). */
  start(): void {
    const c = this.synth.ctx;
    if (!c || !this.synth.master || this.timer !== null) return;
    this.gain = c.createGain();
    this.gain.gain.value = 0.2;
    this.gain.connect(this.synth.master);
    const buf = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.nextT = c.currentTime + 0.1;
    this.timer = window.setInterval(() => this.pump(), 30);
  }

  setTheme(id: string, intensity: number): void {
    this.theme = THEMES[id] ?? THEMES.menu;
    this.intensity = intensity;
  }

  private pump(): void {
    const c = this.synth.ctx;
    if (!c || !this.gain || c.state !== 'running') return;
    const sixteenth = 60 / this.theme.bpm / 4;
    while (this.nextT < c.currentTime + 0.15) {
      this.play(this.step, this.nextT + (this.step % 2 ? sixteenth * this.theme.swing : 0));
      this.nextT += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff = 2400): void {
    const c = this.synth.ctx!;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.gain!);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private play(step: number, t: number): void {
    const th = this.theme, c = this.synth.ctx!;
    const bar = Math.floor(step / 16) % th.prog.length;
    const s16 = step % 16;
    const degree = th.prog[bar];
    const rootNote = th.root + th.scale[degree % 7];
    const q = 60 / th.bpm;
    // kick on every beat
    if (s16 % 4 === 0) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9 * (0.5 + this.intensity * 0.5), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(this.gain!); o.start(t); o.stop(t + 0.25);
    }
    // bass 8ths
    if (s16 % 2 === 0) this.note(mtof(rootNote - (s16 % 8 === 6 ? 0 : 0)), t, q * 0.4, 'sawtooth', 0.32, 520);
    // pad chord once per bar
    if (s16 === 0) {
      for (const off of [0, 2, 4]) {
        const m = th.root + 12 + th.scale[(degree + off) % 7] + (degree + off >= 7 ? 12 : 0);
        this.note(mtof(m), t, q * 3.6, 'sawtooth', 0.05, 1200);
      }
    }
    // arp 16ths (louder in races)
    if (this.intensity > 0.4) {
      const idx = th.arp[s16 % th.arp.length];
      const m = th.root + 24 + th.scale[(degree + idx) % 7] + (((degree + idx) / 7) | 0) * 12;
      this.note(mtof(m), t, q * 0.2, 'square', 0.05 * this.intensity, 3200);
    }
    // hats on off-beats
    if (this.intensity > 0.6 && s16 % 4 === 2 && this.noise) {
      const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      src.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 7000;
      g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(f); f.connect(g); g.connect(this.gain!); src.start(t); src.stop(t + 0.08);
    }
  }
}
