import * as THREE from 'three';
import type { BiomePreset, CityStyle } from '../data/biomes';
import { instanceParts, mulberry32, unitBox, unitCyl, type Part, type Placement } from './PropFactory';
import { windowTexture } from './textures';
import type { Track } from './track';

interface Look {
  pave: number;
  rough: number;
  metal: number;
  dash: number;
  winKind: 'neon' | 'harbor' | 'day';
  signs: number[];
}

const LOOKS: Record<CityStyle, Look> = {
  neon: { pave: 0x242940, rough: 0.32, metal: 0.25, dash: 0x7c86a6, winKind: 'neon', signs: [0x19e6ff, 0xff3fa6, 0xffd24a, 0x8a5bff, 0x7bff9a, 0xff6a3a] },
  harbor: { pave: 0x5a5f6b, rough: 0.85, metal: 0, dash: 0xe8d27a, winKind: 'harbor', signs: [0xffb45a, 0xffd9a0, 0xff7a3a] },
  day: { pave: 0xb9bcc4, rough: 0.8, metal: 0, dash: 0xf4f4f4, winKind: 'day', signs: [0xff5a4f, 0x2f8cff, 0xffc928, 0x2fcf7a, 0xff8ad0] },
};

const CONTAINER = [0xb8442f, 0x2f6fb8, 0x3f9a5a, 0xd69a2a, 0x8a8f99, 0xd9d9d2, 0x7a3a8a];
const AWNING = [0xd8382e, 0x2f8cff, 0xffc928, 0x2fcf7a, 0xff8ad0, 0xf4f4f4];

/**
 * The race city: asphalt grid, block pavements, per-style blocks (neon towers, harbor container yards and
 * cranes, sunny downtown with awnings and trees), side-street dashes and the plaza centrepiece.
 */
