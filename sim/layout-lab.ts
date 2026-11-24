import { writeFileSync } from 'node:fs';
import { buildTurtle, type TurtleSpec } from '../src/world/turtle';

// Candidate layouts: print metrics and dump points for plotting.
const L = (a: number): ['A', number, number] => ['A', a, 0]; void L;
const specs: Record<string, TurtleSpec> = {
  highway: { segs: [['S', 700], ['A', 9, 520], ['S', 220], ['A', -9, 520], ['S', 200], ['A', -90, 170], ['S', 40], ['A', -90, 170], ['S', 700], ['A', -8, 520], ['S', 220], ['A', 8, 520], ['S', 200], ['A', -90, 170], ['S', 40], ['A', -90, 170]], free: [0, 6] },
  circuit: { segs: [['S', 600], ['A', -90, 70], ['S', 140], ['A', 55, 55], ['S', 28], ['A', -55, 55], ['S', 150], ['A', -135, 42], ['S', 110], ['A', 70, 85], ['S', 50], ['A', -45, 95], ['S', 190], ['A', -180, 24], ['S', 230], ['A', 20, 200]], free: [0, 12] },
  switchback: { segs: [['S', 260], ['A', -180, 26], ['S', 240], ['A', 180, 26], ['S', 240], ['A', -180, 26], ['S', 240], ['A', 180, 26], ['S', 200], ['A', -90, 70], ['S', 60], ['A', -90, 70], ['S', 100], ['A', -90, 70], ['S', 100], ['A', -90, 70]], free: [0, 12] },
  rally: { segs: [['S', 300], ['A', -50, 90], ['S', 60], ['A', 65, 70], ['S', 40], ['A', -80, 60], ['S', 120], ['A', 40, 120], ['S', 80], ['A', -150, 32], ['S', 160], ['A', 55, 80], ['S', 50], ['A', -70, 75], ['S', 140], ['A', -120, 55], ['S', 90], ['A', 60, 100], ['S', 100], ['A', -60, 110], ['S', 200]], free: [0, 18] },
};
const out: Record<string, { x: number; z: number }[]> = {};
for (const [name, spec] of Object.entries(specs)) {
  try {
    const r = buildTurtle(spec);
    // self-proximity of far-apart parts
    let gap = Infinity;
    const pts = r.points;
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const total = cum[cum.length - 1] + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
    for (let i = 0; i < pts.length; i += 2) for (let j = i + 1; j < pts.length; j += 2) {
      const d = Math.min(cum[j] - cum[i], total - (cum[j] - cum[i]));
      if (d < 120) continue;
      gap = Math.min(gap, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
    }
    console.log(name.padEnd(11), 'length', r.length.toFixed(0), 'free', r.solved.map((v) => v.toFixed(0)).join('/'), 'closest approach', gap.toFixed(0));
    out[name] = pts;
  } catch (e) { console.log(name.padEnd(11), 'ERR', (e as Error).message); }
}
writeFileSync(process.argv[2] ?? '/tmp/claude-0/layouts.json', JSON.stringify(out));
