import * as THREE from 'three';
import type { CarController } from '../vehicle/CarController';
import { mulberry32 } from './PropFactory';
import type { Track } from './track';

export type TrainState = 'idle' | 'warning' | 'passing';

const SPEED = 26;
const WAGONS = 6;
const WAGON_LEN = 12.2;
const TRAIN_LEN = (WAGONS + 1) * WAGON_LEN;
const COLORS = [0xb8442f, 0x2f6fb8, 0x3f9a5a, 0xd69a2a, 0x8a8f99, 0x7a3a8a];

/**
 * A freight train that crosses a street at the harbor on a timer: lights and barrier arms warn first, then the train
 * sweeps through. It is solid: cars that are on the crossing get thrown back and crash.
 */
export class TrainCrossing {
  readonly group = new THREE.Group();
  state: TrainState = 'idle';
  /** Crossing position (road centre) and axes. */
  readonly px: number; readonly pz: number;
  readonly tx: number; readonly tz: number; // along the road
  readonly cx: number; readonly cz: number; // along the rails
  private clock: number;
  private head = -1e9; // train head position along the rails
  private readonly reach: number;
  private readonly period: number;
  private arms: THREE.Object3D[] = [];
  private armAngle = 1.35;
  private lampMats: THREE.MeshBasicMaterial[] = [];
  private train = new THREE.Group();
  private dispose_: { dispose(): void }[] = [];
  private cool = new WeakMap<CarController, number>();
  onWarning: (() => void) | null = null;
  onHit: ((car: CarController, speed: number) => void) | null = null;
  private warned = false;

