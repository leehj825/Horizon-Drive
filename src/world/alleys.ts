import type { Track } from './track';

/** An optional cut-through alley between two parallel streets of the city grid (Location Lv.4+). */
export interface Alley {
  /** Centre-line end points (the centres of the two streets). */
  ax: number; az: number; bx: number; bz: number;
  /** Unit direction A -> B and its left perpendicular. */
  dx: number; dz: number; px: number; pz: number;
  len: number;
  /** Half width of the alley. */
  hh: number;
  iA: number; iB: number;
  sA: number; sB: number;
  /** Side of street A the alley leaves from (+1 left of travel, -1 right) and the matching side at B. */
  sideA: number; sideB: number;
  /** Route distance skipped by taking the alley. */
  gain: number;
}

export const ALLEY_HALF_WIDTH = 3.7;

/**
 * Finds cut-throughs: places where the route runs along a street and, exactly one block away, along a parallel
 * street that it only reaches much later. The alley crosses the block at its centre, so it never collides with the
 * street furniture or the signalled junctions.
 */
export function findAlleys(track: Track): Alley[] {
  const city = track.city;
  if (!city) return [];
  const P = city.pitch, L = track.length, n = track.n;
  const cand: Alley[] = [];
  const plazaNear = (x: number, z: number) => city.corners.some((c) => c.plaza && Math.hypot(x - c.cx, z - c.cz) < c.r + 45);
  for (let i = 0; i < n; i += 2) {
    if (Math.abs(track.curv[i]) > 0.004) continue;
    const s = track.sAt[i];
    if (s < 90 || s > L - 90) continue;
    const horizontal = Math.abs(track.tz[i]) < 0.01, vertical = Math.abs(track.tx[i]) < 0.01;
    if (!horizontal && !vertical) continue;
    const along = horizontal ? track.px[i] : track.pz[i];
    const frac = along / P - Math.floor(along / P);
    if (Math.abs(frac - 0.5) > 0.012) continue; // only through the middle of a block
    for (const side of [-1, 1]) {
      const tx = track.px[i] + track.nx(i) * side * P, tz = track.pz[i] + track.nz(i) * side * P;
      const q = track.query(tx, tz, -1);
      const j = q.idx;
      if (Math.hypot(track.px[j] - tx, track.pz[j] - tz) > 1.5) continue;
      if (Math.abs(track.curv[j]) > 0.004) continue;
      if (Math.abs(track.tx[i] * track.tx[j] + track.tz[i] * track.tz[j]) < 0.98) continue;
      const gain = (track.sAt[j] - track.sAt[i] + L) % L;
      if (gain < 120 || gain > 0.45 * L) continue;
      const sj = track.sAt[j];
      if (sj < 90 || sj > L - 90) continue;
      const mx = (track.px[i] + tx) / 2, mz = (track.pz[i] + tz) / 2;
      if (plazaNear(mx, mz)) continue;
      const ux = track.nx(i) * side, uz = track.nz(i) * side;
      const sideB = Math.sign((track.px[i] - track.px[j]) * track.nx(j) + (track.pz[i] - track.pz[j]) * track.nz(j)) || 1;
      cand.push({
        ax: track.px[i], az: track.pz[i], bx: tx, bz: tz, dx: ux, dz: uz, px: -uz, pz: ux, len: P, hh: ALLEY_HALF_WIDTH,
        iA: i, iB: j, sA: s, sB: sj, sideA: side, sideB, gain,
      });
    }
  }
  cand.sort((a, b) => b.gain - a.gain);
  const out: Alley[] = [];
  const dist = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, L - d); };
  for (const c of cand) {
    if (out.length >= 2) break;
    if (out.every((o) => dist(o.sA, c.sA) > L / 5 && dist(o.sA, c.sB) > L / 6 && dist(o.sB, c.sA) > L / 6)) out.push(c);
  }
  return out.sort((a, b) => a.sA - b.sA);
}

/** Position of a point in alley coordinates: u along A->B, v across. */
export function alleyCoords(a: Alley, x: number, z: number): { u: number; v: number } {
  const rx = x - a.ax, rz = z - a.az;
  return { u: rx * a.dx + rz * a.dz, v: rx * a.px + rz * a.pz };
}
