import * as THREE from 'three';
import type { BiomePreset } from '../data/biomes';

export interface TrackQuery {
  idx: number;
  /** Distance along the lap in metres [0, length). */
  s: number;
  /** Signed lateral offset from the centre line (+ = left of travel direction). */
  lat: number;
  /** Unit tangent. */
  tx: number;
  tz: number;
}

/** A closed spline track sampled into arrays for fast "where am I on the road" queries. */
export class Track {
  readonly n: number;
  readonly length: number;
  readonly px: Float32Array;
  readonly pz: Float32Array;
  /** Unit tangents. */
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  /** Cumulative distance of each sample. */
  readonly sAt: Float32Array;
  /** Signed curvature (1/m), + = turning left. */
  readonly curv: Float32Array;
  readonly halfWidth: number;
  readonly shoulder: number;
  /** Lap-distance ranges where the side walls are open (junctions). */
  readonly wallGaps: [number, number][] = [];
  private grid = new Map<number, number[]>();
  private readonly cell = 24;

  constructor(readonly preset: BiomePreset, samples = 900) {
    const sh = preset.trackShape;
    const ctrl: THREE.Vector3[] = [];
    const K = 72;
    for (let i = 0; i < K; i++) {
      const th = (i / K) * Math.PI * 2;
      let r = 1;
      for (const [f, a, ph] of sh.harmonics) r += a * Math.cos(f * th + ph);
      ctrl.push(new THREE.Vector3(Math.cos(th) * r * sh.radius * sh.stretchX, 0, Math.sin(th) * r * sh.radius));
    }
    const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
    const pts = curve.getSpacedPoints(samples);
    pts.pop(); // closed: last == first
    this.n = pts.length;
    this.px = new Float32Array(this.n);
    this.pz = new Float32Array(this.n);
    this.tx = new Float32Array(this.n);
    this.tz = new Float32Array(this.n);
    this.sAt = new Float32Array(this.n);
    this.curv = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) { this.px[i] = pts[i].x; this.pz[i] = pts[i].z; }
    let acc = 0;
    for (let i = 0; i < this.n; i++) {
      const j = (i + 1) % this.n;
      const k = (i - 1 + this.n) % this.n;
      let dx = this.px[j] - this.px[k], dz = this.pz[j] - this.pz[k];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
      this.sAt[i] = acc;
      acc += Math.hypot(this.px[j] - this.px[i], this.pz[j] - this.pz[i]);
    }
    this.length = acc;
    const ds = this.length / this.n;
    for (let i = 0; i < this.n; i++) {
      const j = (i + 3) % this.n, k = (i - 3 + this.n) % this.n;
      const h1 = Math.atan2(this.tx[k], this.tz[k]);
      const h2 = Math.atan2(this.tx[j], this.tz[j]);
      let d = h2 - h1;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // heading increases when turning left (towards +x for forward +z)
      this.curv[i] = d / (6 * ds);
    }
    this.halfWidth = preset.roadWidth / 2;
    this.shoulder = preset.shoulder;
    for (let i = 0; i < this.n; i++) {
      const key = this.cellKey(this.px[i], this.pz[i]);
      const a = this.grid.get(key);
      if (a) a.push(i); else this.grid.set(key, [i]);
    }
  }

  private cellKey(x: number, z: number): number {
    return Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell);
  }

  inGap(s: number): boolean {
    for (const [a, b] of this.wallGaps) if (s >= a && s <= b) return true;
    return false;
  }

  /** Left-pointing unit normal at sample i (matches the car's "side" vector). */
  nx(i: number): number { return this.tz[i]; }
  nz(i: number): number { return -this.tx[i]; }

  wrap(i: number): number { return ((i % this.n) + this.n) % this.n; }
  /** Index for a distance along the lap. */
  indexAt(s: number): number {
    const f = (((s % this.length) + this.length) % this.length) / this.length;
    return Math.min(this.n - 1, Math.floor(f * this.n));
  }
  heading(i: number): number { return Math.atan2(this.tx[i], this.tz[i]); }

  /** Point on the road at lap-distance s and lateral offset lat. */
  pointAt(s: number, lat: number, out = { x: 0, z: 0 }): { x: number; z: number } {
    const i = this.indexAt(s);
    out.x = this.px[i] + this.nx(i) * lat;
    out.z = this.pz[i] + this.nz(i) * lat;
    return out;
  }

  /** Nearest centre-line sample. `hint` makes it O(window); omit for a global search. */
  query(x: number, z: number, hint = -1, out: TrackQuery = { idx: 0, s: 0, lat: 0, tx: 0, tz: 1 }): TrackQuery {
    let best = -1, bd = Infinity;
    if (hint >= 0) {
      const W = 24;
      for (let o = -W; o <= W; o++) {
        const i = this.wrap(hint + o);
        const dx = x - this.px[i], dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      // fell off the window (teleport / reset): search everything
      if (bd > 90 * 90) hint = -1;
    }
    if (hint < 0) {
      bd = Infinity;
      for (let i = 0; i < this.n; i++) {
        const dx = x - this.px[i], dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    const i = best;
    const dx = x - this.px[i], dz = z - this.pz[i];
    const along = dx * this.tx[i] + dz * this.tz[i];
    out.idx = i;
    out.lat = dx * this.nx(i) + dz * this.nz(i);
    let s = this.sAt[i] + along;
    s = ((s % this.length) + this.length) % this.length;
    out.s = s;
    out.tx = this.tx[i]; out.tz = this.tz[i];
    return out;
  }

  /** Distance from (x,z) to the nearest centre-line sample (grid accelerated, used for prop placement). */
  distanceToRoad(x: number, z: number): number {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let bd = Infinity;
    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const arr = this.grid.get((cx + a) * 100003 + (cz + b));
        if (!arr) continue;
        for (const i of arr) {
          const dx = x - this.px[i], dz = z - this.pz[i];
          const d = dx * dx + dz * dz;
          if (d < bd) bd = d;
        }
      }
    }
    return bd === Infinity ? 1e9 : Math.sqrt(bd);
  }

  /** Smallest turning radius of the layout (diagnostic). */
  minRadius(): number {
    let m = Infinity;
    for (let i = 0; i < this.n; i++) m = Math.min(m, 1 / Math.max(1e-6, Math.abs(this.curv[i])));
    return m;
  }

  /** Largest |curvature| within `dist` metres ahead of sample i. */
  curvatureAhead(i: number, dist: number): number {
    const steps = Math.ceil(dist / (this.length / this.n));
    let m = 0;
    for (let k = 0; k <= steps; k += 2) m = Math.max(m, Math.abs(this.curv[this.wrap(i + k)]));
    return m;
  }

  /** Lap distances of the `count` straightest stretches, at least `gap` metres apart. */
  pickStraights(count: number, gap: number, avoid: number[] = []): number[] {
    const cand: { s: number; c: number }[] = [];
    for (let i = 0; i < this.n; i += 4) {
      let c = 0;
      for (let k = -8; k <= 8; k++) c = Math.max(c, Math.abs(this.curv[this.wrap(i + k)]));
      cand.push({ s: this.sAt[i], c });
    }
    cand.sort((a, b) => a.c - b.c);
    const out: number[] = [];
    const dist = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, this.length - d); };
    for (const k of cand) {
      if (out.length >= count) break;
      if (avoid.some((s) => dist(s, k.s) < 60)) continue;
      if (out.every((s) => dist(s, k.s) >= gap)) out.push(k.s);
    }
    return out.sort((a, b) => a - b);
  }
}
