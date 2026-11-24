import { BIOME_PRESETS } from '../src/data/biomes';
import { Track } from '../src/world/track';
import { findAlleys } from '../src/world/alleys';
import { CarController } from '../src/vehicle/CarController';

let failed = false;
// Which alleys exist on each city biome, and does driving through one behave (no teleport, no off-road, progress gain)?
for (const id of ['neon_street', 'harbor_docks', 'downtown_day'] as const) {
  const track = new Track(BIOME_PRESETS[id]);
  const alleys = findAlleys(track);
  track.setAlleys(alleys);
  if (!alleys.length) { console.error(id, 'has no alley'); failed = true; }
  console.log(id.padEnd(13), 'L', track.length.toFixed(0), 'alleys', alleys.map((a) => `s${a.sA.toFixed(0)}->s${a.sB.toFixed(0)} gain ${a.gain.toFixed(0)}`).join(' | ') || 'none');
  for (const a of alleys) {
    const car = new CarController(track);
    car.placeOnTrack(a.sA - 25, 0);
    // drive: straight to the alley mouth, turn into it, run its length, turn back onto street B.
    const DT = 1 / 120;
    let t = 0, maxJump = 0, off = 0, minProg = 1e9, prev = car.position.clone();
    const startProg = car.progress;
    while (t < 22) {
      const dx = a.bx - car.position.x, dz = a.bz - car.position.z;
      const co = { throttle: 1, steer: 0, handbrake: false, nitro: false };
      const fwd = (x: number, z: number) => Math.atan2(x, z);
      // aim: until the car is past the street A centreline-lat of 5m go along the road; then aim at B
      const along = (car.position.x - a.ax) * a.px + (car.position.z - a.az) * a.pz; // along the street (v)
      const target = along < -0.5 ? { x: a.ax - a.px * -0.0, z: a.az } : { x: a.bx, z: a.bz };
      let desired: number;
      if (along < -0.5) { // still before the mouth: drive along the street's tangent
        desired = Math.atan2(track.tx[a.iA], track.tz[a.iA]);
        if (Math.abs(desired - car.heading) > 3.2) desired = car.heading;
      } else desired = fwd(target.x - car.position.x, target.z - car.position.z);
      let err = desired - car.heading; err = Math.atan2(Math.sin(err), Math.cos(err));
      co.steer = Math.max(-1, Math.min(1, -err * 3));
      co.throttle = car.speed > 14 ? 0 : 1;
      car.update(DT, co, null);
      t += DT;
      maxJump = Math.max(maxJump, Math.hypot(car.position.x - prev.x, car.position.z - prev.z));
      prev.copy(car.position);
      if (car.offroad) off += DT;
      minProg = Math.min(minProg, car.progress);
      if (Math.hypot(dx, dz) < 4) break;
    }
    if (maxJump > 2 || car.progress - startProg < a.gain * 0.9 || Math.hypot(a.bx - car.position.x, a.bz - car.position.z) > 6) { console.error('   alley physics failed', a.sA); failed = true; }
    console.log('   alley', a.sA.toFixed(0), '-> reached B:', Math.hypot(a.bx - car.position.x, a.bz - car.position.z) < 6, '| progress gained', (car.progress - startProg).toFixed(0), 'of', a.gain.toFixed(0) + '+25 expected', '| max step', maxJump.toFixed(2), 'm | offroad', off.toFixed(2), 's | wall hits', car.wallHits);
  }
}

if (failed) process.exit(1);
