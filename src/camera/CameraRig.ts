import * as THREE from 'three';

export interface Followable {
  position: THREE.Vector3;
  heading: number;
  lateralSpeed: number;
  forwardSpeed: number;
  speed: number;
  nitroActive: boolean;
  boostTimer: number;
}

/** Chase camera (ported from Smash Town): speed FOV, nitro kick, yaw lag in drifts, damped shake, menu orbit. */
export class CameraRig {
  private yaw = 0;
  private shakeAmp = 0;
  private shakeTime = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private initialised = false;
  private orbitAngle = 0.6;
  /** True where the camera may not be (inside buildings); it is pulled towards the car until free. */
  blocked: ((x: number, z: number) => boolean) | null = null;
  shakeScale = 1;
  /** Added to the FOV (user setting). */
  fovOffset = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  shake(amount: number): void {
    this.shakeAmp = Math.min(1.2, this.shakeAmp + amount * this.shakeScale);
    this.shakeTime = 0;
  }

  snap(): void { this.initialised = false; }

  /** Slow showroom orbit around a point (menus). */
  orbit(dt: number, target: THREE.Vector3, radius = 9, height = 3.2): void {
    this.orbitAngle += dt * 0.22;
    this.camera.position.set(target.x + Math.sin(this.orbitAngle) * radius, target.y + height, target.z + Math.cos(this.orbitAngle) * radius);
    this.camera.lookAt(target.x, target.y + 0.7, target.z);
    this.camera.fov += (50 - this.camera.fov) * (1 - Math.exp(-dt * 4));
    this.camera.updateProjectionMatrix();
    this.initialised = false;
  }

  update(dt: number, car: Followable): void {
    const target = car.heading + Math.atan2(car.lateralSpeed, Math.max(6, Math.abs(car.forwardSpeed))) * 0.6;
    if (!this.initialised) this.yaw = target;
    let diff = target - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * (1 - Math.exp(-dt * 4.5));

    const boost = car.nitroActive || car.boostTimer > 0;
    const speedT = Math.min(1, Math.abs(car.speed) / 48);
    const dist = 8.6 + speedT * 1.8 + (boost ? 1.4 : 0);
    const height = 3.5 + speedT * 0.6 + car.position.y * 0.5;
    const desired = this.tmp.set(car.position.x - Math.sin(this.yaw) * dist, height, car.position.z - Math.cos(this.yaw) * dist);
    if (this.blocked) {
      for (let k = 0; k < 10 && this.blocked(desired.x, desired.z); k++) {
        desired.x = car.position.x + (desired.x - car.position.x) * 0.78;
        desired.z = car.position.z + (desired.z - car.position.z) * 0.78;
        desired.y += 0.22;
      }
    }
    if (!this.initialised) { this.pos.copy(desired); this.initialised = true; }
    else this.pos.lerp(desired, 1 - Math.exp(-dt * 9));
    this.look.set(car.position.x + Math.sin(this.yaw) * 4, 1.4 + car.position.y * 0.6, car.position.z + Math.cos(this.yaw) * 4);

    this.shakeTime += dt;
    this.shakeAmp *= Math.exp(-dt * 5);
    const sh = this.shakeAmp * Math.sin(this.shakeTime * 55);
    this.camera.position.set(this.pos.x + sh * 0.25, this.pos.y + sh * 0.2, this.pos.z + sh * 0.25);
    this.camera.lookAt(this.look);

    const targetFov = 60 + 14 * speedT + (boost ? 6 : 0);
    this.camera.fov += (Math.min(84, targetFov) + this.fovOffset - this.camera.fov) * (1 - Math.exp(-dt * 4));
    this.camera.updateProjectionMatrix();
  }
}
