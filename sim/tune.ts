import { BIOME_PRESETS, type BiomeId } from '../src/data/biomes';
import { Track } from '../src/world/track';
const targets: Record<BiomeId, [number, number]> = { neon_street: [1500, 28], red_canyon: [2000, 55], coast_highway: [2600, 60], alpine_pass: [1900, 35] };
for (const id of Object.keys(targets) as BiomeId[]) {
  const p = structuredClone(BIOME_PRESETS[id]);
  const [L, R] = targets[id];
  let best: any = null;
  for (let am = 0.6; am <= 3.2; am += 0.1) for (let rad = 150; rad <= 340; rad += 10) {
    const q = structuredClone(p);
    q.trackShape.radius = rad;
    q.trackShape.harmonics = q.trackShape.harmonics.map(([f, a, ph]) => [f, a * am, ph]) as any;
    const t = new Track(q, 600);
    const score = Math.abs(t.length - L) / L + Math.abs(t.minRadius() - R) / R;
    if (!best || score < best.score) best = { score, am, rad, len: t.length, mr: t.minRadius() };
  }
  console.log(id, best);
}
