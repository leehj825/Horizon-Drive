import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarController } from '../vehicle/CarController';
import { mulberry32 } from './PropFactory';
import type { Track } from './track';

export type PropKind = 0 | 1 | 2 | 3; // cone, barrel, bin, street-sign post

interface Prop {
  kind: PropKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rot: number; tilt: number; tiltV: number;
  awake: boolean;
  slot: number;
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
const flat = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)))!;

/** radius for contact, speed kept when smashed, launch strength */
const SPEC: Record<PropKind, { r: number; keep: number; lift: number }> = {
  0: { r: 1.15, keep: 0.994, lift: 1 },
  1: { r: 1.35, keep: 0.972, lift: 0.8 },
  2: { r: 1.25, keep: 0.982, lift: 0.9 },
  3: { r: 1.0, keep: 0.99, lift: 0.7 },
};

/** Cones, barrels, bins and street signs you can plough through: they tumble away, scrape speed and throw sparks. */
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
  /** Props of the moving road-works cluster, and where it currently stands. */
  private eventProps: Prop[] = [];
  eventS = -1;
  private track!: Track;

  constructor(track: Track, junctions: { s: number }[], density = 1, seed = 5) {
    this.track = track;
    const rng = mulberry32(seed * 131 + 3);
    const cone = flat([
      coloured(new THREE.ConeGeometry(0.34, 0.8, 8).translate(0, 0.4, 0), 0xff6a14),
      coloured(new THREE.BoxGeometry(0.8, 0.07, 0.8).translate(0, 0.035, 0), 0x2a2a33),
      coloured(new THREE.CylinderGeometry(0.22, 0.27, 0.14, 8).translate(0, 0.42, 0), 0xf4f4f4),
    ]);
    const barrel = flat([
      coloured(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 10).translate(0, 0.475, 0), 0xc9322e),
      coloured(new THREE.CylinderGeometry(0.435, 0.435, 0.14, 10).translate(0, 0.5, 0), 0xf2f2f2),
    ]);
    const bin = flat([
      coloured(new THREE.CylinderGeometry(0.36, 0.3, 0.85, 8).translate(0, 0.425, 0), 0x4c5a58),
      coloured(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 8).translate(0, 0.88, 0), 0x2c3534),
    ]);
    const sign = flat([
      coloured(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 6).translate(0, 1.3, 0), 0x8a909c),
      coloured(new THREE.BoxGeometry(0.9, 0.9, 0.06).translate(0, 2.35, 0), 0x2fa5ff),
      coloured(new THREE.BoxGeometry(0.5, 0.12, 0.08).translate(0, 2.35, 0.02), 0xffffff),
    ]);
    this.geos.push(cone, barrel, bin, sign);
    const hw = track.halfWidth, W = hw + track.shoulder;
    const nearJ = (s: number) => junctions.some((j) => Math.abs(j.s - s) < 22);
    const L = track.length;
    const place = (kind: PropKind, s: number, lat: number, rot = rng() * 6.28) => {
      const p = track.pointAt(s, lat);
      this.props.push({ kind, x: p.x, y: 0, z: p.z, vx: 0, vy: 0, vz: 0, rot, tilt: 0, tiltV: 0, awake: false, slot: 0, home: { x: p.x, z: p.z, rot } });
    };
    // cone lines hugging the road edge
    for (let k = 0; k < Math.round(10 * density); k++) {
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
    // street furniture on the sidewalks: bins on the outside of every corner, sign posts near junctions
    for (const cs of track.cornerS) {
      const i = track.indexAt(cs);
      const outer = track.curv[i] > 0 ? -1 : 1;
      for (let j = -1; j <= 1; j++) place(2, cs + j * 4.5, outer * (hw + 1.0));
    }
    for (let k = 0; k < Math.round(12 * density); k++) {
      const s0 = 60 + rng() * (L - 150);
      if (nearJ(s0)) continue;
      const side = rng() < 0.5 ? -1 : 1;
      place(rng() < 0.5 ? 2 : 3, s0, side * (W - 0.9));
    }
    for (const c of track.crossings) for (const side of [-1, 1]) place(3, c - 9, side * (W - 0.8));

    // road-works cluster (8 barrels), parked far off the track until placeEvent() puts it on a straight
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      this.props.push({ kind: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, tilt: 0, tiltV: 0, awake: false, slot: 0, home: { x: 99999, z: 99999, rot: 0 } });
      this.eventProps.push(this.props[this.props.length - 1]);
    }
    const counts = [0, 0, 0, 0];
    for (const p of this.props) p.slot = counts[p.kind]++;
    this.meshes = [cone, barrel, bin, sign].map((g, k) => {
      const mesh = new THREE.InstancedMesh(g, this.mat, Math.max(1, counts[k]));
      mesh.count = counts[k];
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    });
    this.reset();
  }

  /** Put the road-works cluster on the road at lap distance s, centred at lateral offset lat. */
  placeEvent(s: number, lat: number): void {
    const t = this.track;
    this.eventS = s;
    this.eventProps.forEach((p, k) => {
      const r = Math.floor(k / 4), c = k % 4;
      const pt = t.pointAt(s + (c - 1.5) * 1.9, lat + (r - 0.5) * 1.9);
      p.home = { x: pt.x, z: pt.z, rot: 0 };
      p.x = pt.x; p.z = pt.z; p.y = 0; p.vx = p.vy = p.vz = 0; p.tilt = 0; p.tiltV = 0; p.awake = false;
      this.write(p);
    });
    this.meshes[1].instanceMatrix.needsUpdate = true;
  }

  private write(p: Prop): void {
    this.e.set(p.tilt, p.rot, 0);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(p.x, p.y, p.z), this.q, new THREE.Vector3(1, 1, 1));
    this.meshes[p.kind].setMatrixAt(p.slot, this.m);
  }

  reset(): void {
    for (const p of this.props) {
      p.x = p.home.x; p.z = p.home.z; p.rot = p.home.rot; p.y = 0; p.vx = p.vy = p.vz = 0; p.tilt = 0; p.tiltV = 0; p.awake = false;
      this.write(p);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    this.smashed = 0;
  }

  update(dt: number, cars: readonly CarController[], onHit: (car: CarController, kind: PropKind, x: number, z: number) => void): void {
    let dirty = false;
    for (const p of this.props) {
      const spec = SPEC[p.kind];
      if (!p.awake) {
        for (const c of cars) {
          const dx = p.x - c.position.x, dz = p.z - c.position.z;
          if (dx * dx + dz * dz > 20) continue;
          const sh = Math.sin(c.heading), ch = Math.cos(c.heading);
          let hit = false;
          for (const off of [-1.2, 1.2]) {
            const ex = p.x - (c.position.x + sh * off), ez = p.z - (c.position.z + ch * off);
            if (ex * ex + ez * ez < spec.r * spec.r) { hit = true; break; }
          }
          if (!hit || c.airborne) continue;
          const sp = c.speed;
          p.awake = true;
          p.vx = c.vx * 1.05 + (Math.random() - 0.5) * 3;
          p.vz = c.vz * 1.05 + (Math.random() - 0.5) * 3;
          p.vy = (2.5 + sp * 0.14 + Math.random() * 2) * spec.lift;
          p.tiltV = (Math.random() < 0.5 ? -1 : 1) * (4 + sp * 0.3);
          const slow = sp > 8 ? spec.keep : 1;
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
          p.y = Math.abs(Math.sin(p.tilt)) > 0.5 ? (p.kind === 1 ? 0.42 : p.kind === 3 ? 0.07 : 0.2) : 0;
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
