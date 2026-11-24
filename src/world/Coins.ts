import * as THREE from 'three';
import type { Track } from './track';

interface Coin { x: number; y: number; z: number; alive: boolean }

/** Collectable track coins (Credit Magnet pulls them in). One InstancedMesh. */
export class CoinField {
  readonly mesh: THREE.InstancedMesh;
  private coins: Coin[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private geo: THREE.BufferGeometry;
  private mat: THREE.Material;

  constructor(track: Track, extra: { x: number; y: number; z: number }[] = []) {
    // groups of three, weaving across the road
    let k = 0;
    for (let s = 45; s < track.length - 40; s += 24) {
      const lat = Math.sin(k * 0.55) * track.halfWidth * 0.55;
      for (let j = 0; j < 3; j++) {
        const p = track.pointAt(s + j * 3.5, lat);
        this.coins.push({ x: p.x, y: 0.9, z: p.z, alive: true });
      }
      k++;
    }
    for (const e of extra) this.coins.push({ ...e, alive: true });
    this.geo = new THREE.CylinderGeometry(0.55, 0.55, 0.14, 14);
    this.geo.rotateX(Math.PI / 2);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffc928, emissive: 0xffa800, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.3, flatShading: true });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.coins.length);
    this.mesh.frustumCulled = false;
    this.reset();
  }

  get count(): number { return this.coins.length; }

  reset(): void {
    for (const c of this.coins) c.alive = true;
  }

  /** Returns the number of coins collected this step. */
  update(dt: number, time: number, carX: number, carZ: number, carY: number, magnet: number, active: boolean): number {
    let got = 0;
    const pull2 = magnet * magnet;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (!c.alive) { this.mesh.setMatrixAt(i, this.zero); continue; }
      if (active) {
        const dx = carX - c.x, dz = carZ - c.z, dy = carY + 0.8 - c.y;
        const d2 = dx * dx + dz * dz + dy * dy * 0.4;
        if (d2 < 2.6 * 2.6) { c.alive = false; got++; this.mesh.setMatrixAt(i, this.zero); continue; }
        if (d2 < pull2 && magnet > 4) {
          const d = Math.sqrt(d2);
          const sp = Math.min(d, (28 + (1 - d / magnet) * 40) * dt);
          c.x += (dx / d) * sp; c.z += (dz / d) * sp; c.y += (dy / d) * sp;
        }
      }
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, time * 3 + i);
      this.m.compose(new THREE.Vector3(c.x, c.y + Math.sin(time * 3 + i) * 0.12, c.z), this.q, new THREE.Vector3(1, 1, 1));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return got;
  }

  dispose(): void { this.geo.dispose(); this.mat.dispose(); }
}
