import { BIOME_ORDER, BIOME_PRESETS } from '../src/data/biomes';
import { Track } from '../src/world/track';

for (const id of BIOME_ORDER) {
  const p = BIOME_PRESETS[id];
  const t = new Track(p);
  console.log(id.padEnd(14), 'length', t.length.toFixed(0), 'm  minRadius', t.minRadius().toFixed(1), 'm  roadHalf+shoulder', (p.roadWidth / 2 + p.shoulder));
}

// self-proximity check: distance between road parts that are far apart along the lap
for (const id of BIOME_ORDER) {
  const p = BIOME_PRESETS[id];
  const t = new Track(p);
  let m = Infinity;
  for (let i = 0; i < t.n; i += 3) for (let j = 0; j < t.n; j += 3) {
    const ds = Math.abs(t.sAt[i] - t.sAt[j]);
    if (Math.min(ds, t.length - ds) < 150) continue;
    m = Math.min(m, Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]));
  }
  console.log(id.padEnd(14), 'closest approach of distant sections', m.toFixed(1), 'm (needs >', (2 * (p.roadWidth / 2 + p.shoulder) + 20), ')');
}
