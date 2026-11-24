import * as THREE from 'three';
import type { BiomePreset, CityStyle } from '../data/biomes';
import { unitBox, unitCone, unitCyl, type Part, type Placement } from './PropFactory';
import type { Track } from './track';

type Inst = (placements: Placement[], parts: Part[]) => THREE.InstancedMesh[];
export type Animator = (dt: number, time: number) => void;

export interface DetailCtx {
  track: Track;
  preset: BiomePreset;
  style: CityStyle;
  rng: () => number;
  edge: number;
  inst: Inst;
}

const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, ...o });
const pick = <T,>(rng: () => number, a: T[]): T => a[Math.floor(rng() * a.length)];
const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

/** Tint a facade so neighbouring towers do not look cloned. */
export function facadeTint(style: CityStyle, rng: () => number): THREE.Color {
  if (style === 'neon') return new THREE.Color(0x1b1f33).offsetHSL((rng() - 0.5) * 0.12, 0.05, (rng() - 0.5) * 0.04);
  if (style === 'harbor') return new THREE.Color(0x2a2f3c).offsetHSL((rng() - 0.5) * 0.05, 0, (rng() - 0.5) * 0.05);
  return new THREE.Color(pick(rng, [0xffffff, 0xf3e6d3, 0xdfe8f5, 0xe9dcdc, 0xdcebdc, 0xf0efe6]));
}

/**
 * Setback tiers (pushed into `towers`), plus rooftop clutter: AC units, water tanks, antennas with blinking beacons.
 */
export function addRooftops(ctx: DetailCtx, towers: Placement[]): Animator {
  const { rng, style, inst } = ctx;
  const base = towers.slice();
  const ac: Placement[] = [], tanks: Placement[] = [], masts: Placement[] = [], beacons: Placement[] = [];
  const grey = [0x9aa0aa, 0x7d838e, 0xb4b8c0, 0x6a707b];
  for (const t of base) {
    if (t.sy < 16) continue;
    let top = (t.y ?? 0) + t.sy, w = t.sx, d = t.sz, cx = t.x, cz = t.z;
    if (t.sy > 38 && rng() < 0.55) {
      const nw = w * (0.55 + rng() * 0.15), nd = d * (0.55 + rng() * 0.15), h = 5 + rng() * 10;
      cx = t.x + (rng() - 0.5) * (w - nw) * 0.6; cz = t.z + (rng() - 0.5) * (d - nd) * 0.6;
      towers.push({ x: cx, y: top, z: cz, rot: 0, sx: nw, sy: h, sz: nd });
      top += h; w = nw; d = nd;
    }
    const spot = () => ({ x: cx + (rng() - 0.5) * (w - 3), z: cz + (rng() - 0.5) * (d - 3) });
    for (let k = 0, n = 1 + Math.floor(rng() * 3); k < n; k++) { const p = spot(); ac.push({ x: p.x, y: top, z: p.z, rot: rng() < 0.5 ? 0 : Math.PI / 2, sx: 2.2, sy: 1.1, sz: 1.6, color: new THREE.Color(pick(rng, grey)) }); }
    if (style !== 'neon' && rng() < 0.4) { const p = spot(); tanks.push({ x: p.x, y: top, z: p.z, rot: 0, sx: 1, sy: 1, sz: 1 }); }
    if (rng() < 0.5) {
      const p = spot(), h = 5 + rng() * 8;
      masts.push({ x: p.x, y: top, z: p.z, rot: 0, sx: 1, sy: h, sz: 1 });
      if (t.sy > 45) beacons.push({ x: p.x, y: top + h, z: p.z, rot: 0, sx: 0.5, sy: 0.5, sz: 0.5 });
    }
  }
  inst(ac, [{ geo: unitBox(), mat: std(0xffffff), colored: true }]);
  inst(tanks, [
    { geo: unitBox(), mat: std(0x4a4f5a), local: M(0, 0, 0, 0.5, 1.4, 0.5) },
    { geo: unitCyl(1.2, 1.2, 10), mat: std(0x8a5a3a), local: M(0, 1.4, 0, 1, 2.4, 1) },
    { geo: unitCone(1.3, 10), mat: std(0x3a3f4a), local: M(0, 3.8, 0, 1, 0.9, 1) },
  ]);
  inst(masts, [{ geo: unitCyl(0.05, 0.1, 5), mat: std(0x2a2f3a) }]);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  inst(beacons, [{ geo: unitBox(), mat: beaconMat }]);
  return (_dt, time) => { beaconMat.color.setHex(Math.sin(time * 3.2) > 0.2 ? 0xff2a2a : 0x2a0606); };
}

