import type { PolyVertex } from '../world/polyRoute';

const deg = Math.PI / 180;

/**
 * Polygon layouts (x, z, corner radius in metres). Each is a simple closed polygon whose corners are rounded with
 * the given radius, so the road keeps real straights and clean arcs.
 */

/** Race circuit: 780 m start straight, a quick right, a chicane flick, a long sweeper, a hairpin notch. */
export const CIRCUIT: PolyVertex[] = [
  [-450, 230, 95], [330, 230, 80], [520, 110, 60], [470, -60, 40], [560, -130, 40], [500, -260, 55],
  [250, -300, 50], [60, -170, 26], [-60, -300, 45], [-330, -250, 70], [-470, -90, 80],
];

/** Highway: two long, gently kinked straights joined by wide sweeping turns. */
export const HIGHWAY: PolyVertex[] = [
  [-480, -230, 190], [-160, -250, 900], [170, -205, 900], [480, -230, 190],
  [480, 230, 190], [170, 250, 900], [-160, 205, 900], [-480, 230, 190],
];

/** Canyon run: a flowing rally stage of esses and kinks. */
export const RALLY: PolyVertex[] = [
  [-440, 60, 70], [-330, 190, 55], [-150, 210, 60], [-30, 130, 45], [110, 190, 40], [250, 140, 50], [380, 190, 45],
  [470, 90, 38], [400, -10, 32], [470, -110, 36], [350, -210, 45], [220, -150, 40], [100, -240, 38], [-70, -190, 50],
  [-200, -270, 55], [-370, -190, 55], [-470, -70, 60],
];

/** Mountain pass: slanted rows joined by tight hairpins, then a wide sweep back down. */
export function switchback(): PolyVertex[] {
  const dx = Math.cos(-14 * deg), dz = Math.sin(-14 * deg);
  const nx = -dz, nz = dx;
  const rows = 5, len = 250, spacing = 104, R = 42;
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
  v.push([E[4][0] + 200, E[4][1] - 10, 110], [E[0][0] + 220, E[0][1] + 150, 120], [W[0][0] - 80, W[0][1] + 230, 80]);
  return v;
}
