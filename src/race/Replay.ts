import type { CarController } from '../vehicle/CarController';

/** Records every car's pose at ~30 Hz so the finished race can be replayed with cinematic cameras. */
export class ReplayRecorder {
  /** Each sample: [time, count, (id, x, y, z, heading) * count] */
  samples: number[][] = [];
  crashes: number[] = [];
  private ids = new WeakMap<CarController, number>();
  private next = 1;
  private acc = 0;

  idOf(car: CarController): number {
    let id = this.ids.get(car);
    if (id === undefined) { id = this.next++; this.ids.set(car, id); }
    return id;
  }

  clear(): void { this.samples = []; this.crashes = []; this.acc = 0; }

  step(dt: number, time: number, cars: readonly CarController[]): void {
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    const row: number[] = [time, cars.length];
    for (const c of cars) row.push(this.idOf(c), c.position.x, c.position.y, c.position.z, c.heading);
    this.samples.push(row);
  }

  markCrash(time: number): void { this.crashes.push(time); }

  get duration(): number { return this.samples.length ? this.samples[this.samples.length - 1][0] : 0; }

  /** Interpolated pose of every recorded car at time t. */
  at(t: number, out: Map<number, { x: number; y: number; z: number; h: number }>): void {
    out.clear();
    const s = this.samples;
    if (!s.length) return;
    let lo = 0, hi = s.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid][0] <= t) lo = mid; else hi = mid; }
    const a = s[lo], b = s[hi];
    const f = b[0] > a[0] ? Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0]))) : 0;
    const nextPose = new Map<number, number>();
    for (let i = 0; i < b[1]; i++) nextPose.set(b[2 + i * 5], 2 + i * 5);
    for (let i = 0; i < a[1]; i++) {
      const o = 2 + i * 5;
      const id = a[o];
      const k = nextPose.get(id);
      if (k === undefined) { out.set(id, { x: a[o + 1], y: a[o + 2], z: a[o + 3], h: a[o + 4] }); continue; }
      let dh = b[k + 4] - a[o + 4];
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      out.set(id, {
        x: a[o + 1] + (b[k + 1] - a[o + 1]) * f, y: a[o + 2] + (b[k + 2] - a[o + 2]) * f,
        z: a[o + 3] + (b[k + 3] - a[o + 3]) * f, h: a[o + 4] + dh * f,
      });
    }
  }
}
