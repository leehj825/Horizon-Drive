import * as THREE from 'three';
import { BASE_STATS } from '../data/upgrades';
import { NO_MODS } from '../data/equipment';
import { CarController, type ControlState } from '../vehicle/CarController';
import { buildLiteCar, type CarModel, type LiteKind } from '../vehicle/CarMeshBuilder';
import type { Intersection, SignalState } from '../world/TrackBuilder';
import type { BiomeWorld } from '../world/BiomeLoader';
import { mulberry32 } from '../world/PropFactory';
import { AIDriver } from './AIDriver';

export interface TrafficCar {
  car: CarController;
  ai: AIDriver | null;
  kind: 'lane' | 'cross';
  wrecked: boolean;
  wreckT: number;
  cruise: number;
  nearCool: number;
  smokeAcc: number;
  /** Intersection index for cross traffic. */
  junction: number;
  dead: boolean;
  oncoming: boolean;
}

const BODY_COLORS = [0xd9dde6, 0x2c3a52, 0xb5342b, 0xe0b53a, 0x3b7a57, 0x6e6f78, 0x8a5a9e, 0x1f2430];
const KINDS: LiteKind[] = ['sedan', 'sedan', 'hatch', 'van', 'taxi'];
const WRECK_SPEED = 9;
const CYCLE = 12;

export interface TrafficEvents {
  onWreck?: (t: TrafficCar) => void;
  onNearMiss?: (t: TrafficCar) => void;
}

/** Civilian lane traffic + signal-controlled cross traffic. Cars are real CarControllers, so crashes feel physical. */
export class Traffic {
  readonly cars: TrafficCar[] = [];
  private rng: () => number;
  private phase: number[] = [];
  private lastState: SignalState[] = [];
  private spawned: boolean[] = [];
  /** Lane centres as a fraction of the half road width: right half with the flow, left half oncoming. */
  private lanes = [-0.62, -0.34];
  private lanesOncoming = [0.34, 0.62];
  events: TrafficEvents = {};

  constructor(private world: BiomeWorld, private parent: THREE.Object3D | null, private intersections: Intersection[]) {
    this.rng = mulberry32(world.preset.trackShape.seed * 31 + 7);
    const n = world.preset.traffic.cars;
    const L = world.track.length;
    const first = 130, last = L - 120;
    for (let k = 0; k < n; k++) {
      const s = first + ((last - first) * (k + 0.2 + this.rng() * 0.6)) / n;
      this.spawnLane(s, this.rng() < world.preset.traffic.oncoming);
    }
    intersections.forEach((_, i) => { this.phase.push(this.rng() * CYCLE); this.lastState.push('green'); this.spawned.push(false); void i; });
  }

  private model(kind: LiteKind, color: number): CarModel | null {
    if (!this.parent) return null;
    const m = buildLiteCar(kind, color);
    this.parent.add(m.root);
    return m;
  }

  private spawnLane(s: number, oncoming = false): TrafficCar {
    const w = this.world;
    const hw = w.track.halfWidth;
    const set = oncoming ? this.lanesOncoming : this.lanes;
    const lane = set[Math.floor(this.rng() * set.length)] * hw;
    const kind = KINDS[Math.floor(this.rng() * KINDS.length)];
    const color = kind === 'taxi' ? 0xf0c020 : BODY_COLORS[Math.floor(this.rng() * BODY_COLORS.length)];
    const car = new CarController(w.track, { ...BASE_STATS }, NO_MODS, this.model(kind, color));
    car.features = { ramps: [], pads: [] };
    car.placeOnTrack(s, lane);
    if (oncoming) car.heading += Math.PI;
    const skill = 0.27 + this.rng() * 0.2;
    const ai = new AIDriver(skill, lane);
    ai.avoid = 'brake';
    ai.reverse = oncoming;
    const t: TrafficCar = { car, ai, kind: 'lane', wrecked: false, wreckT: 0, cruise: skill * BASE_STATS.maxSpeed, nearCool: 0, smokeAcc: 0, junction: -1, dead: false, oncoming };
    this.cars.push(t);
    car.vx = Math.sin(car.heading) * t.cruise * 0.9; car.vz = Math.cos(car.heading) * t.cruise * 0.9;
    this.refreshOthers();
    return t;
  }

  private spawnCross(j: number): void {
    const it = this.intersections[j];
    const w = this.world;
    const side = this.rng() < 0.5 ? -1 : 1;
    const kind = KINDS[Math.floor(this.rng() * KINDS.length)];
    const color = kind === 'taxi' ? 0xf0c020 : BODY_COLORS[Math.floor(this.rng() * BODY_COLORS.length)];
    const car = new CarController(w.track, { ...BASE_STATS }, NO_MODS, this.model(kind, color));
    car.free = true;
    const reach = w.track.halfWidth + w.track.shoulder + 46;
    const lane = (this.rng() < 0.5 ? -1 : 1) * 2.4;
    // cross axis is the track's left normal (cx,cz); lane offset runs along the track direction
    const tx = Math.sin(it.heading), tz = Math.cos(it.heading);
    car.position.set(it.x + it.cx * side * reach + tx * lane, 0, it.z + it.cz * side * reach + tz * lane);
    car.heading = Math.atan2(-it.cx * side, -it.cz * side);
    const cruise = 12 + this.rng() * 5;
    car.vx = Math.sin(car.heading) * cruise; car.vz = Math.cos(car.heading) * cruise;
    this.cars.push({ car, ai: null, kind: 'cross', wrecked: false, wreckT: 0, cruise, nearCool: 0, smokeAcc: 0, junction: j, dead: false, oncoming: false });
  }