/** Street furniture, road wear, overhead wires and pedestrians along the race route. */
export function addStreetDetail(ctx: DetailCtx): Animator | null {
  const { track, preset, style, rng, edge, inst } = ctx;
  const L = track.length;
  const out = edge + 0.85; // just behind the wall, on the pavement
  const nearGap = (s: number) => track.wallGaps.some(([a, b]) => s > a - 3 && s < b + 3);
  const okAt = (s: number) => {
    const i = track.indexAt(s);
    return Math.abs(track.curv[i]) < 0.03 && !nearGap(s) && !track.crossings.some((c) => Math.abs(c - s) < 14);
  };

  const hydrants: Placement[] = [], boxes: Placement[] = [], meters: Placement[] = [], benches: Placement[] = [];
  const shelters: Placement[] = [], planters: Placement[] = [], wires: Placement[] = [], lamps: Placement[] = [];
  const facing = (s: number, side: number, lat: number): Placement => {
    const i = track.indexAt(s);
    const p = track.pointAt(s, side * lat);
    return { x: p.x, y: 0.07, z: p.z, rot: Math.atan2(-side * track.nx(i), -side * track.nz(i)), sx: 1, sy: 1, sz: 1 };
  };
  const adCols = style === 'neon' ? [0x19e6ff, 0xff3fa6, 0xffd24a] : style === 'harbor' ? [0xffb45a, 0xe8e8e0] : [0xff5a4f, 0x2f8cff, 0xffc928, 0x2fcf7a];
  for (let s = 10; s < L - 10; s += 7 + rng() * 6) {
    if (!okAt(s)) continue;
    const side = rng() < 0.5 ? -1 : 1;
    const r = rng();
    if (r < 0.2) hydrants.push(facing(s, side, out));
    else if (r < 0.36) boxes.push(facing(s, side, out));
    else if (r < 0.52) meters.push(facing(s, side, out - 0.2));
    else if (r < 0.7) benches.push(facing(s, side, out + 0.2));
    else if (r < 0.8) { const p = facing(s, side, out + 0.5); p.color = new THREE.Color(pick(rng, adCols)); shelters.push(p); }
    else if (r < 0.92) planters.push(facing(s, side, out + 0.1));
  }
  // overhead wires with hanging lamps across the street
  for (let s = 30; s < L - 20; s += 38 + rng() * 22) {
    if (!okAt(s)) continue;
    const i = track.indexAt(s);
    const p = track.pointAt(s, 0);
    const len = (edge + 1.4) * 2;
    const col = new THREE.Color(pick(rng, adCols));
    wires.push({ x: p.x, y: 8.2, z: p.z, rot: Math.atan2(track.nx(i), track.nz(i)), sx: 1, sy: 1, sz: len, color: col });
    lamps.push({ x: p.x, y: 7.55, z: p.z, rot: 0, sx: 1, sy: 1, sz: 1, color: col });
  }
  const dark = (c: number) => std(c, { roughness: 0.6 });
  inst(hydrants, [
    { geo: unitCyl(0.16, 0.2, 8), mat: dark(0xd02a24), local: M(0, 0, 0, 1, 0.65, 1) },
    { geo: unitCyl(0.22, 0.22, 8), mat: dark(0xe8b21f), local: M(0, 0.6, 0, 1, 0.1, 1) },
  ]);
  inst(boxes, [{ geo: unitBox(), mat: dark(0x2d5bd0), local: M(0, 0, 0, 0.55, 1.1, 0.55) }]);
  inst(meters, [
    { geo: unitCyl(0.04, 0.05, 6), mat: dark(0x6a707b), local: M(0, 0, 0, 1, 1.1, 1) },
    { geo: unitBox(), mat: dark(0x23262d), local: M(0, 1.05, 0, 0.22, 0.34, 0.14) },
  ]);
  inst(benches, [
    { geo: unitBox(), mat: dark(0x8a5a3a), local: M(0, 0.42, 0, 1.8, 0.1, 0.5) },
    { geo: unitBox(), mat: dark(0x8a5a3a), local: M(0, 0.7, -0.22, 1.8, 0.4, 0.08) },
    { geo: unitBox(), mat: dark(0x2a2f3a), local: M(0, 0, 0, 1.7, 0.42, 0.4) },
  ]);
  inst(shelters, [
    { geo: unitBox(), mat: dark(0x2a2f3a), local: M(0, 2.5, 0, 3.4, 0.14, 1.7) },
    { geo: unitBox(), mat: dark(0x2a2f3a), local: M(-1.6, 0, -0.7, 0.1, 2.5, 0.1) },
    { geo: unitBox(), mat: dark(0x2a2f3a), local: M(1.6, 0, -0.7, 0.1, 2.5, 0.1) },
    { geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0xffffff }), local: M(0, 0.3, -0.78, 2.9, 1.9, 0.08), colored: true },
  ]);
  inst(planters, [
    { geo: unitBox(), mat: dark(0x5a4a3a), local: M(0, 0, 0, 1.0, 0.55, 1.0) },
    { geo: new THREE.IcosahedronGeometry(0.65, 0), mat: std(style === 'neon' ? 0x2f9a6a : 0x3f9a4a), local: M(0, 0.95, 0) },
  ]);
  inst(wires, [{ geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0xffffff }), local: M(0, 0, 0, 0.04, 0.04, 1), colored: true }]);
  inst(lamps, [{ geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0xffffff }), local: M(0, 0, 0, 0.5, 0.5, 0.5), colored: true }]);

  // road wear: manholes and patched asphalt
  const holes: Placement[] = [], patches: Placement[] = [];
  const hw = track.halfWidth;
  for (let s = 20; s < L - 20; s += 30 + rng() * 25) {
    if (!okAt(s)) continue;
    const i = track.indexAt(s);
    const p = track.pointAt(s, (rng() - 0.5) * hw * 1.2);
    if (rng() < 0.5) holes.push({ x: p.x, y: 0.02, z: p.z, rot: 0, sx: 1, sy: 1, sz: 1 });
    else patches.push({ x: p.x, y: 0.018, z: p.z, rot: track.heading(i) + (rng() - 0.5) * 0.3, sx: 1.4 + rng() * 1.8, sy: 1, sz: 2 + rng() * 3 });
  }
  const flat = (g: THREE.BufferGeometry) => { g.rotateX(-Math.PI / 2); return g; };
  const road = new THREE.Color(preset.roadColor);
  inst(holes, [
    { geo: flat(new THREE.CircleGeometry(0.5, 14)), mat: new THREE.MeshStandardMaterial({ color: road.clone().multiplyScalar(0.45), roughness: 0.5, metalness: 0.5 }) },
  ]);
  inst(patches, [
    { geo: flat(new THREE.PlaneGeometry(1, 1)), mat: new THREE.MeshStandardMaterial({ color: road.clone().multiplyScalar(0.62), roughness: 0.95 }) },
  ]);

  // pedestrians strolling on the pavement behind the walls
  const count = Math.min(70, Math.floor(L / 22));
  if (count < 4) return null;
  const palette = style === 'harbor' ? [0xff7a1a, 0xffb43a, 0x3a5f9a, 0x8a8f99] : style === 'neon' ? [0xff3fa6, 0x19e6ff, 0xffd24a, 0x8a5bff, 0xe8e8f0] : [0xd8382e, 0x2f8cff, 0xffc928, 0x2fcf7a, 0xff8ad0, 0xf4f4f4, 0x3a3f4a];
  const skin = [0xf2c9a0, 0xd9a073, 0x9a6a46, 0x6a4430];
  const geoBody = unitBox(); geoBody.scale(0.46, 0.75, 0.28); geoBody.translate(0, 0.8, 0);
  const geoLegs = unitBox(); geoLegs.scale(0.38, 0.8, 0.24); 
  const geoHead = new THREE.IcosahedronGeometry(0.15, 0); geoHead.translate(0, 1.7, 0);
  const peds: { s: number; lat: number; dir: number; speed: number; phase: number }[] = [];
  const holder: Placement[] = [];
  for (let k = 0; k < count; k++) {
    peds.push({ s: rng() * L, lat: (rng() < 0.5 ? -1 : 1) * (out + 1.0 + rng() * 2.2), dir: rng() < 0.5 ? -1 : 1, speed: 0.9 + rng() * 0.9, phase: rng() * 6 });
    holder.push({ x: 0, z: 0, rot: 0, sx: 1, sy: 1, sz: 1, color: new THREE.Color(pick(rng, palette)) });
  }
  const meshes = inst(holder, [
    { geo: geoBody, mat: std(0xffffff, { roughness: 0.8 }), colored: true },
    { geo: geoLegs, mat: std(0x23262d) },
    { geo: geoHead, mat: std(pick(rng, skin)) },
  ]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const tmp = { x: 0, z: 0 };
  return (dt, time) => {
    for (let k = 0; k < peds.length; k++) {
      const p = peds[k];
      p.s += p.dir * p.speed * dt;
      if (p.s < 0) p.s += L; else if (p.s >= L) p.s -= L;
      track.pointAt(p.s, p.lat, tmp);
      const i = track.indexAt(p.s);
      q.setFromAxisAngle(up, track.heading(i) + (p.dir > 0 ? 0 : Math.PI));
      pos.set(tmp.x, 0.07 + Math.abs(Math.sin(time * 6 * p.speed + p.phase)) * 0.04, tmp.z);
      m4.compose(pos, q, sc);
      for (const mesh of meshes) mesh.setMatrixAt(k, m4);
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  };
}