export function buildCity(track: Track, preset: BiomePreset, group: THREE.Group, disposables: { dispose(): void }[]): void {
  const style: CityStyle = preset.cityStyle ?? 'neon';
  const look = LOOKS[style];
  const city = track.city!;
  const P = city.pitch;
  const hwSt = track.halfWidth;
  const edge = hwSt + track.shoulder;
  const rng = mulberry32(preset.trackShape.seed * 7919 + 13);
  const B = city.bounds;
  const PAD = style === 'harbor' ? 3 : 4;
  const gx0 = B.minGx - PAD, gx1 = B.maxGx + PAD, gy0 = B.minGy - PAD, gy1 = B.maxGy + PAD;
  const own = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };
  const inst = (placements: Placement[], parts: Part[]) => {
    for (const p of parts) { disposables.push(p.geo); disposables.push(p.mat); }
    return instanceParts(group, placements, parts);
  };
  const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

  // ---- asphalt grid (planes, not slivers: edge-on flat-shaded triangles give NaN normals that blank the bloom pass) ----
  const asphalt = own(new THREE.MeshStandardMaterial({ color: preset.roadColor, roughness: look.rough, metalness: look.metal }));
  const lenX = (gx1 - gx0) * P + 2 * hwSt, lenZ = (gy1 - gy0) * P + 2 * hwSt;
  const unitPlane = new THREE.PlaneGeometry(1, 1);
  unitPlane.rotateX(-Math.PI / 2);
  const streets: Placement[] = [];
  for (let gx = gx0; gx <= gx1; gx++) streets.push({ x: gx * P, y: 0.008, z: ((gy0 + gy1) / 2) * P, rot: 0, sx: hwSt * 2, sy: 1, sz: lenZ });
  for (let gy = gy0; gy <= gy1; gy++) streets.push({ x: ((gx0 + gx1) / 2) * P, y: 0.009, z: gy * P, rot: 0, sx: lenX, sy: 1, sz: hwSt * 2 });
  inst(streets, [{ geo: unitPlane, mat: asphalt }]);

  // ---- dashed centre lines on every street, clear of junctions ----
  const dashes: Placement[] = [];
  const dashAlong = (fixed: number, from: number, to: number, alongX: boolean) => {
    for (let u = from; u < to; u += 8) {
      const k = Math.round(u / P);
      if (Math.abs(u - k * P) < hwSt + 3) continue;
      dashes.push(alongX ? { x: u, y: 0.03, z: fixed, rot: Math.PI / 2, sx: 0.3, sy: 0.04, sz: 3.6 } : { x: fixed, y: 0.03, z: u, rot: 0, sx: 0.3, sy: 0.04, sz: 3.6 });
    }
  };
  for (let gx = gx0; gx <= gx1; gx++) dashAlong(gx * P, gy0 * P, gy1 * P, false);
  for (let gy = gy0; gy <= gy1; gy++) dashAlong(gy * P, gx0 * P, gx1 * P, true);
  inst(dashes, [{ geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: look.dash }) }]);

  // ---- block pavements ----
  const pave: Placement[] = [];
  const plazas = city.corners.filter((c) => c.plaza);
  const inPlaza = (x: number, z: number) => plazas.some((c) => Math.hypot(x - c.cx, z - c.cz) < c.r + 36);
  for (let gx = gx0; gx < gx1; gx++) for (let gy = gy0; gy < gy1; gy++) {
    pave.push({ x: (gx + 0.5) * P, y: 0, z: (gy + 0.5) * P, rot: 0, sx: P - 2 * hwSt, sy: 0.07, sz: P - 2 * hwSt });
  }
  inst(pave, [{ geo: unitBox(), mat: new THREE.MeshStandardMaterial({ color: look.pave, roughness: 0.8 }) }]);

  // ---- blocks ----
  const win = windowTexture(preset.trackShape.seed, look.winKind);
  disposables.push(win);
  const lit = style !== 'day';
  const towerMat = new THREE.MeshStandardMaterial(
    style === 'day'
      ? { color: 0xffffff, map: win, roughness: 0.35, metalness: 0.25, flatShading: true }
      : { color: style === 'harbor' ? 0x2a2f3c : 0x1b1f33, map: win, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: style === 'harbor' ? 0.85 : 1.05, roughness: 0.6, flatShading: true },
  );
  void lit;
  const towers: Placement[] = [];
  const crowns: Placement[] = [];
  const signs: Placement[] = [];
  const boxesC: Placement[] = []; // coloured generic boxes (containers, awnings, warehouses)
  const silos: Placement[] = [];
  const poles: Placement[] = [];
  const cranes: Placement[] = [];
  const lot = (P - 2 * edge - 2.2) / 2;
  for (let gx = gx0; gx < gx1; gx++) for (let gy = gy0; gy < gy1; gy++) {
    const cx = (gx + 0.5) * P, cz = (gy + 0.5) * P;
    if (inPlaza(cx, cz)) continue;
    const al = track.alleys.find((a) => Math.hypot((a.ax + a.bx) / 2 - cx, (a.az + a.bz) / 2 - cz) < 6);
    if (al) {
      // an alley runs through this block: two long buildings flank it
      const across = P / 2 - edge - al.hh - 0.8, alongLen = P - 2 * edge;
      for (const sg of [-1, 1]) {
        const off = al.hh + 0.8 + across / 2;
        const h = (style === 'harbor' ? 10 : 18) + rng() * (style === 'harbor' ? 12 : 55);
        const alongX = Math.abs(al.dx) > 0.5;
        towers.push({ x: cx + al.px * sg * off, y: 0.07, z: cz + al.pz * sg * off, rot: 0, sx: alongX ? alongLen : across, sy: h, sz: alongX ? across : alongLen });
      }
      continue;
    }
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const w = lot * (0.82 + rng() * 0.18), d = lot * (0.82 + rng() * 0.18);
      const lx = cx + (i ? 1 : -1) * (lot / 2 + 1.1), lz = cz + (j ? 1 : -1) * (lot / 2 + 1.1);
      const r = rng();
      if (style === 'harbor') {
        if (r < 0.5) {
          // container yard: rows of stacked boxes
          const cols = Math.max(2, Math.floor(w / 3.4));
          for (let a = 0; a < cols; a++) for (let b = 0; b < 2; b++) {
            const stack = 1 + Math.floor(rng() * rng() * 4);
            const col = new THREE.Color(CONTAINER[Math.floor(rng() * CONTAINER.length)]);
            for (let h = 0; h < stack; h++) boxesC.push({ x: lx - w / 2 + 1.8 + a * 3.3, y: 0.07 + h * 2.62, z: lz + (b ? 1 : -1) * (d / 4), rot: 0, sx: 2.5, sy: 2.55, sz: d / 2.2, color: col });
          }
        } else if (r < 0.78) {
          const h = 7 + rng() * 5;
          boxesC.push({ x: lx, y: 0.07, z: lz, rot: 0, sx: w, sy: h, sz: d, color: new THREE.Color(0x66707f).offsetHSL(0, 0, (rng() - 0.5) * 0.12) });
          signs.push({ x: lx, y: h + 0.1, z: lz, rot: 0, sx: w - 2, sy: 0.4, sz: 0.5, color: new THREE.Color(0xffb45a) });
        } else if (r < 0.9) {
          for (const [ox, oz] of [[-1, -1], [1, 1]]) {
            const hgt = 18 + rng() * 10;
            silos.push({ x: lx + ox * w * 0.24, y: 0.07, z: lz + oz * d * 0.24, rot: 0, sx: 7.5, sy: hgt, sz: 7.5 });
          }
        } else {
          const h = 20 + rng() * 18;
          towers.push({ x: lx, y: 0.07, z: lz, rot: 0, sx: w, sy: h, sz: d });
          crowns.push({ x: lx, y: h + 0.07, z: lz, rot: 0, sx: 1.2, sy: 2.4, sz: 1.2 });
        }
        if (rng() < 0.16) cranes.push({ x: lx, y: 0.07, z: lz, rot: rng() < 0.5 ? 0 : Math.PI / 2, sx: 1, sy: 1, sz: 1 });
        if (rng() < 0.4) poles.push({ x: lx + (i ? -1 : 1) * (w / 2 - 1), y: 0.07, z: lz + (j ? -1 : 1) * (d / 2 - 1), rot: 0, sx: 1, sy: 1, sz: 1 });
        continue;
      }
      const h = r < 0.12 ? 7 + rng() * 6 : style === 'day' ? 18 + rng() * rng() * 70 : 22 + rng() * rng() * 95;
      towers.push({ x: lx, y: 0.07, z: lz, rot: 0, sx: w, sy: h, sz: d });
      if (h > 20 && style === 'neon') crowns.push({ x: lx, y: h, z: lz, rot: 0, sx: 1.2, sy: 2.6, sz: 1.2 });
      const faceX = rng() < 0.5;
      const dirX = i ? 1 : -1, dirZ = j ? 1 : -1;
      if (style === 'neon' && rng() < 0.7) {
        const sh = 3 + rng() * 6, sw = 1.2 + rng() * 2.6, y = 5 + rng() * Math.min(h - 6, 20);
        const col = new THREE.Color(look.signs[Math.floor(rng() * look.signs.length)]);
        if (faceX) signs.push({ x: lx + dirX * (w / 2 + 0.2), y, z: lz + (rng() - 0.5) * (d - 3), rot: 0, sx: 0.35, sy: sh, sz: sw, color: col });
        else signs.push({ x: lx + (rng() - 0.5) * (w - 3), y, z: lz + dirZ * (d / 2 + 0.2), rot: 0, sx: sw, sy: sh, sz: 0.35, color: col });
      }
      if (style === 'day') {
        // shop awning and lit shop window on the facade facing the nearer street
        const col = new THREE.Color(AWNING[Math.floor(rng() * AWNING.length)]);
        const win2 = new THREE.Color(0xfff2c8);
        if (faceX) {
          boxesC.push({ x: lx + dirX * (w / 2 + 1.0), y: 3.3, z: lz, rot: 0, sx: 2.4, sy: 0.3, sz: d * 0.8, color: col });
          signs.push({ x: lx + dirX * (w / 2 + 0.1), y: 0.9, z: lz, rot: 0, sx: 0.2, sy: 2.3, sz: d * 0.76, color: win2 });
        } else {
          boxesC.push({ x: lx, y: 3.3, z: lz + dirZ * (d / 2 + 1.0), rot: 0, sx: w * 0.8, sy: 0.3, sz: 2.4, color: col });
          signs.push({ x: lx, y: 0.9, z: lz + dirZ * (d / 2 + 0.1), rot: 0, sx: w * 0.76, sy: 2.3, sz: 0.2, color: win2 });
        }
        if (rng() < 0.5) {
          const sc = new THREE.Color(look.signs[Math.floor(rng() * look.signs.length)]);
          const sy = 4.4 + rng() * 6;
          if (faceX) signs.push({ x: lx + dirX * (w / 2 + 0.2), y: sy, z: lz + (rng() - 0.5) * (d - 4), rot: 0, sx: 0.3, sy: 1.6, sz: 3.6, color: sc });
          else signs.push({ x: lx + (rng() - 0.5) * (w - 4), y: sy, z: lz + dirZ * (d / 2 + 0.2), rot: 0, sx: 3.6, sy: 1.6, sz: 0.3, color: sc });
        }
      }
    }
  }
  inst(towers, [{ geo: unitBox(), mat: towerMat }]);
  inst(crowns, [{ geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: style === 'harbor' ? 0xff4a3a : 0xff3fa6 }) }]);
  inst(signs, [{ geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0xffffff }), colored: true }]);
  inst(boxesC, [{ geo: unitBox(), mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true }), colored: true }]);
  inst(silos, [
    { geo: unitCyl(1, 1, 12), mat: new THREE.MeshStandardMaterial({ color: 0xcfd3da, roughness: 0.6, flatShading: true }), local: M(0, 0, 0, 1, 1, 1) },
    { geo: unitCyl(1.05, 1.05, 12), mat: new THREE.MeshStandardMaterial({ color: 0xd8503f, flatShading: true }), local: M(0, 0.82, 0, 1, 0.08, 1) },
  ]);
  // floodlight poles
  inst(poles, [
    { geo: unitCyl(0.2, 0.28, 6), mat: new THREE.MeshStandardMaterial({ color: 0x3a3f4a, flatShading: true }), local: M(0, 0, 0, 1, 16, 1) },
    { geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0xffe6b0 }), local: M(0, 16, 0, 2.6, 0.7, 1.2) },
  ]);
  // gantry cranes: two legs, cross beam, long boom, cabin
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xe8791f, roughness: 0.6, flatShading: true });
  inst(cranes, [
    { geo: unitBox(), mat: craneMat, local: M(-7, 0, -4, 1.6, 34, 1.6) },
    { geo: unitBox(), mat: craneMat, local: M(7, 0, -4, 1.6, 34, 1.6) },
    { geo: unitBox(), mat: craneMat, local: M(-7, 0, 4, 1.6, 34, 1.6) },
    { geo: unitBox(), mat: craneMat, local: M(7, 0, 4, 1.6, 34, 1.6) },
    { geo: unitBox(), mat: craneMat, local: M(0, 34, 0, 16, 2, 11) },
    { geo: unitBox(), mat: craneMat, local: M(0, 36, 0, 2, 2, 52) },
    { geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0xff5a3a }), local: M(0, 38, 24, 2.4, 0.6, 2.4) },
  ]);

  // ---- sunny downtown: street trees along the route ----
  if (style === 'day') {
    const trees: Placement[] = [];
    for (let s = 14; s < track.length - 10; s += 17) {
      const i = track.indexAt(s);
      if (Math.abs(track.curv[i]) > 0.03) continue;
      if (track.crossings.some((c) => Math.abs(c - s) < 15)) continue;
      for (const side of [-1, 1]) {
        const p = track.pointAt(s, side * (edge - 1.1));
        trees.push({ x: p.x, y: 0.07, z: p.z, rot: rng() * 6, sx: 1, sy: 1, sz: 1 });
      }
    }
    inst(trees, [
      { geo: unitCyl(0.18, 0.26, 6), mat: new THREE.MeshStandardMaterial({ color: 0x6b4a2e, flatShading: true }), local: M(0, 0, 0, 1, 3.2, 1) },
      { geo: new THREE.IcosahedronGeometry(1.9, 0), mat: new THREE.MeshStandardMaterial({ color: 0x3f9a4a, flatShading: true }), local: M(0, 4.2, 0) },
    ]);
  }

  // ---- plaza centrepiece ----
  const lampL = (y: number, sy: number) => M(0, y, 0, 1, sy, 1);
  for (const pz of plazas) {
    const radius = pz.r - edge;
    const plate = new THREE.Mesh(own(new THREE.CylinderGeometry(radius + 0.4, radius + 0.4, 0.14, 40)), own(new THREE.MeshStandardMaterial({ color: style === 'neon' ? 0x2c3150 : style === 'harbor' ? 0x6a6f7a : 0xd2d4da, roughness: 0.6, flatShading: true })));
    plate.position.set(pz.cx, 0.06, pz.cz); plate.receiveShadow = true; group.add(plate);
    if (style === 'harbor') {
      // lighthouse on a quay plinth
      const stripes = [0xf2f2f2, 0xd8382e, 0xf2f2f2, 0xd8382e];
      stripes.forEach((c, k) => {
        const seg = new THREE.Mesh(own(new THREE.CylinderGeometry(4.2 - k * 0.55, 4.5 - k * 0.55, 5, 12)), own(new THREE.MeshStandardMaterial({ color: c, flatShading: true })));
        seg.position.set(pz.cx, 2.5 + k * 5, pz.cz); seg.castShadow = true; group.add(seg);
      });
      const lampM = new THREE.Mesh(own(new THREE.CylinderGeometry(1.8, 1.8, 2.6, 10)), own(new THREE.MeshBasicMaterial({ color: 0xfff0a0 })));
      lampM.position.set(pz.cx, 22.4, pz.cz); group.add(lampM);
      const cap = new THREE.Mesh(own(new THREE.ConeGeometry(2.4, 2.2, 10)), own(new THREE.MeshStandardMaterial({ color: 0x3a3f4a, flatShading: true })));
      cap.position.set(pz.cx, 24.8, pz.cz); group.add(cap);
      const bollards: Placement[] = [];
      for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; bollards.push({ x: pz.cx + Math.cos(a) * (radius - 1.5), y: 0.07, z: pz.cz + Math.sin(a) * (radius - 1.5), rot: 0, sx: 1, sy: 1, sz: 1 }); }
      inst(bollards, [{ geo: unitCyl(0.3, 0.3, 6), mat: new THREE.MeshStandardMaterial({ color: 0xe8b21f, flatShading: true }), local: lampL(0, 1.1) }]);
      continue;
    }
    const waterCol = style === 'neon' ? 0x0b4a78 : 0x2a8cd8;
    const ring = new THREE.Mesh(own(new THREE.TorusGeometry(10.5, 0.45, 6, 36)), own(new THREE.MeshBasicMaterial({ color: style === 'neon' ? 0x19e6ff : 0xf2f2f2 })));
    ring.rotation.x = Math.PI / 2; ring.position.set(pz.cx, 0.55, pz.cz); group.add(ring);
    const water = new THREE.Mesh(own(new THREE.CylinderGeometry(10, 10, 0.5, 32)), own(new THREE.MeshStandardMaterial({ color: waterCol, emissive: style === 'neon' ? 0x0a5a9a : 0x0a3a6a, emissiveIntensity: style === 'neon' ? 0.9 : 0.35, roughness: 0.1, metalness: 0.4 })));
    water.position.set(pz.cx, 0.3, pz.cz); group.add(water);
    const stem = new THREE.Mesh(own(new THREE.CylinderGeometry(0.7, 1.4, 14, 8)), own(new THREE.MeshStandardMaterial({ color: 0xcfd6ee, metalness: 0.6, roughness: 0.3, flatShading: true })));
    stem.position.set(pz.cx, 7.2, pz.cz); stem.castShadow = true; group.add(stem);
    const orb = new THREE.Mesh(own(new THREE.IcosahedronGeometry(2.4, 0)), own(new THREE.MeshBasicMaterial({ color: style === 'neon' ? 0xff3fa6 : 0xffd24a })));
    orb.position.set(pz.cx, 15.4, pz.cz); group.add(orb);
    const lamps: Placement[] = [], trees: Placement[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      lamps.push({ x: pz.cx + Math.cos(a) * 16, z: pz.cz + Math.sin(a) * 16, rot: 0, sx: 1, sy: 1, sz: 1 });
      trees.push({ x: pz.cx + Math.cos(a + 0.31) * 21, z: pz.cz + Math.sin(a + 0.31) * 21, rot: 0, sx: 1, sy: 1, sz: 1 });
    }
    inst(lamps, [
      { geo: unitCyl(0.1, 0.12, 5), mat: new THREE.MeshStandardMaterial({ color: 0x2a2f3a }), local: lampL(0, 5) },
      { geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: style === 'neon' ? 0xffb8e6 : 0xfff0c0 }), local: M(0, 5, 0, 0.7, 0.35, 0.7) },
    ]);
    inst(trees, [
      { geo: unitCyl(0.18, 0.24, 5), mat: new THREE.MeshStandardMaterial({ color: 0x4a3a2a, flatShading: true }), local: lampL(0, 3) },
      { geo: new THREE.IcosahedronGeometry(1.7, 0), mat: new THREE.MeshStandardMaterial(style === 'neon' ? { color: 0xff7ac8, emissive: 0x6a1a4a, emissiveIntensity: 0.6, flatShading: true } : { color: 0x3f9a4a, flatShading: true }), local: lampL(3.6, 1) },
    ]);
  }
}
