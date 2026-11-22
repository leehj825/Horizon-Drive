import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarController } from '../vehicle/CarController';
import { mulberry32 } from './PropFactory';
import type { Track } from './track';

interface Prop {
  kind: 0 | 1; // 0 cone, 1 barrel
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rot: number; tilt: number; tiltV: number;
  awake: boolean;
  home: { x: number; z: number; rot: number };
}

function coloured(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Cones and barrels you can plough through: they tumble away, scrape speed and throw sparks. */
export class SmashProps {
  readonly group = new THREE.Group();
  private props: Prop[] = [];
  private meshes: THREE.InstancedMesh[];
  private geos: THREE.BufferGeometry[] = [];
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 });
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  smashed = 0;

  constructor(track: Track, junctions: { s: number }[], density = 1, seed = 5) {
    const rng = mulberry32(seed * 131 + 3);
    const cone = mergeGeometries([
      coloured(new THREE.ConeGeometry(0.34, 0.8, 8).translate(0, 0.4, 0), 0xff6a14),
      coloured(new THREE.BoxGeometry(0.8, 0.07, 0.8).translate(0, 0.035, 0), 0x2a2a33),
      coloured(new THREE.CylinderGeometry(0.22, 0.27, 0.14, 8).translate(0, 0.42, 0), 0xf4f4f4),
    ].map((g) => g.index ? g.toNonIndexed() : g))!;
    const barrel = mergeGeometries([
      coloured(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 10).translate(0, 0.475, 0), 0xc9322e),
      coloured(new THREE.CylinderGeometry(0.435, 0.435, 0.14, 10).translate(0, 0.5, 0), 0xf2f2f2),
    ].map((g) => g.index ? g.toNonIndexed() : g))!;
    this.geos.push(cone, barrel);
    const hw = track.halfWidth, W = hw + track.shoulder;
    const nearJ = (s: number) => junctions.some((j) => Math.abs(j.s - s) < 22);
    const L = track.length;
    const place = (kind: 0 | 1, s: number, lat: number, rot = rng() * 6.28) => {
      const p = track.pointAt(s, lat);
      this.props.push({ kind, x: p.x, y: 0, z: p.z, vx: 0, vy: 0, vz: 0, rot, tilt: 0, tiltV: 0, awake: false, home: { x: p.x, z: p.z, rot } });
    };
    // cone lines hugging the road edge, usually on the inside of corners
    const lines = Math.round(10 * density);
    for (let k = 0; k < lines; k++) {
      const s0 = 80 + rng() * (L - 200);
      if (nearJ(s0)) continue;
      const side = rng() < 0.5 ? -1 : 1;
      for (let j = 0; j < 6; j++) place(0, s0 + j * 4.5, side * (hw - 1.3 + (rng() - 0.5) * 0.4));
    }
    // barrels piled at the corners of every junction and a few random spots
    for (const jn of junctions) for (const sd of [-1, 1]) for (const ds of [-12, 12]) for (let j = 0; j < 3; j++) place(1, jn.s + ds + (rng() - 0.5) * 3, sd * (W - 1.2 - j * 0.9));
    for (let k = 0; k < Math.round(4 * density); k++) {
      const s0 = 100 + rng() * (L - 240);
      if (nearJ(s0)) continue;
      const side = rng() < 0.5 ? -1 : 1;
      for (let j = 0; j < 3; j++) place(1, s0 + j * 1.3, side * (hw + 0.8 + j * 0.2));
    }
    const nCone = this.props.filter((p) => p.kind === 0).length, nBar = this.props.length - nCone;
    const mc = new THREE.InstancedMesh(cone, this.mat, Math.max(1, nCone));
    const mb = new THREE.InstancedMesh(barrel, this.mat, Math.max(1, nBar));
    mc.count = nCone; mb.count = nBar;
    mc.frustumCulled = mb.frustumCulled = false;
    mc.castShadow = mb.castShadow = false;
    this.meshes = [mc, mb];
    this.group.add(mc, mb);
    this.reset();
  }

  private idx(p: Prop): number {
    // instance index within its kind
    let i = 0;
    for (const o of this.props) { if (o === p) return i; if (o.kind === p.kind) i++; }
    return i;
  }

  private indexCache = new Map<Prop, number>();
  private slot(p: Prop): number {
    let v = this.indexCache.get(p);
    if (v === undefined) { v = this.idx(p); this.indexCache.set(p, v); }
    return v;
  }

  private write(p: Prop): void {
    this.e.set(p.tilt, p.rot, 0);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(p.x, p.y, p.z), this.q, new THREE.Vector3(1, 1, 1));
    this.meshes[p.kind].setMatrixAt(this.slot(p), this.m);
  }

  reset(): void {
    for (const p of this.props) {
      p.x = p.home.x; p.z = p.home.z; p.rot = p.home.rot; p.y = 0; p.vx = p.vy = p.vz = 0; p.tilt = 0; p.tiltV = 0; p.awake = false;
      this.write(p);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    this.smashed = 0;
  }

  /** Returns how many props each car hit this step via `onHit(car, kind, x, z)`. */
  update(dt: number, cars: readonly CarController[], onHit: (car: CarController, kind: 0 | 1, x: number, z: number) => void): void {
    let dirty = false;
    for (const p of this.props) {
      if (!p.awake) {
        for (const c of cars) {
          const dx = p.x - c.position.x, dz = p.z - c.position.z;
          if (dx * dx + dz * dz > 20) continue;
          const sh = Math.sin(c.heading), ch = Math.cos(c.heading);
          let hit = false;
          for (const off of [-1.2, 1.2]) {
            const ex = p.x - (c.position.x + sh * off), ez = p.z - (c.position.z + ch * off);
            if (ex * ex + ez * ez < (p.kind ? 1.35 : 1.15) ** 2) { hit = true; break; }
          }
          if (!hit || c.airborne) continue;
          const sp = c.speed;
          p.awake = true;
          p.vx = c.vx * 1.05 + (Math.random() - 0.5) * 3;
          p.vz = c.vz * 1.05 + (Math.random() - 0.5) * 3;
          p.vy = 2.5 + sp * 0.14 + Math.random() * 2;
          p.tiltV = (Math.random() < 0.5 ? -1 : 1) * (4 + sp * 0.3);
          const slow = sp > 8 ? (p.kind ? 0.972 : 0.994) : 1;
          c.vx *= slow; c.vz *= slow;
          this.smashed++;
          onHit(c, p.kind, p.x, p.z);
          break;
        }
        continue;
      }
      p.vy -= 24 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.tilt += p.tiltV * dt;
      if (p.y <= 0) {
        p.y = 0;
        if (p.vy < -2) p.vy *= -0.32; else p.vy = 0;
        const f = Math.exp(-2.2 * dt);
        p.vx *= f; p.vz *= f; p.tiltV *= 0.9;
        if (Math.hypot(p.vx, p.vz) < 0.35 && Math.abs(p.vy) < 0.1) {
          p.awake = false;
          p.tilt = Math.round(p.tilt / (Math.PI / 2)) * (Math.PI / 2);
          p.vx = p.vz = p.tiltV = 0;
          // lying on its side sits lower
          p.y = Math.abs(Math.sin(p.tilt)) > 0.5 ? (p.kind ? 0.42 : 0.2) : 0;
          // wake again on contact: make it hittable
        }
      }
      this.write(p);
      dirty = true;
    }
    if (dirty) for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
  }
}
