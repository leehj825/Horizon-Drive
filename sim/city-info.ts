import { BIOME_PRESETS } from '../src/data/biomes';
import { Track } from '../src/world/track';
const t = new Track(BIOME_PRESETS.neon_street);
console.log('L', t.length.toFixed(0), 'crossings s:', t.crossings.map((s) => s.toFixed(0)).join(' '));
console.log('corners s:', t.cornerS.map((s) => s.toFixed(0)).join(' '));
console.log('drift zones:', t.driftZones.map(([a, b]) => `${(a * t.length).toFixed(0)}-${(b * t.length).toFixed(0)}`).join(', '));
console.log('bounds', JSON.stringify(t.city!.bounds));
