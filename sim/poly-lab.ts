import { writeFileSync } from 'node:fs';
import { buildPolyRoute, type PolyVertex } from '../src/world/polyRoute';

const deg = Math.PI / 180;
// switchback pass: slanted parallel rows joined by hairpins, then a wide outside return
function switchback(): PolyVertex[] {
  const dx = Math.cos(-14 * deg), dz = Math.sin(-14 * deg);
  const nx = -dz, nz = dx;
  const rows = 5, len = 560, spacing = 112, R = 44;
  const v: PolyVertex[] = [];
  const W: number[][] = [], E: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const base = -i * spacing;
    const w = [-len / 2 * dx + base * nx, -len / 2 * dz + base * nz];
    const e = [len / 2 * dx + base * nx, len / 2 * dz + base * nz];
    W.push(w); E.push(e);
    if (i % 2 === 0) v.push([w[0], w[1], i === 0 ? 70 : R], [e[0], e[1], R]);
    else v.push([e[0], e[1], R], [w[0], w[1], R]);
  }
  // rows 0,2,4 run west->east; after row 4 (ends at its east end) sweep round the east side and back to row 0's start
  v.push([E[4][0] + 250, E[4][1] - 10, 130], [E[0][0] + 270, E[0][1] + 190, 150], [W[0][0] - 100, W[0][1] + 280, 90]);
  return v;
}

const specs: Record<string, PolyVertex[]> = {
  circuit: [[-450, 230, 95], [330, 230, 80], [520, 110, 60], [470, -60, 40], [560, -130, 40], [500, -260, 55], [250, -300, 50], [60, -170, 26], [-60, -300, 45], [-330, -250, 70], [-470, -90, 80]],
  highway: [[-480, -230, 190], [-160, -250, 900], [170, -205, 900], [480, -230, 190], [480, 230, 190], [170, 250, 900], [-160, 205, 900], [-480, 230, 190]],
  switchback: switchback(),
  rally: [[-440, 60, 70], [-330, 190, 55], [-150, 210, 60], [-30, 130, 45], [110, 190, 40], [250, 140, 50], [380, 190, 45], [470, 90, 38], [400, -10, 32], [470, -110, 36], [350, -210, 45], [220, -150, 40], [100, -240, 38], [-70, -190, 50], [-200, -270, 55], [-370, -190, 55], [-470, -70, 60]],
};
const out: Record<string, { x: number; z: number }[]> = {};
for (const [name, verts] of Object.entries(specs)) {
  try {
    const r = buildPolyRoute(verts);
    const pts = r.points;
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const total = cum[cum.length - 1];
    let gap = Infinity;
    for (let i = 0; i < pts.length; i += 3) for (let j = i + 1; j < pts.length; j += 3) {
      const d = Math.min(cum[j] - cum[i], total - (cum[j] - cum[i]));
      if (d < 140) continue;
      gap = Math.min(gap, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
    }
    console.log(name.padEnd(11), 'length', r.length.toFixed(0), 'closest approach', gap.toFixed(0));
    out[name] = pts;
  } catch (e) { console.log(name.padEnd(11), 'ERR', (e as Error).message); }
}
writeFileSync(process.argv[2], JSON.stringify(out));
