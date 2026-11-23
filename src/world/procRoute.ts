import type { BiomePreset } from '../data/biomes';
import type { GridRouteSpec } from './gridRoute';
import { mulberry32 } from './PropFactory';

/**
 * Random city circuit: grow a simply-connected blob of grid cells and run the route around its perimeter.
 * Every perimeter is a closed, non-self-intersecting rectilinear loop, so it plugs straight into the grid route builder.
 */
export function generateGridRoute(seed: number, pitch = 76): GridRouteSpec {
  const rng = mulberry32(seed * 2654435761 + 17);
  for (let attempt = 0; attempt < 60; attempt++) {
    const W = 6, H = 5;
    const cells = new Set<string>();
    const key = (x: number, y: number) => `${x},${y}`;
    const has = (x: number, y: number) => cells.has(key(x, y));
    const sx = 1 + Math.floor(rng() * (W - 2)), sy = 1 + Math.floor(rng() * (H - 2));
    cells.add(key(sx, sy));
    const target = 11 + Math.floor(rng() * 8);
    let guard = 0;
    while (cells.size < target && guard++ < 600) {
      const arr = [...cells];
      const [bx, by] = arr[Math.floor(rng() * arr.length)].split(',').map(Number);
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)];
      const nx = bx + dx, ny = by + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || has(nx, ny)) continue;
      cells.add(key(nx, ny));
      if (!valid(cells, W, H)) cells.delete(key(nx, ny));
    }
    if (cells.size < 9) continue;
    const loop = perimeter(cells);
    if (!loop) continue;
    const n = loop.length;
    const edge = (i: number) => Math.abs(loop[(i + 1) % n][0] - loop[i][0]) + Math.abs(loop[(i + 1) % n][1] - loop[i][1]);
    // longest edge becomes the start straight
    let best = 0;
    for (let i = 1; i < n; i++) if (edge(i) > edge(best)) best = i;
    if (edge(best) < 2) continue;
    const rot = loop.slice(best).concat(loop.slice(0, best));
    const E = edge(best);
    const corners: [number, number, number][] = rot.map(([gx, gy]) => [gx, gy, 12]);
    // a plaza on a random corner away from the start edge's ends
    const plazaIdx = 2 + Math.floor(rng() * Math.max(1, n - 3));
    const plazas = plazaIdx < n ? [plazaIdx] : [];
    for (const p of plazas) corners[p][2] = 34;
    const r0 = corners[0][2];
    const startDist = E >= 3 ? 1.5 * pitch - r0 : 30;
    const drift: [number, number][] = [];
    const a = 1 + Math.floor(rng() * Math.max(1, Math.floor(n / 2) - 2));
    drift.push([a, Math.min(n - 1, a + 2 + Math.floor(rng() * 2))]);
    const b = Math.floor(n / 2) + 1 + Math.floor(rng() * Math.max(1, Math.floor(n / 2) - 3));
    if (b + 2 < n) drift.push([b, Math.min(n - 1, b + 2)]);
    return { pitch, corners, startDist, plazas, drift };
  }
  // extremely unlikely: fall back to a plain rectangle
  return { pitch, corners: [[0, 0, 12], [4, 0, 12], [4, 3, 12], [0, 3, 12]], startDist: 40, plazas: [], drift: [[1, 2]] };
}

function valid(cells: Set<string>, W: number, H: number): boolean {
  const has = (x: number, y: number) => cells.has(`${x},${y}`);
  // no pinch points: a 2x2 window with only a diagonal pair filled
  for (let x = -1; x < W; x++) for (let y = -1; y < H; y++) {
    const a = has(x, y), b = has(x + 1, y), c = has(x, y + 1), d = has(x + 1, y + 1);
    if ((a && d && !b && !c) || (b && c && !a && !d)) return false;
  }
  // no holes: every empty cell must reach the outside
  const seen = new Set<string>();
  const stack: [number, number][] = [[-1, -1]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const k = `${x},${y}`;
    if (seen.has(k) || x < -1 || y < -1 || x > W || y > H || has(x, y)) continue;
    seen.add(k);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (!has(x, y) && !seen.has(`${x},${y}`)) return false;
  return true;
}

/** Corner nodes of the cell blob's perimeter, walked clockwise. */
function perimeter(cells: Set<string>): [number, number][] | null {
  const has = (x: number, y: number) => cells.has(`${x},${y}`);
  const next = new Map<string, [number, number]>();
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number);
    if (!has(x, y - 1)) next.set(`${x},${y}`, [x + 1, y]);
    if (!has(x + 1, y)) next.set(`${x + 1},${y}`, [x + 1, y + 1]);
    if (!has(x, y + 1)) next.set(`${x + 1},${y + 1}`, [x, y + 1]);
    if (!has(x - 1, y)) next.set(`${x},${y + 1}`, [x, y]);
  }
  const startKey = next.keys().next().value as string;
  const pts: [number, number][] = [];
  let cur = startKey.split(',').map(Number) as [number, number];
  const start = cur;
  let guard = 0;
  do {
    pts.push(cur);
    const nx = next.get(`${cur[0]},${cur[1]}`);
    if (!nx) return null;
    cur = nx;
  } while ((cur[0] !== start[0] || cur[1] !== start[1]) && guard++ < 400);
  if (guard >= 400) return null;
  // keep only the corners (direction changes)
  const corners: [number, number][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    if ((c[0] - p[0]) * (q[1] - c[1]) - (c[1] - p[1]) * (q[0] - c[0]) !== 0) corners.push(c);
  }
  return corners.length >= 4 ? corners : null;
}

/** The preset with its route replaced by a seeded random one (city biomes only). */
export function withProceduralRoute(preset: BiomePreset, seed: number): BiomePreset {
  if (!preset.route) return preset;
  return { ...preset, route: generateGridRoute(seed, preset.route.pitch), trackShape: { ...preset.trackShape, seed: (seed % 997) + 3 } };
}
