import { writeFileSync } from 'node:fs';
import { buildTurtle, type TurtleSeg, type TurtleSpec } from '../src/world/turtle';
import { mulberry32 } from '../src/world/PropFactory';

type Kind = 'circuit' | 'switchback' | 'rally';
interface Rules { turns: [number, number]; hairpins: [number, number]; length: [number, number]; minGap: number; mainMin: number; radii: [number, number]; straight: [number, number]; chicane: boolean }
const RULES: Record<Kind, Rules> = {
  circuit: { turns: [9, 13], hairpins: [1, 2], length: [2300, 3200], minGap: 80, mainMin: 380, radii: [45, 190], straight: [20, 110], chicane: true },
  switchback: { turns: [10, 14], hairpins: [4, 7], length: [1700, 2500], minGap: 75, mainMin: 120, radii: [60, 120], straight: [30, 130], chicane: false },
  rally: { turns: [12, 17], hairpins: [2, 3], length: [1800, 2600], minGap: 75, mainMin: 150, radii: [45, 120], straight: [15, 90], chicane: false },
};

function metrics(spec: TurtleSpec) {
  const r = buildTurtle(spec);
  const pts = r.points;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const total = cum[cum.length - 1] + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
  let gap = Infinity;
  for (let i = 0; i < pts.length; i += 2) for (let j = i + 1; j < pts.length; j += 2) {
    const d = Math.min(cum[j] - cum[i], total - (cum[j] - cum[i]));
    if (d < 140) continue;
    gap = Math.min(gap, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
  }
  return { r, gap, total };
}

function candidate(kind: Kind, rng: () => number): TurtleSpec | null {
  const R = RULES[kind];
  const nTurns = R.turns[0] + Math.floor(rng() * (R.turns[1] - R.turns[0] + 1));
  const nHair = R.hairpins[0] + Math.floor(rng() * (R.hairpins[1] - R.hairpins[0] + 1));
  // angles: hairpins first, then fill with mixed turns so the sum is -360 (clockwise)
  const angles: { a: number; r: number }[] = [];
  let sign = rng() < 0.5 ? -1 : 1;
  for (let i = 0; i < nHair; i++) { angles.push({ a: (150 + Math.floor(rng() * 7) * 5) * (kind === 'switchback' ? sign : (rng() < 0.65 ? -1 : 1)), r: 22 + Math.floor(rng() * 8) }); if (kind === 'switchback') sign = -sign; }
  while (angles.length < nTurns) {
    const big = rng() < 0.3;
    const a = (big ? 70 + Math.floor(rng() * 5) * 10 : 15 + Math.floor(rng() * 11) * 5) * (rng() < 0.5 ? -1 : 1);
    const r = R.radii[0] + rng() * (R.radii[1] - R.radii[0]);
    angles.push({ a, r: Math.round(r) });
  }
  // shuffle (but keep switchback hairpins interleaved with others)
  for (let i = angles.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [angles[i], angles[j]] = [angles[j], angles[i]]; }
  // force the net turn to -360 by adjusting the last few non-hairpin turns
  let sum = angles.reduce((s, x) => s + x.a, 0);
  let guard = 0;
  while (Math.abs(sum + 360) > 0.001 && guard++ < 400) {
    const k = Math.floor(rng() * angles.length);
    if (Math.abs(angles[k].a) >= 140) continue;
    const need = -360 - sum;
    const step = Math.max(-25, Math.min(25, need)) ;
    const na = angles[k].a + Math.round(step / 5) * 5;
    if (Math.abs(na) < 10 || Math.abs(na) > 140) continue;
    sum += na - angles[k].a; angles[k].a = na;
  }
  if (Math.abs(sum + 360) > 0.001) return null;
  const segs: TurtleSeg[] = [];
  segs.push(['S', 200]);
  const turnIdx: number[] = [];
  angles.forEach((x, i) => {
    segs.push(['A', x.a, x.r]); turnIdx.push(segs.length - 1);
    const long = i === Math.floor(angles.length * 0.45) && R.mainMin > 300;
    segs.push(['S', long ? 220 : R.straight[0] + Math.floor(rng() * (R.straight[1] - R.straight[0]))]);
  });
  // free straights: the opening straight, and a later straight whose heading is roughly perpendicular
  let th = 0; const heads: number[] = [0];
  for (let i = 1; i < segs.length; i++) { if (segs[i - 1][0] === 'A') th += (segs[i - 1] as ['A', number, number])[1]; if (segs[i][0] === 'S') heads[i] = th; }
  const options: number[] = [];
  for (let i = 2; i < segs.length; i++) if (segs[i][0] === 'S' && heads[i] !== undefined) {
    const d = Math.abs(((heads[i] % 180) + 180) % 180 - 0);
    if (d > 50 && d < 130) options.push(i);
  }
  if (!options.length) return null;
  const free1 = options[Math.floor(rng() * options.length)];
  void free1; return { segs };
}

function score(kind: Kind, spec: TurtleSpec, m: ReturnType<typeof metrics>): number | null {
  const R = RULES[kind];
  if (m.total < R.length[0] || m.total > R.length[1]) return null;
  if (m.gap < R.minGap) return null;
  if (Math.max(m.r.solved[0], m.r.solved[1]) < R.mainMin) return null;
  if (kind === 'circuit') {
    // wants a chicane: two consecutive opposite turns separated by a short straight
    let chic = false;
    for (let i = 1; i < spec.segs.length - 2; i++) if (spec.segs[i][0] === 'A' && spec.segs[i + 2][0] === 'A' && spec.segs[i + 1][0] === 'S' && (spec.segs[i + 1] as ['S', number])[1] < 70 && Math.sign((spec.segs[i] as ['A', number, number])[1]) !== Math.sign((spec.segs[i + 2] as ['A', number, number])[1]) && Math.abs((spec.segs[i] as ['A', number, number])[1]) < 90) chic = true;
    if (!chic) return null;
  }
  return m.gap + (3000 - Math.abs(m.total - 2650)) / 50;
}

const kinds: Kind[] = ['circuit', 'switchback', 'rally'];
const best: Record<string, { spec: TurtleSpec; pts: { x: number; z: number }[]; len: number; gap: number }> = {};
for (const kind of kinds) {
  let top: { s: number; spec: TurtleSpec; m: ReturnType<typeof metrics> } | null = null;
  const rng = mulberry32(kind === 'circuit' ? 11 : kind === 'switchback' ? 23 : 37);
  const why: Record<string, number> = {};
  const bump = (k: string) => { why[k] = (why[k] ?? 0) + 1; };
  for (let it = 0; it < 30000; it++) {
    const spec = candidate(kind, rng);
    if (!spec) { bump('nocand'); continue; }
    let m: ReturnType<typeof metrics>;
    try { m = metrics(spec); } catch (e) { bump('build:' + (e as Error).message.slice(0, 28)); continue; }
    const s = score(kind, spec, m);
    if (s === null) { bump(m.total < RULES[kind].length[0] ? 'short' : m.total > RULES[kind].length[1] ? 'long' : m.gap < RULES[kind].minGap ? 'gap' : 'other'); continue; }
    if (!top || s > top.s) top = { s, spec, m };
  }
  console.log(kind, JSON.stringify(why));
  if (top) {
    best[kind] = { spec: top.spec, pts: top.m.r.points, len: top.m.total, gap: top.m.gap };
    console.log(kind.padEnd(11), 'length', top.m.total.toFixed(0), 'gap', top.m.gap.toFixed(0), 'free', top.m.r.solved.map((v) => v.toFixed(0)).join('/'));
    console.log('  spec =', JSON.stringify({ segs: top.spec.segs.map((s) => (s[0] === 'S' ? ['S', Math.round(s[1])] : s)), free: top.spec.free }));
  } else console.log(kind, 'no candidate found');
}
writeFileSync(process.argv[2] ?? '/tmp/claude-0/best.json', JSON.stringify(best));
