/** Tiny Web Audio synth: engine drone + one-shot effects. Starts on the first user gesture. */
export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineA: OscillatorNode | null = null;
  private engineB: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  muted = false;

  /** Call from a user gesture. */
  resume(): void {
    if (!this.ctx) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctx();
      } catch { return; }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(c.destination);
      this.engineGain = c.createGain();
      this.engineGain.gain.value = 0;
      this.engineGain.connect(this.master);
      this.engineA = c.createOscillator(); this.engineA.type = 'sawtooth';
      this.engineB = c.createOscillator(); this.engineB.type = 'square';
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      this.engineA.connect(lp); this.engineB.connect(lp); lp.connect(this.engineGain);
      this.engineA.start(); this.engineB.start();
      // wind / tyre noise
      const buf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = c.createBufferSource(); this.noise.buffer = buf; this.noise.loop = true;
      this.noiseFilter = c.createBiquadFilter(); this.noiseFilter.type = 'bandpass'; this.noiseFilter.frequency.value = 900; this.noiseFilter.Q.value = 0.6;
      this.noiseGain = c.createGain(); this.noiseGain.gain.value = 0;
      this.noise.connect(this.noiseFilter); this.noiseFilter.connect(this.noiseGain); this.noiseGain.connect(this.master);
      this.noise.start();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  /** speed in m/s, throttle 0..1 */
  engine(speed: number, throttle: number, nitro: boolean, slip: number, active: boolean): void {
    if (!this.ctx || !this.engineA || !this.engineB || !this.engineGain || !this.noiseGain || !this.noiseFilter) return;
    const t = this.ctx.currentTime;
    // fake gearbox: rpm sawtooths through 5 gears
    const gear = Math.min(4, Math.floor(speed / 14));
    const inGear = (speed - gear * 14) / 14;
    const rpm = 0.25 + inGear * 0.75 + (nitro ? 0.1 : 0);
    const f = 48 + rpm * 120 + gear * 8;
    this.engineA.frequency.setTargetAtTime(f, t, 0.04);
    this.engineB.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    this.engineGain.gain.setTargetAtTime(active ? 0.05 + throttle * 0.07 + (nitro ? 0.04 : 0) : 0, t, 0.08);
    this.noiseFilter.frequency.setTargetAtTime(500 + speed * 22, t, 0.1);
    this.noiseGain.gain.setTargetAtTime(active ? Math.min(0.2, speed / 280 + Math.min(0.12, slip * 0.012)) : 0, t, 0.1);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  coin(): void { this.tone(1200, 0.08, 'square', 0.08); this.tone(1800, 0.12, 'square', 0.08, undefined, 0.06); }
  beep(go: boolean): void { this.tone(go ? 880 : 520, go ? 0.5 : 0.18, 'square', 0.15); }
  wall(strength: number): void { this.tone(140, 0.2, 'sawtooth', Math.min(0.3, 0.05 + strength * 0.02), 40); }
  pad(): void { this.tone(300, 0.4, 'sawtooth', 0.12, 1200); }
  perfect(): void { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.14, undefined, i * 0.07)); }
  land(): void { this.tone(90, 0.18, 'sine', 0.3, 40); }
  lap(): void { this.tone(760, 0.12, 'triangle', 0.15); this.tone(1020, 0.16, 'triangle', 0.15, undefined, 0.1); }
  finish(win: boolean): void { (win ? [523, 659, 784, 1046] : [392, 330]).forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.16, undefined, i * 0.14)); }
  click(): void { this.tone(500, 0.05, 'square', 0.06); }
  buy(): void { this.tone(700, 0.1, 'triangle', 0.14); this.tone(1050, 0.18, 'triangle', 0.14, undefined, 0.08); }
}