  constructor(readonly track: Track, readonly s: number, seed = 1) {
    const rng = mulberry32(seed * 977 + 5);
    const i = track.indexAt(s);
    this.px = track.px[i]; this.pz = track.pz[i];
    this.tx = track.tx[i]; this.tz = track.tz[i];
    this.cx = track.nx(i); this.cz = track.nz(i);
    const W = track.halfWidth + track.shoulder;
    this.reach = W + 58;
    const travel = (2 * this.reach + TRAIN_LEN) / SPEED;
    this.period = 26 + travel + 12;
    this.clock = 4 + rng() * 14;
    const own = <T extends { dispose(): void }>(d: T): T => { this.dispose_.push(d); return d; };
    const heading = Math.atan2(this.tx, this.tz);

    // rails + ballast across the whole street
    const ballast = new THREE.Mesh(own(new THREE.PlaneGeometry(6.4, 2 * this.reach + 40)), own(new THREE.MeshStandardMaterial({ color: 0x3a3733, roughness: 1 })));
    ballast.rotation.x = -Math.PI / 2; ballast.rotation.z = 0;
    const rails = new THREE.Group();
    rails.position.set(this.px, 0.045, this.pz);
    rails.rotation.y = heading + Math.PI / 2; // local z -> along the rails
    ballast.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    rails.add(ballast);
    const railGeo = own(new THREE.BoxGeometry(0.16, 0.12, 2 * this.reach + 40));
    const railMat = own(new THREE.MeshBasicMaterial({ color: 0x9aa0aa }));
    for (const ox of [-0.72, 0.72]) { const r = new THREE.Mesh(railGeo, railMat); r.position.set(ox, 0.06, 0); rails.add(r); }
    const tieGeo = own(new THREE.BoxGeometry(2.4, 0.08, 0.35));
    const tieMat = own(new THREE.MeshBasicMaterial({ color: 0x2a2520 }));
    for (let u = -this.reach - 18; u <= this.reach + 18; u += 1.6) { const t = new THREE.Mesh(tieGeo, tieMat); t.position.set(0, 0.04, u); rails.add(t); }
    this.group.add(rails);

    // barrier arms + warning lamps on both sides of the crossing, across the road
    const hw = track.halfWidth;
    const armMat = own(new THREE.MeshStandardMaterial({ color: 0xd8382e, emissive: 0x330806, flatShading: true }));
    const stripeMat = own(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, flatShading: true }));
    const postMat = own(new THREE.MeshStandardMaterial({ color: 0x2a2f3a, flatShading: true }));
    for (const dir of [-1, 1]) {
      const base = new THREE.Group();
      const p = track.pointAt(s + dir * 6, -hw + 0.2);
      base.position.set(p.x, 0, p.z);
      base.rotation.y = heading;
      const post = new THREE.Mesh(own(new THREE.BoxGeometry(0.5, 1.4, 0.5)), postMat); post.position.y = 0.7; base.add(post);
      const pivot = new THREE.Group(); pivot.position.y = 1.2; pivot.rotation.z = this.armAngle;
      const arm = new THREE.Mesh(own(new THREE.BoxGeometry(2 * hw + 0.2, 0.22, 0.22)), armMat); arm.position.x = hw; pivot.add(arm);
      for (let k = 0; k < 6; k++) { const st = new THREE.Mesh(own(new THREE.BoxGeometry(1.2, 0.24, 0.24)), stripeMat); st.position.x = 1 + k * (2 * hw / 6) ; pivot.add(st); }
      base.add(pivot);
      this.arms.push(pivot);
      const lampMat = own(new THREE.MeshBasicMaterial({ color: 0x401010 }));
      this.lampMats.push(lampMat);
      const lamp = new THREE.Mesh(own(new THREE.BoxGeometry(0.5, 0.5, 0.2)), lampMat); lamp.position.set(0, 2.1, 0); base.add(lamp);
      const mast = new THREE.Mesh(own(new THREE.BoxGeometry(0.2, 1.4, 0.2)), postMat); mast.position.y = 1.7; base.add(mast);
      this.group.add(base);
    }

    // the train: a loco + wagons laid out along local +z (travel direction set per run)
    const locoMat = own(new THREE.MeshStandardMaterial({ color: 0x8a1f1f, flatShading: true }));
    const dark = own(new THREE.MeshStandardMaterial({ color: 0x1e2128, flatShading: true }));
    const loco = new THREE.Mesh(own(new THREE.BoxGeometry(3.2, 3.6, WAGON_LEN - 0.6)), locoMat); loco.position.set(0, 2.4, -WAGON_LEN * 0.0); loco.castShadow = true;
    this.train.add(loco);
    const cab = new THREE.Mesh(own(new THREE.BoxGeometry(2.6, 1.4, 3)), dark); cab.position.set(0, 4.5, 3.4); this.train.add(cab);
    const lampHead = new THREE.Mesh(own(new THREE.BoxGeometry(1.2, 0.6, 0.2)), own(new THREE.MeshBasicMaterial({ color: 0xfff2b0 }))); lampHead.position.set(0, 2.6, WAGON_LEN / 2 - 0.2); this.train.add(lampHead);
    for (let w = 0; w < WAGONS; w++) {
      const m = own(new THREE.MeshStandardMaterial({ color: COLORS[w % COLORS.length], flatShading: true }));
      const wag = new THREE.Mesh(own(new THREE.BoxGeometry(3.1, 3.4, WAGON_LEN - 0.8)), m);
      wag.position.set(0, 2.3, -(w + 1) * WAGON_LEN); wag.castShadow = true;
      this.train.add(wag);
      const under = new THREE.Mesh(own(new THREE.BoxGeometry(2.6, 0.5, WAGON_LEN - 2)), dark); under.position.set(0, 0.45, -(w + 1) * WAGON_LEN); this.train.add(under);
    }
    this.train.visible = false;
    this.group.add(this.train);
  }

  private travelTime(): number { return (2 * this.reach + TRAIN_LEN) / SPEED; }

  update(dt: number, time: number): void {
    this.clock += dt;
    const t = this.clock % this.period;
    const travel = this.travelTime();
    let st: TrainState = 'idle';
    if (t >= 20 && t < 24) st = 'warning';
    else if (t >= 24 && t < 24 + travel) st = 'passing';
    if (st === 'warning' && !this.warned) { this.warned = true; this.onWarning?.(); }
    if (st === 'idle') this.warned = false;
    this.state = st;
    // train position along the rails (from one side to the other)
    if (st === 'passing') {
      const u = (t - 24) * SPEED;
      this.head = -this.reach - 20 + u; // head coordinate along +rails direction
      this.train.visible = true;
      // the train group origin is its head; travel along +(cx,cz)
      this.train.position.set(this.px + this.cx * this.head, 0.05, this.pz + this.cz * this.head);
      this.train.rotation.y = Math.atan2(this.cx, this.cz);
    } else this.train.visible = false;
    // arms: down while warning or the train is on the road
    const clear = st === 'passing' && this.head - TRAIN_LEN > this.track.halfWidth + 6;
    const down = (st === 'warning' || (st === 'passing' && !clear));
    const target = down ? 0 : 1.35;
    this.armAngle += (target - this.armAngle) * Math.min(1, dt * 3);
    for (const a of this.arms) a.rotation.z = this.armAngle;
    // lamps flash alternately while active
    const on = st !== 'idle' && Math.sin(time * 9) > 0;
    this.lampMats[0]?.color.setHex(st !== 'idle' ? (on ? 0xff2a2a : 0x401010) : 0x401010);
    this.lampMats[1]?.color.setHex(st !== 'idle' ? (on ? 0x401010 : 0xff2a2a) : 0x401010);
  }

  /** Solid train: throw back every car that is on the crossing while the train passes. */
  collide(cars: readonly CarController[], dt: number): void {
    if (this.state !== 'passing') return;
    const lo = this.head - TRAIN_LEN - 1.4, hi = this.head + WAGON_LEN * 0.5 + 1.0;
    for (const c of cars) {
      const dx = c.position.x - this.px, dz = c.position.z - this.pz;
      const a = dx * this.cx + dz * this.cz; // along the rails
      const b = dx * this.tx + dz * this.tz; // along the road
      if (Math.abs(b) > 3.6 || a < lo || a > hi) continue;
      const side = b >= 0 ? 1 : -1;
      c.position.x += this.tx * side * (3.7 - Math.abs(b));
      c.position.z += this.tz * side * (3.7 - Math.abs(b));
      const vb = c.vx * this.tx + c.vz * this.tz;
      if (vb * side < 0) { // moving into the train: kill the speed
        const speed = Math.abs(vb);
        c.vx -= this.tx * vb * 1.15; c.vz -= this.tz * vb * 1.15;
        c.vx *= 0.5; c.vz *= 0.5;
        const last = this.cool.get(c) ?? -9;
        if (this.clock - last > 1.2 && speed > 3) {
          this.cool.set(c, this.clock);
          c.hurt(Math.min(0.4, speed * 0.015));
          c.stunT = Math.max(c.stunT, 1.3);
          this.onHit?.(c, speed);
        }
      }
    }
    void dt;
  }

  /** Speed limit (m/s) a driver should respect on approach to the crossing right now. */
  limitFor(car: CarController): number {
    if (this.state === 'idle') return Infinity;
    const dx = this.px - car.position.x, dz = this.pz - car.position.z;
    const f = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const lat = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
    if (f < 4 || f > 70 || lat > 14) return Infinity;
    return Math.max(0, (f - 11) * 0.6);
  }

  dispose(): void {
    for (const d of this.dispose_) d.dispose();
    this.group.removeFromParent();
  }
}
