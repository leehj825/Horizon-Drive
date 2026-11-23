import { BIOME_ORDER, BIOME_PRESETS } from '../src/data/biomes';
import { Track } from '../src/world/track';
import { CarController } from '../src/vehicle/CarController';
import { AIDriver } from '../src/race/AIDriver';
const DT = 1 / 120;
for (const id of BIOME_ORDER) {
  const track = new Track(BIOME_PRESETS[id]);
  const car = new CarController(track);
  const ai = new AIDriver(0.97, 0);
  car.placeOnTrack(track.length - 8, 0);
  const sp: number[] = [];
  let t = 0;
  while (t < 140 && car.lap < 3) { car.update(DT, ai.update(car, DT), null); t += DT; if (car.lap >= 1) sp.push(car.speed); }
  sp.sort((a, b) => a - b);
  const q = (f: number) => sp[Math.floor(sp.length * f)].toFixed(1);
  console.log(id.padEnd(14), 'p10', q(0.1), 'p20', q(0.2), 'p30', q(0.3), 'p40', q(0.4), 'p50', q(0.5), 'mean', (sp.reduce((a, b) => a + b, 0) / sp.length).toFixed(1));
}
