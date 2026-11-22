/** City-grid circuit: a closed rectilinear route over a street grid with rounded corners. */

export interface GridRouteSpec {
  /** Distance between street centre lines (m). */
  pitch: number;
  /** Corners in grid units [gx, gy] plus the fillet radius in metres. Axis-aligned segments only. */
  corners: [number, number, number][];
  /** Distance (m) from corner 0 along the first edge where the start/finish line sits. */
  startDist: number;
  /** Corner indices that get a plaza (a big sweeping corner around a square). */
  plazas: number[];
  /** Drift zones as inclusive corner index ranges. */
  drift: [number, number][];
}

export interface BuiltRoute {
  /** Uniformly spaced closed centre line. */
  points: { x: number; z: number }[];
  length: number;
  /** Where the route runs straight over a street it does not turn into. */
  crossings: { x: number; z: number }[];
  /** Arc midpoints per corner. */
  corners: { x: number; z: number; r: number; cx: number; cz: number; plaza: boolean }[];
  bounds: { minGx: number; maxGx: number; minGy: number; maxGy: number };
}

export function buildGridRoute(spec: GridRouteSpec, spacing = 1.5): BuiltRoute {
  const P = spec.pitch;
  const n = spec.corners.length;
  const nodes = spec.corners.map(([gx, gy]) => ({ x: gx * P, z: gy * P }));
  const dir = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    return { x: dx / l, z: dz / l, l };
  };
  const dense: { x: number; z: number }[] = [];
  const corners: BuiltRoute['corners'] = [];
  // dense index at which corner 0's exit tangent point sits (for the start offset)
  let startIdx = 0;
  for (let i = 0; i < n; i++) {
    const prev = nodes[(i - 1 + n) % n], cur = nodes[i], next = nodes[(i + 1) % n];
    const R = spec.corners[i][2];
    const a = dir(prev, cur), b = dir(cur, next);
    if (a.l < R + spec.corners[(i - 1 + n) % n][2] - 1e-6) throw new Error(`route edge ${i - 1}->${i} shorter than its fillets`);
    const t1 = { x: cur.x - a.x * R, z: cur.z - a.z * R };
    const c = { x: t1.x + b.x * R, z: t1.z + b.z * R };
    const a0 = Math.atan2(t1.z - c.z, t1.x - c.x);
    const cross = a.x * b.z - a.z * b.x; // sign of the turn
    const steps = Math.max(10, Math.round(R * 0.9));
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + (cross * (Math.PI / 2) * k) / steps;
      dense.push({ x: c.x + Math.cos(ang) * R, z: c.z + Math.sin(ang) * R });
    }
    if (i === 0) startIdx = dense.length - 1;
    const mx = c.x + ((a.x - b.x) * R) / Math.SQRT2 * 1, mz = c.z + ((a.z - b.z) * R) / Math.SQRT2 * 1;
    corners.push({ x: mx, z: mz, r: R, cx: c.x, cz: c.z, plaza: spec.plazas.includes(i) });
  }
  // cumulative length (closed)
  const cum: number[] = [0];
  for (let i = 1; i <= dense.length; i++) {
    const p = dense[i - 1], q = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(q.x - p.x, q.z - p.z));
  }
  const total = cum[dense.length];
  const count = Math.round(total / spacing);
  const s0 = cum[startIdx] + spec.startDist - spec.corners[0][2] * 0; // distance after corner 0's exit tangent
  const at = (s: number) => {
    s = ((s % total) + total) % total;
    // binary search
    let lo = 0, hi = dense.length;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const p = dense[lo], q = dense[(lo + 1) % dense.length];
    const f = (s - cum[lo]) / Math.max(1e-9, cum[lo + 1] - cum[lo]);
    return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f };
  };
  const points: { x: number; z: number }[] = [];
  for (let k = 0; k < count; k++) points.push(at(s0 + (total * k) / count));
  // crossings: interior grid nodes of straight edges
  const crossings: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const cur = nodes[i], next = nodes[(i + 1) % n];
    const d = dir(cur, next);
    const m = Math.round(d.l / P);
    for (let k = 1; k < m; k++) crossings.push({ x: cur.x + d.x * k * P, z: cur.z + d.z * k * P });
  }
  const gxs = spec.corners.map((c) => c[0]), gys = spec.corners.map((c) => c[1]);
  return {
    points, length: total, crossings, corners,
    bounds: { minGx: Math.min(...gxs), maxGx: Math.max(...gxs), minGy: Math.min(...gys), maxGy: Math.max(...gys) },
  };
}
