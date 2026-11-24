import * as THREE from 'three';
import type { Track } from './track';

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Placement {
  x: number; y?: number; z: number;
  rot: number;
  sx: number; sy: number; sz: number;
  color?: THREE.Color;
}

export interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  local?: THREE.Matrix4;
  cast?: boolean;
  colored?: boolean;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** One InstancedMesh per part; every part follows the placement transform. */
export function instanceParts(parent: THREE.Object3D, placements: Placement[], parts: Part[]): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  if (!placements.length) return out;
  for (const part of parts) {
    const mesh = new THREE.InstancedMesh(part.geo, part.mat, placements.length);
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      _q.setFromAxisAngle(_up, p.rot);
      _p.set(p.x, p.y ?? 0, p.z);
      _s.set(p.sx, p.sy, p.sz);
      _m.compose(_p, _q, _s);
      if (part.local) _m.multiply(part.local);
      mesh.setMatrixAt(i, _m);
      if (part.colored && p.color) mesh.setColorAt(i, p.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = !!part.cast;
    mesh.frustumCulled = false; // instances spread over the whole map
    parent.add(mesh);
    out.push(mesh);
  }
  return out;
}

export function loc(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
}

/** Random scenery off the road, rejecting spots near any part of the track. */
export function scatter(track: Track, rng: () => number, count: number, minOff: number, maxOff: number, scale: (r: () => number) => [number, number, number], opts: { side?: 1 | -1 | 0; clearance?: number; ground?: number } = {}): Placement[] {
  const out: Placement[] = [];
  const base = track.halfWidth + track.shoulder;
  const clear = opts.clearance ?? minOff * 0.8;
  for (let tries = 0; tries < count * 12 && out.length < count; tries++) {
    const i = Math.floor(rng() * track.n);
    const side = opts.side ? opts.side : rng() < 0.5 ? 1 : -1;
    const off = base + minOff + rng() * (maxOff - minOff);
    const x = track.px[i] + track.nx(i) * side * off;
    const z = track.pz[i] + track.nz(i) * side * off;
    if (track.distanceToRoad(x, z) < base + clear) continue;
    const [sx, sy, sz] = scale(rng);
    out.push({ x, z, y: opts.ground ?? 0, rot: rng() * Math.PI * 2, sx, sy, sz });
  }
  return out;
}

/** Regularly spaced spots along the track (rot = travel heading, local +x = left). */
export function along(track: Track, spacing: number, lat: number, start = 0, end = track.length, scale: [number, number, number] = [1, 1, 1], skip: (s: number) => boolean = () => false): Placement[] {
  const out: Placement[] = [];
  for (let s = start; s < end; s += spacing) {
    if (skip(s)) continue;
    const i = track.indexAt(s);
    out.push({
      x: track.px[i] + track.nx(i) * lat, z: track.pz[i] + track.nz(i) * lat,
      rot: track.heading(i), sx: scale[0], sy: scale[1], sz: scale[2],
    });
  }
  return out;
}

export const stdMat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.02, ...o });

export function unitBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}
export function unitCyl(top: number, bottom: number, seg: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(top, bottom, 1, seg);
  g.translate(0, 0.5, 0);
  return g;
}
export function unitCone(r: number, seg: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, 1, seg);
  g.translate(0, 0.5, 0);
  return g;
}
