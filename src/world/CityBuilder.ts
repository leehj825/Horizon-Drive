import * as THREE from 'three';
import type { BiomePreset } from '../data/biomes';
import { instanceParts, mulberry32, unitBox, unitCyl, type Part, type Placement } from './PropFactory';
import { windowTexture } from './textures';
import type { Track } from './track';

/**
 * The street-racing city: asphalt grid, block pavements, towers with lit windows and neon signs, side-street
 * dash lines and the plaza (fountain, monument, trees) at the sweeping corner.
 */
export function buildCity(track: Track, preset: BiomePreset, group: THREE.Group, disposables: { dispose(): void }[]): void {
  const city = track.city!;
  const P = city.pitch;
  const hwSt = track.halfWidth; // street half width
  const edge = hwSt + track.shoulder; // facade line
  const rng = mulberry32(preset.trackShape.seed * 7919 + 13);
  const B = city.bounds;
  const PAD = 4; // blocks of city beyond the route on every side
  const gx0 = B.minGx - PAD, gx1 = B.maxGx + PAD, gy0 = B.minGy - PAD, gy1 = B.maxGy + PAD;
  const own = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };
  const inst = (placements: Placement[], parts: Part[]) => {
    for (const p of parts) { disposables.push(p.geo); disposables.push(p.mat); }
    return instanceParts(group, placements, parts);
  };

  // ---- asphalt grid (under the route ribbon) ----
  const asphalt = own(new THREE.MeshStandardMaterial({ color: preset.roadColor, roughness: 0.32, metalness: 0.25 }));
  const lenX = (gx1 - gx0) * P + 2 * hwSt, lenZ = (gy1 - gy0) * P + 2 * hwSt;
  // unit planes (not slivers: edge-on flat-shaded triangles give NaN normals that blank the bloom pass), instanced
  const unitPlane = new THREE.PlaneGeometry(1, 1);
  unitPlane.rotateX(-Math.PI / 2);
  const streets: Placement[] = [];
  for (let gx = gx0; gx <= gx1; gx++) streets.push({ x: gx * P, y: 0.008, z: ((gy0 + gy1) / 2) * P, rot: 0, sx: hwSt * 2, sy: 1, sz: lenZ });
  for (let gy = gy0; gy <= gy1; gy++) streets.push({ x: ((gx0 + gx1) / 2) * P, y: 0.009, z: gy * P, rot: 0, sx: lenX, sy: 1, sz: hwSt * 2 });
  inst(streets, [{ geo: unitPlane, mat: asphalt }]);

  // ---- dashed centre lines on every street, clear of junctions ----
  const dashes: Placement[] = [];
  const dashAlong = (fixed: number, from: number, to: number, alongX: boolean, base: number) => {
    for (let u = from; u < to; u += 8) {
      const k = Math.round((u - base) / P);
      if (Math.abs(u - (base + k * P)) < hwSt + 3) continue;
      dashes.push(alongX ? { x: u, y: 0.03, z: fixed, rot: Math.PI / 2, sx: 0.3, sy: 0.04, sz: 3.6 } : { x: fixed, y: 0.03, z: u, rot: 0, sx: 0.3, sy: 0.04, sz: 3.6 });
    }
  };
  for (let gx = gx0; gx <= gx1; gx++) dashAlong(gx * P, gy0 * P, gy1 * P, false, 0);
  for (let gy = gy0; gy <= gy1; gy++) dashAlong(gy * P, gx0 * P, gx1 * P, true, 0);
  inst(dashes, [{ geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0x7c86a6 }) }]);

  // ---- block pavements ----
  const pave: Placement[] = [];
  const plazas = city.corners.filter((c) => c.plaza);
  const inPlaza = (x: number, z: number) => plazas.some((c) => Math.hypot(x - c.cx, z - c.cz) < c.r + 36);
  for (let gx = gx0; gx < gx1; gx++) for (let gy = gy0; gy < gy1; gy++) {
    const cx = (gx + 0.5) * P, cz = (gy + 0.5) * P;
    pave.push({ x: cx, y: 0, z: cz, rot: 0, sx: P - 2 * hwSt, sy: 0.07, sz: P - 2 * hwSt });
  }
  inst(pave, [{ geo: unitBox(), mat: new THREE.MeshStandardMaterial({ color: 0x242940, roughness: 0.8 }) }]);

  // ---- towers ----
  const win = windowTexture(preset.trackShape.seed);
  disposables.push(win);
  win.repeat.set(2.5, 6);
  const towers: Placement[] = [];
  const crowns: Placement[] = [];
  const signs: Placement[] = [];
  const lot = (P - 2 * edge - 2.2) / 2; // two lots per block side
  const neon = [0x19e6ff, 0xff3fa6, 0xffd24a, 0x8a5bff, 0x7bff9a, 0xff6a3a];
  for (let gx = gx0; gx < gx1; gx++) for (let gy = gy0; gy < gy1; gy++) {
    const cx = (gx + 0.5) * P, cz = (gy + 0.5) * P;
    if (inPlaza(cx, cz)) continue;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const w = lot * (0.82 + rng() * 0.18), d = lot * (0.82 + rng() * 0.18);
      const lx = cx + (i ? 1 : -1) * (lot / 2 + 1.1), lz = cz + (j ? 1 : -1) * (lot / 2 + 1.1);
      const r = rng();
      const h = r < 0.12 ? 7 + rng() * 6 : 22 + rng() * rng() * 95;
      towers.push({ x: lx, z: lz, rot: 0, sx: w, sy: h, sz: d });
      if (h > 20) crowns.push({ x: lx, y: h, z: lz, rot: 0, sx: 1.2, sy: 2.6, sz: 1.2 });
      // street-facing neon sign on the facade nearest a street
      if (rng() < 0.7) {
        const faceX = rng() < 0.5; // sign on the x- or z-facing facade
        const dirX = i ? 1 : -1, dirZ = j ? 1 : -1;
        const sh = 3 + rng() * 6, sw = 1.2 + rng() * 2.6, y = 5 + rng() * Math.min(h - 6, 20);
        // the outer facade faces the nearer street; the sign sits just proud of it
        const col = new THREE.Color(neon[Math.floor(rng() * neon.length)]);
        if (faceX) signs.push({ x: lx + dirX * (w / 2 + 0.2), y, z: lz + (rng() - 0.5) * (d - 3), rot: 0, sx: 0.35, sy: sh, sz: sw, color: col });
        else signs.push({ x: lx + (rng() - 0.5) * (w - 3), y, z: lz + dirZ * (d / 2 + 0.2), rot: 0, sx: sw, sy: sh, sz: 0.35, color: col });
      }
    }
  }
  inst(towers, [{ geo: unitBox(), mat: new THREE.MeshStandardMaterial({ color: 0x1b1f33, map: win, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 1.05, roughness: 0.6, flatShading: true }) }]);
  inst(crowns, [{ geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0xff3fa6 }) }]);
  inst(signs, [{ geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0xffffff }), colored: true }]);

  // ---- plaza: fountain, monument, ring lamps and trees ----
  for (const pz of plazas) {
    const plate = new THREE.Mesh(own(new THREE.CylinderGeometry(pz.r - edge + 0.4, pz.r - edge + 0.4, 0.14, 40)), own(new THREE.MeshStandardMaterial({ color: 0x2c3150, roughness: 0.6, flatShading: true })));
    plate.position.set(pz.cx, 0.06, pz.cz); plate.receiveShadow = true; group.add(plate);
    const ring = new THREE.Mesh(own(new THREE.TorusGeometry(10.5, 0.45, 6, 36)), own(new THREE.MeshBasicMaterial({ color: 0x19e6ff })));
    ring.rotation.x = Math.PI / 2; ring.position.set(pz.cx, 0.55, pz.cz); group.add(ring);
    const water = new THREE.Mesh(own(new THREE.CylinderGeometry(10, 10, 0.5, 32)), own(new THREE.MeshStandardMaterial({ color: 0x0b4a78, emissive: 0x0a5a9a, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.4 })));
    water.position.set(pz.cx, 0.3, pz.cz); group.add(water);
    const stem = new THREE.Mesh(own(new THREE.CylinderGeometry(0.7, 1.4, 14, 8)), own(new THREE.MeshStandardMaterial({ color: 0xcfd6ee, metalness: 0.6, roughness: 0.3, flatShading: true })));
    stem.position.set(pz.cx, 7.2, pz.cz); stem.castShadow = true; group.add(stem);
    const orb = new THREE.Mesh(own(new THREE.IcosahedronGeometry(2.4, 0)), own(new THREE.MeshBasicMaterial({ color: 0xff3fa6 })));
    orb.position.set(pz.cx, 15.4, pz.cz); group.add(orb);
    const lamps: Placement[] = [], trees: Placement[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      lamps.push({ x: pz.cx + Math.cos(a) * 16, z: pz.cz + Math.sin(a) * 16, rot: 0, sx: 1, sy: 1, sz: 1 });
      trees.push({ x: pz.cx + Math.cos(a + 0.31) * 21, z: pz.cz + Math.sin(a + 0.31) * 21, rot: 0, sx: 1, sy: 1, sz: 1 });
    }
    const lampL = (y: number, sy: number) => new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion(), new THREE.Vector3(1, sy, 1));
    inst(lamps, [
      { geo: unitCyl(0.1, 0.12, 5), mat: new THREE.MeshStandardMaterial({ color: 0x2a2f3a }), local: lampL(0, 5) },
      { geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0xffb8e6 }), local: new THREE.Matrix4().compose(new THREE.Vector3(0, 5, 0), new THREE.Quaternion(), new THREE.Vector3(0.7, 0.35, 0.7)) },
    ]);
    inst(trees, [
      { geo: unitCyl(0.18, 0.24, 5), mat: new THREE.MeshStandardMaterial({ color: 0x4a3a2a, flatShading: true }), local: lampL(0, 3) },
      { geo: new THREE.IcosahedronGeometry(1.7, 0).translate(0, 0.0, 0), mat: new THREE.MeshStandardMaterial({ color: 0xff7ac8, emissive: 0x6a1a4a, emissiveIntensity: 0.6, flatShading: true }), local: lampL(3.6, 1) },
    ]);
  }
}
