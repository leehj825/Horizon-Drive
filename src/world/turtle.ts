/**
 * "Turtle" track layouts: a closed circuit described as straights and arcs (racing-line style), with two straights
 * whose lengths are solved so the loop closes exactly. Gives real race-track geometry (long straights, hairpins,
 * chicanes, sweepers) instead of a wobbly blob.
 */
export type TurtleSeg = ['S', number] | ['A', number, number]; // straight length | arc (degrees, + = left; radius)

export interface TurtleSpec {
  segs: TurtleSeg[];
  /** Indices of two straights whose lengths are solved for closure (the numbers in `segs` are only starting guesses). Chosen automatically when omitted. */
  free?: [number, number];
}

export interface TurtleResult {
  points: { x: number; z: number }[];
  length: number;
  /** Solved lengths of the two free straights. */
  solved: [number, number];
}

const DEG = Math.PI / 180;

function walk(segs: TurtleSeg[], lens: Map<number, number>, spacing: number, emit: (x: number, z: number) => void): { x: number; z: number; th: number; length: number } {
  let x = 0, z = 0, th = 0, length = 0;
  emit(x, z);
  segs.forEach((seg, k) => {
    if (seg[0] === 'S') {
      const len = lens.get(k) ?? seg[1];
      const n = Math.max(1, Math.ceil(len / spacing));
      for (let i = 1; i <= n; i++) emit(x + Math.cos(th) * (len * i) / n, z + Math.sin(th) * (len * i) / n);
      x += Math.cos(th) * len; z += Math.sin(th) * len; length += len;
    } else {
      const [, deg, r] = seg;
      const a = deg * DEG;
      const n = Math.max(2, Math.ceil((Math.abs(a) * r) / spacing));
      // centre is to the left (+) or right (-) of the heading
      const side = a >= 0 ? 1 : -1;
      const cx = x - Math.sin(th) * r * side, cz = z + Math.cos(th) * r * side;
      const a0 = Math.atan2(z - cz, x - cx);
      for (let i = 1; i <= n; i++) {
        const ang = a0 + (a * i) / n;
        emit(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r);
      }
      const aEnd = a0 + a;
      x = cx + Math.cos(aEnd) * r; z = cz + Math.sin(aEnd) * r; th += a; length += Math.abs(a) * r;
    }
  });
  return { x, z, th, length };
}

/** Heading at the start of segment k. */
function headingAt(segs: TurtleSeg[], k: number): number {
  let th = 0;
  for (let i = 0; i < k; i++) if (segs[i][0] === 'A') th += (segs[i] as ['A', number, number])[1] * DEG;
  return th;
}

function solveClosure(segs: TurtleSeg[], ia: number, ib: number, spacing: number): [number, number] | null {
  const zero = new Map<number, number>([[ia, 0], [ib, 0]]);
  const end = walk(segs, zero, spacing, () => undefined);
  const ha = headingAt(segs, ia), hb = headingAt(segs, ib);
  const dax = Math.cos(ha), daz = Math.sin(ha), dbx = Math.cos(hb), dbz = Math.sin(hb);
  const det = dax * dbz - daz * dbx;
  if (Math.abs(det) < 0.25) return null;
  return [(-end.x * dbz + end.z * dbx) / det, (-dax * end.z + daz * end.x) / det];
}

export function buildTurtle(spec: TurtleSpec, spacing = 8): TurtleResult {
  const segs = spec.segs;
  const turn = segs.reduce((t, s) => t + (s[0] === 'A' ? s[1] : 0), 0);
  if (Math.abs(Math.abs(turn) - 360) > 0.01) throw new Error(`turtle layout must turn exactly 360 degrees (got ${turn})`);
  let ia: number, ib: number, a: number, b: number;
  if (spec.free) {
    [ia, ib] = spec.free;
    const sol = solveClosure(segs, ia, ib, spacing);
    if (!sol || sol[0] < 5 || sol[1] < 0) throw new Error(`layout does not close with positive straights (${sol?.map((v) => v.toFixed(0)).join('/')})`);
    [a, b] = sol;
  } else {
    // try every pair of straights; keep the closure with the most balanced, positive lengths
    let best: { ia: number; ib: number; a: number; b: number; score: number } | null = null;
    const idx = segs.map((s, i) => (s[0] === 'S' ? i : -1)).filter((i) => i >= 0);
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
      const sol = solveClosure(segs, idx[x], idx[y], spacing);
      if (!sol || sol[0] < 20 || sol[1] < 20 || sol[0] > 650 || sol[1] > 650) continue;
      const score = Math.min(sol[0], sol[1]);
      if (!best || score > best.score) best = { ia: idx[x], ib: idx[y], a: sol[0], b: sol[1], score };
    }
    if (!best) throw new Error('layout does not close with positive straights');
    ({ ia, ib, a, b } = best);
  }
  const lens = new Map<number, number>([[ia, a], [ib, b]]);
  let points: { x: number; z: number }[] = [];
  const res = walk(segs, lens, spacing, (x, z) => points.push({ x, z }));
  points.pop(); // the loop closes onto the first point
  // start/finish line in the middle of the longest straight
  let longest = -1, longestLen = 0, acc = 0, startAt = 0;
  const startOf: number[] = [];
  segs.forEach((sg, k) => {
    startOf[k] = acc;
    const len = sg[0] === 'S' ? lens.get(k) ?? sg[1] : Math.abs(sg[1] * DEG) * sg[2];
    if (sg[0] === 'S' && len > longestLen) { longestLen = len; longest = k; startAt = acc + len / 2; }
    acc += len;
  });
  void longest;
  const n = points.length;
  const shift = Math.round((startAt / res.length) * n) % n;
  points = points.slice(shift).concat(points.slice(0, shift));
  // centre the layout on the origin
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length, cz = points.reduce((s, p) => s + p.z, 0) / points.length;
  for (const p of points) { p.x -= cx; p.z -= cz; }
  return { points, length: res.length, solved: [a, b] };
}
