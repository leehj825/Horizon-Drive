/**
 * Layouts authored as a polygon with a corner radius per vertex: straights stay long and straight, every corner is a
 * clean arc. Used for the race circuit, highway, mountain switchbacks and the canyon run.
 */
export type PolyVertex = [number, number, number]; // x, z, corner radius (metres)

export interface PolyResult {
  /** Densely sampled closed centre line (straights too), rotated to start mid-way along the longest straight. */
  points: { x: number; z: number }[];
  length: number;
}

export function buildPolyRoute(verts: PolyVertex[], spacing = 6): PolyResult {
  const n = verts.length;
  const t: number[] = [], turns: number[] = [];
  const t1: { x: number; z: number }[] = [], t2: { x: number; z: number }[] = [], centre: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const [px, pz] = verts[(i - 1 + n) % n], [vx, vz, r] = verts[i], [nx, nz] = verts[(i + 1) % n];
    const ax = vx - px, az = vz - pz, bx = nx - vx, bz = nz - vz;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    const cross = ax * bz - az * bx, dot = ax * bx + az * bz;
    const th = Math.atan2(Math.abs(cross), dot);
    const sg = cross >= 0 ? 1 : -1;
    const ti = r * Math.tan(th / 2);
    turns.push(sg * th); t.push(ti);
    const u1x = ax / la, u1z = az / la, u2x = bx / lb, u2z = bz / lb;
    t1.push({ x: vx - u1x * ti, z: vz - u1z * ti });
    t2.push({ x: vx + u2x * ti, z: vz + u2z * ti });
    centre.push({ x: vx - u1x * ti + -u1z * sg * r, z: vz - u1z * ti + u1x * sg * r });
  }
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const edge = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (t[i] + t[(i + 1) % n] > edge - 1) throw new Error(`corner radii too large for edge ${i}->${(i + 1) % n}: need ${(t[i] + t[(i + 1) % n]).toFixed(0)} of ${edge.toFixed(0)}`);
  }
  const out: { x: number; z: number }[] = [];
  const straightAt: { startIdx: number; len: number }[] = [];
  for (let i = 0; i < n; i++) {
    // the straight arriving at corner i, from corner i-1's exit
    const from = t2[(i - 1 + n) % n], to = t1[i];
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.round(len / spacing));
    straightAt.push({ startIdx: out.length, len });
    for (let k = 0; k < steps; k++) out.push({ x: from.x + ((to.x - from.x) * k) / steps, z: from.z + ((to.z - from.z) * k) / steps });
    // the arc
    const r = verts[i][2], th = turns[i], c = centre[i];
    const a0 = Math.atan2(to.z - c.z, to.x - c.x);
    const asteps = Math.max(3, Math.ceil((Math.abs(th) * r) / spacing));
    for (let k = 0; k < asteps; k++) {
      const ang = a0 + (th * k) / asteps;
      out.push({ x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r });
    }
  }
  let length = 0;
  for (let i = 0; i < out.length; i++) length += Math.hypot(out[(i + 1) % out.length].x - out[i].x, out[(i + 1) % out.length].z - out[i].z);
  // start/finish: the middle of the longest straight
  let best = 0;
  for (let i = 1; i < n; i++) if (straightAt[i].len > straightAt[best].len) best = i;
  const startIdx = Math.min(out.length - 1, straightAt[best].startIdx + Math.round(straightAt[best].len / spacing / 2));
  const rot = out.slice(startIdx).concat(out.slice(0, startIdx));
  const cx0 = rot.reduce((s, p) => s + p.x, 0) / rot.length, cz0 = rot.reduce((s, p) => s + p.z, 0) / rot.length;
  for (const p of rot) { p.x -= cx0; p.z -= cz0; }
  return { points: rot, length };
}
