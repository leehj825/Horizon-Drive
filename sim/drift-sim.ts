import { BIOME_PRESETS } from '../src/data/biomes';
import { Track } from '../src/world/track';
import { CarController } from '../src/vehicle/CarController';
import { AIDriver } from '../src/race/AIDriver';

// Drive a bot around the open-road canyon (long corners) and force handbrake drifts at corners: chain + mini-turbo should fire.
const track = new Track(BIOME_PRESETS.red_canyon);
const ev: string[] = [];
const car = new CarController(track, undefined, undefined, null, {
  onDriftScore: (p, m) => ev.push(`score ${p} x${m.toFixed(1)}`),
  onMiniTurbo: (t) => ev.push(`turbo T${t}`),
});
const ai = new AIDriver(1, 0);
car.placeOnTrack(track.length - 8, 0);
const DT = 1 / 120;
let t = 0;
while (t < 60) {
  const c = ai.update(car, DT);
  const curved = Math.abs(track.curv[car.tq.idx]) > 0.006 && car.speed > 20;
  c.handbrake = curved;
  car.update(DT, c, null);
  t += DT;
}
console.log(ev.slice(0, 12).join(' | '), '\nchain now', car.chain, 'driftScore', car.driftScore, 'perfect', car.perfectDrifts, 'events', ev.length);
if (!ev.some((e) => e.startsWith('turbo'))) { console.error('expected a mini turbo'); process.exit(1); }
