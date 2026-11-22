import { BIOME_ORDER, BIOME_PRESETS } from '../src/data/biomes';
import { Track } from '../src/world/track';
import { CarController } from '../src/vehicle/CarController';
import { AIDriver } from '../src/race/AIDriver';

const DT = 1 / 120;
for (const id of BIOME_ORDER) {
  const p = BIOME_PRESETS[id];
  const track = new Track(p);
  const car = new CarController(track);
  const ai = new AIDriver(1.0, 0);
  car.placeOnTrack(track.length - 8, 0);
  let t = 0, lastLapT = 0, maxLat = 0, offroadT = 0, vmax = 0;
  const laps: number[] = [];
  let prevLap = car.lap;
  while (t < 400 && car.lap < 3) {
    car.update(DT, ai.update(car, DT), null);
    t += DT;
    maxLat = Math.max(maxLat, Math.abs(car.tq.lat));
    if (car.offroad) offroadT += DT;
    vmax = Math.max(vmax, car.speed);
    if (car.lap !== prevLap) { prevLap = car.lap; laps.push(+(t - lastLapT).toFixed(1)); lastLapT = t; }
  }
  console.log(id.padEnd(14), 'laps', laps.join(' / '), '| total', t.toFixed(1), 's | maxLat', maxLat.toFixed(1), `(road ${p.roadWidth / 2}, wall ${p.roadWidth / 2 + p.shoulder})`, '| offroad', offroadT.toFixed(1), 's | wall hits', car.wallHits, '| vmax', (vmax * 3.6).toFixed(0), 'km/h', '| par', p.parTime);
}
