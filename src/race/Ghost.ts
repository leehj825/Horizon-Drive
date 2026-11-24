import * as THREE from 'three';
import { GHOST_HZ, type GhostData } from '../data/saveState';
import type { CarController } from '../vehicle/CarController';
import { buildCar, type CarModel } from '../vehicle/CarMeshBuilder';

/** Records the current lap and replays the best one as a translucent car. */
export class GhostRecorder {
  private frames: number[] = [];
  private acc = 0;
  lapTime = 0;
  reset(): void { this.frames = []; this.acc = 0; this.lapTime = 0; }
  step(dt: number, car: CarController): void {
    this.lapTime += dt;
    this.acc += dt;
    const period = 1 / GHOST_HZ;
    while (this.acc >= period) {
      this.acc -= period;
      this.frames.push(Math.round(car.position.x * 100) / 100, Math.round(car.position.z * 100) / 100, Math.round(car.heading * 1000) / 1000);
    }
  }
  finishLap(): GhostData { return { time: this.lapTime, frames: this.frames.slice() }; }
}

export class GhostPlayer {
  readonly model: CarModel;
  private clock = 0;
  active = false;
  constructor(readonly data: GhostData, parent: THREE.Object3D) {
    this.model = buildCar({ color: 0x19e6ff, accent: 0xffffff, ghost: true });
    this.model.root.visible = false;
    parent.add(this.model.root);
  }
  restart(): void { this.clock = 0; this.active = true; }
  update(dt: number): void {
    if (!this.active) return;
    this.clock += dt;
    const f = this.data.frames;
    const idx = this.clock * GHOST_HZ;
    const i = Math.floor(idx);
    if ((i + 1) * 3 + 2 >= f.length) { this.model.root.visible = false; return; }
    const t = idx - i;
    const x = f[i * 3] + (f[(i + 1) * 3] - f[i * 3]) * t;
    const z = f[i * 3 + 1] + (f[(i + 1) * 3 + 1] - f[i * 3 + 1]) * t;
    let dh = f[(i + 1) * 3 + 2] - f[i * 3 + 2];
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.model.root.visible = true;
    this.model.root.position.set(x, 0.08, z);
    this.model.root.rotation.y = f[i * 3 + 2] + dh * t;
  }
  dispose(): void { this.model.root.removeFromParent(); this.model.dispose(); }
}