  /** All traffic bodies as plain cars (for avoidance / collisions). */
  bodies(): CarController[] { return this.cars.map((t) => t.car); }

  private refreshOthers(): void {
    const lane = this.cars.filter((t) => t.kind === 'lane').map((t) => t.car);
    for (const t of this.cars) if (t.ai) t.ai.others = lane;
  }

  /** A hit registered by the collision pass. */
  registerHit(car: CarController, closing: number): void {
    const t = this.cars.find((c) => c.car === car);
    if (!t || t.wrecked || closing < WRECK_SPEED) return;
    t.wrecked = true;
    t.wreckT = 0;
    t.car.hazard = true;
    t.car.extraRoll = (this.rng() < 0.5 ? -1 : 1) * 0.3;
    this.events.onWreck?.(t);
  }

  signalAt(j: number): SignalState { return this.lastState[j]; }

  update(dt: number, focus: CarController, emitSmoke: (x: number, y: number, z: number) => void): void {
    const L = this.world.track.length;
    // signals + cross traffic spawning
    for (let j = 0; j < this.intersections.length; j++) {
      this.phase[j] = (this.phase[j] + dt) % CYCLE;
      const p = this.phase[j];
      const st: SignalState = p < 5 ? 'green' : p < 6 ? 'amber' : 'red';
      if (st !== this.lastState[j]) { this.lastState[j] = st; this.intersections[j].setSignal(st); }
      if (st === 'red' && !this.spawned[j]) {
        this.spawned[j] = true;
        const n = 1 + (this.rng() < 0.55 ? 1 : 0);
        for (let k = 0; k < n; k++) this.spawnCross(j);
      }
      if (st === 'green') this.spawned[j] = false;
    }

    let respawn = 0;
    let respawnOncoming = 0;
    for (const t of this.cars) {
      const c = t.car;
      t.nearCool = Math.max(0, t.nearCool - dt);
      let ctl: ControlState;
      if (t.wrecked) {
        t.wreckT += dt;
        ctl = { throttle: -1, steer: 0, handbrake: true, nitro: false };
        t.smokeAcc += dt * 16;
        while (t.smokeAcc >= 1) { t.smokeAcc -= 1; emitSmoke(c.position.x + (Math.random() - 0.5), 0.9, c.position.z + (Math.random() - 0.5)); }
        if (t.wreckT > 22 && Math.hypot(c.position.x - focus.position.x, c.position.z - focus.position.z) > 70) { t.dead = true; if (t.kind === 'lane') { respawn++; if (t.oncoming) respawnOncoming++; } }
      } else if (t.ai) {
        ctl = t.ai.update(c, dt, 1);
      } else {
        // cross traffic: hold course at cruise speed
        ctl = { throttle: c.speed < t.cruise ? 1 : 0, steer: 0, handbrake: false, nitro: false };
        const it = this.intersections[t.junction];
        const u = (c.position.x - it.x) * it.cx + (c.position.z - it.z) * it.cz;
        const reach = this.world.track.halfWidth + this.world.track.shoulder + 50;
        if (Math.abs(u) > reach) t.dead = true;
      }
      c.update(dt, ctl, null);
    }
    this.nearMisses(focus);

    if (this.cars.some((t) => t.dead)) {
      for (const t of this.cars) if (t.dead) { t.car.model?.root.removeFromParent(); t.car.model?.dispose(); }
      this.cars.splice(0, this.cars.length, ...this.cars.filter((t) => !t.dead));
      // replace removed lane cars ahead of the player so the street never empties
      for (let k = 0; k < respawn; k++) {
        for (let tries = 0; tries < 8; tries++) {
          const s = ((focus.progress % L) + L + 150 + this.rng() * 250) % L;
          if (this.clearAt(s)) { this.spawnLane(s, k < respawnOncoming); break; }
        }
      }
      this.refreshOthers();
    }
  }

  private clearAt(s: number): boolean {
    const L = this.world.track.length;
    for (const t of this.cars) {
      if (t.kind !== 'lane') continue;
      const d = Math.abs(t.car.tq.s - s);
      if (Math.min(d, L - d) < 35) return false;
    }
    for (const it of this.intersections) { const d = Math.abs(it.s - s); if (Math.min(d, L - d) < 25) return false; }
    return s > 60 && s < L - 90;
  }

  /** Close passes at speed: bonus event (once per car per pass). */
  private nearMisses(player: CarController): void {
    if (player.speed < 22) return;
    const sh = Math.sin(player.heading), ch = Math.cos(player.heading);
    for (const t of this.cars) {
      if (t.nearCool > 0 || t.wrecked) continue;
      const dx = t.car.position.x - player.position.x, dz = t.car.position.z - player.position.z;
      const f = dx * sh + dz * ch, l = Math.abs(dx * ch - dz * sh);
      if (Math.abs(f) < 2.8 && l > 1.9 && l < 3.5) {
        const rel = Math.hypot(player.vx - t.car.vx, player.vz - t.car.vz);
        if (rel > 16) { t.nearCool = 2.5; this.events.onNearMiss?.(t); }
      }
    }
  }

  dispose(): void {
    for (const t of this.cars) { t.car.model?.root.removeFromParent(); t.car.model?.dispose(); }
    this.cars.length = 0;
  }
}

