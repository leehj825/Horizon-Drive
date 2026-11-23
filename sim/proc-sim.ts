import { BIOME_PRESETS } from '../src/data/biomes';
import { Track } from '../src/world/track';
import { withProceduralRoute } from '../src/world/procRoute';
import { CarController } from '../src/vehicle/CarController';
import { AIDriver } from '../src/race/AIDriver';

let bad = 0;
const DT = 1 / 120;
for (let seed = 1; seed <= 40; seed++) {
  const base = BIOME_PRESETS[(['neon_street', 'harbor_docks', 'downtown_day'] as const)[seed % 3]];
  const preset = withProceduralRoute(base, seed);
  let track: Track;
  try { track = new Track(preset); } catch (e) { console.log('seed', seed, 'FAILED to build', (e as Error).message); bad++; continue; }
  // closest approach of distant sections (self-intersection check)
  let m = Infinity;
  for (let i = 0; i < track.n; i += 4) for (let j = 0; j < track.n; j += 4) {
    const ds = Math.abs(track.sAt[i] - track.sAt[j]);
    if (Math.min(ds, track.length - ds) < 120) continue;
    m = Math.min(m, Math.hypot(track.px[i] - track.px[j], track.pz[i] - track.pz[j]));
  }
  // a lap with the AI
  const car = new CarController(track);
  const ai = new AIDriver(0.97, 0);
  car.placeOnTrack(track.length - 8, 0);
  let t = 0, hits = 0;
  while (t < 360 && car.lap < 2) { car.update(DT, ai.update(car, DT), null); t += DT; }
  hits = car.wallHits;
  const ok = m > 2 * (track.halfWidth + track.shoulder) + 10 && car.lap >= 2 && hits <= 2;
  if (!ok) bad++;
  if (seed <= 8 || !ok) console.log('seed', String(seed).padStart(2), `L ${track.length.toFixed(0)} minR ${track.minRadius().toFixed(1)} gap ${m.toFixed(0)} laps ${car.lap} wall ${hits} crossings ${track.crossings.length} zones ${track.driftZones.length}`, ok ? '' : 'BAD');
}
console.log(bad ? `${bad} bad seeds` : 'all 40 procedural routes fine');
if (bad) process.exit(1);
