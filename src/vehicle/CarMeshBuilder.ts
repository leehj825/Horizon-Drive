import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EquipmentId, Loadout } from '../data/equipment';

export interface CarModel {
  root: THREE.Group;
  body: THREE.Group;
  frontPivots: THREE.Object3D[];
  wheelMeshes: THREE.Object3D[];
  wheelRadius: number;
  tailMat: THREE.MeshStandardMaterial;
  suspensionSlot: THREE.Group;
  boosterSlot: THREE.Group;
  utilitySlot: THREE.Group;
  /** Repaint body and accent colour. */
  setPaint(color: number, accent: number): void;
  /** Swap the visible 3D attachments to match the equipped parts. */
  applyLoadout(loadout: Loadout): void;
  dispose(): void;
}

export type CarShape = 'coupe' | 'hatch' | 'muscle' | 'hyper';

export interface CarStyle {
  color: number;
  accent: number;
  ghost?: boolean;
  shape?: CarShape;
}

interface ShapeDims {
  len: number; width: number; bodyH: number; bodyY: number;
  hoodLen: number; hoodY: number; scoop: boolean;
  cabinW: number; cabinH: number; cabinLen: number; cabinZ: number; cabinY: number;
  wing: number; wingY: number; wheelR: number; wheelZ: number; wheelX: number;
}

const SHAPES: Record<CarShape, ShapeDims> = {
  coupe: { len: 4.3, width: 1.9, bodyH: 0.42, bodyY: 0.52, hoodLen: 1.3, hoodY: 0.78, scoop: false, cabinW: 1.5, cabinH: 0.5, cabinLen: 1.9, cabinZ: -0.25, cabinY: 0.98, wing: 1.7, wingY: 0.92, wheelR: 0.4, wheelZ: 1.4, wheelX: 0.98 },
  hatch: { len: 3.8, width: 1.85, bodyH: 0.46, bodyY: 0.56, hoodLen: 0.95, hoodY: 0.82, scoop: false, cabinW: 1.55, cabinH: 0.62, cabinLen: 2.2, cabinZ: -0.3, cabinY: 1.08, wing: 1.2, wingY: 1.22, wheelR: 0.42, wheelZ: 1.2, wheelX: 0.96 },
  muscle: { len: 4.7, width: 2.02, bodyH: 0.46, bodyY: 0.56, hoodLen: 2.0, hoodY: 0.82, scoop: true, cabinW: 1.6, cabinH: 0.48, cabinLen: 1.7, cabinZ: -0.55, cabinY: 1.0, wing: 1.9, wingY: 0.98, wheelR: 0.43, wheelZ: 1.55, wheelX: 1.04 },
  hyper: { len: 4.5, width: 2.0, bodyH: 0.34, bodyY: 0.44, hoodLen: 1.7, hoodY: 0.66, scoop: false, cabinW: 1.3, cabinH: 0.4, cabinLen: 1.7, cabinZ: -0.2, cabinY: 0.82, wing: 2.0, wingY: 1.0, wheelR: 0.42, wheelZ: 1.5, wheelX: 1.02 },
};

const mat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, metalness: 0.15, ...opts });

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Procedural low-poly car with dedicated slots for swappable equipment meshes. */
export function buildCar(style: CarStyle): CarModel {
  const geos: THREE.BufferGeometry[] = [];
  const bx = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
    const mesh = box(w, h, d, m, x, y, z);
    geos.push(mesh.geometry);
    return mesh;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const own: THREE.Material[] = [];
  const track = <T extends THREE.Material>(m: T): T => { own.push(m); return m; };
  const ghost = !!style.ghost;
  const ghostify = <T extends THREE.MeshStandardMaterial>(m: T): T => {
    if (ghost) { m.transparent = true; m.opacity = 0.38; m.depthWrite = false; }
    return track(m);
  };

  const paint = ghostify(mat(style.color, { roughness: 0.35, metalness: 0.35 }));
  const accent = ghostify(mat(style.accent, { emissive: style.accent, emissiveIntensity: 0.5 }));
  const dark = ghostify(mat(0x15171f, { roughness: 0.8 }));
  const glass = ghostify(mat(0x1d2a3c, { roughness: 0.15, metalness: 0.6 }));
  const tailMat = ghostify(mat(0xff2230, { emissive: 0xff1020, emissiveIntensity: 1.1 }));
  const headMat = ghostify(mat(0xfff6d6, { emissive: 0xfff0c0, emissiveIntensity: 1.6 }));

  // chassis
  const D = SHAPES[style.shape ?? 'coupe'];
  const hl = D.len / 2;
  body.add(bx(D.width, D.bodyH, D.len, paint, 0, D.bodyY, 0));
  body.add(bx(D.width - 0.2, 0.2, D.hoodLen, paint, 0, D.hoodY, hl - D.hoodLen / 2 - 0.1)); // hood
  if (D.scoop) body.add(bx(0.7, 0.14, 0.9, dark, 0, D.hoodY + 0.14, hl - D.hoodLen / 2 - 0.2));
  body.add(bx(D.cabinW, D.cabinH, D.cabinLen, glass, 0, D.cabinY, D.cabinZ)); // cabin glass
  body.add(bx(D.cabinW - 0.1, 0.07, D.cabinLen - 0.3, paint, 0, D.cabinY + D.cabinH / 2, D.cabinZ)); // roof
  body.add(bx(D.width + 0.06, 0.1, 0.35, dark, 0, 0.28, hl - 0.15)); // splitter
  body.add(bx(D.wing, 0.08, 0.5, accent, 0, D.wingY, -hl + 0.1)); // spoiler wing
  body.add(bx(0.1, 0.3, 0.12, dark, 0.6, D.wingY - 0.14, -hl + 0.15));
  body.add(bx(0.1, 0.3, 0.12, dark, -0.6, D.wingY - 0.14, -hl + 0.15));
  body.add(bx(0.7, 0.05, D.len - 0.7, accent, 0, D.bodyY + 0.23, 0.1)); // racing stripe on top of body
  for (const sx of [-0.62, 0.62]) {
    body.add(bx(0.5, 0.17, 0.08, tailMat, sx, D.bodyY + 0.1, -hl - 0.02));
    body.add(bx(0.42, 0.15, 0.08, headMat, sx, D.bodyY + 0.1, hl + 0.02));
  }

  // wheels
  const wheelR = D.wheelR;
  const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.34, 12);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.36, 6);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = ghostify(mat(0xc9ced8, { metalness: 0.7, roughness: 0.3 }));
  const frontPivots: THREE.Object3D[] = [];
  const wheelMeshes: THREE.Object3D[] = [];
  for (const [x, z, front] of [[-D.wheelX, D.wheelZ, true], [D.wheelX, D.wheelZ, true], [-D.wheelX, -D.wheelZ, false], [D.wheelX, -D.wheelZ, false]] as const) {
    const wheel = new THREE.Mesh(tireGeo, dark);
    wheel.add(new THREE.Mesh(hubGeo, hubMat));
    wheel.castShadow = true;
    if (front) {
      const pivot = new THREE.Group();
      pivot.position.set(x, wheelR, z);
      pivot.add(wheel);
      body.add(pivot);
      frontPivots.push(pivot);
    } else {
      wheel.position.set(x, wheelR, z);
      body.add(wheel);
    }
    wheelMeshes.push(wheel);
  }

  const suspensionSlot = new THREE.Group(); suspensionSlot.name = 'suspensionSlot';
  const boosterSlot = new THREE.Group(); boosterSlot.name = 'boosterSlot';
  boosterSlot.position.set(0, D.wingY + 0.08, -hl + 1.0);
  const utilitySlot = new THREE.Group(); utilitySlot.name = 'utilitySlot';
  body.add(suspensionSlot, boosterSlot, utilitySlot);

  geos.push(tireGeo, hubGeo);
  const lib: Record<EquipmentId, () => THREE.Group> = {
    susp_street: () => {
      const g = new THREE.Group();
      const skirt = ghostify(mat(0x20242f));
      const glow = ghostify(mat(0x19e6ff, { emissive: 0x19e6ff, emissiveIntensity: 1.4 }));
      for (const sx of [-1, 1]) {
        g.add(bx(0.14, 0.2, 2.6, skirt, sx * 1.02, 0.34, 0));
        g.add(bx(0.05, 0.05, 2.4, glow, sx * 1.1, 0.26, 0));
      }
      g.position.y = -0.03;
      return g;
    },
    susp_offroad: () => {
      const g = new THREE.Group();
      const m = ghostify(mat(0x3a3f4a, { roughness: 0.9 }));
      const lamp = ghostify(mat(0xfff1b0, { emissive: 0xffe08a, emissiveIntensity: 1.5 }));
      for (const [x, z] of [[-0.98, 1.4], [0.98, 1.4], [-0.98, -1.4], [0.98, -1.4]]) g.add(bx(0.46, 0.08, 0.95, m, x, 0.84, z));
      g.add(bx(1.5, 0.06, 1.5, m, 0, 1.31, -0.28));
      for (const sx of [-0.5, 0, 0.5]) g.add(bx(0.2, 0.14, 0.2, lamp, sx, 1.4, 0.4));
      g.position.y = 0.0;
      return g;
    },
    boost_twin: () => {
      const g = new THREE.Group();
      const tank = ghostify(mat(0x2b6cff, { metalness: 0.5, roughness: 0.3 }));
      const cap = ghostify(mat(0x9fe8ff, { emissive: 0x6fd6ff, emissiveIntensity: 1.3 }));
      const geo = new THREE.CylinderGeometry(0.19, 0.19, 1.3, 10); geo.rotateX(Math.PI / 2); geos.push(geo);
      const capGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10); capGeo.rotateX(Math.PI / 2); geos.push(capGeo);
      for (const sx of [-0.4, 0.4]) {
        const t = new THREE.Mesh(geo, tank); t.position.set(sx, 0, 0); t.castShadow = true;
        const c = new THREE.Mesh(capGeo, cap); c.position.set(sx, 0, -0.68);
        g.add(t, c);
      }
      return g;
    },
    boost_drift: () => {
      const g = new THREE.Group();
      const fin = ghostify(mat(0xff3fa6, { emissive: 0xff2a85, emissiveIntensity: 1.1 }));
      const base = ghostify(mat(0x20242f));
      g.add(bx(1.2, 0.12, 0.6, base, 0, 0, 0));
      for (const sx of [-0.5, -0.25, 0.25, 0.5]) g.add(bx(0.07, 0.45, 0.5, fin, sx, 0.26, 0));
      return g;
    },
    util_magnet: () => {
      const g = new THREE.Group();
      const m = ghostify(mat(0xffc400, { emissive: 0xff9d00, emissiveIntensity: 0.9, metalness: 0.6 }));
      const geo = new THREE.TorusGeometry(0.34, 0.1, 6, 12); geos.push(geo);
      const ring = new THREE.Mesh(geo, m);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 1.55, 0.1);
      g.add(ring);
      g.add(bx(0.12, 0.3, 0.12, ghostify(mat(0x20242f)), 0, 1.38, 0.1));
      return g;
    },
    util_bumper: () => {
      const g = new THREE.Group();
      const m = ghostify(mat(0x3a3f4a, { metalness: 0.7, roughness: 0.35 }));
      const spike = ghostify(mat(0xff5a36, { emissive: 0xff3a10, emissiveIntensity: 0.9 }));
      g.add(bx(D.width + 0.2, 0.26, 0.3, m, 0, 0.42, hl + 0.21));
      const geo = new THREE.ConeGeometry(0.1, 0.35, 5); geo.rotateX(Math.PI / 2); geos.push(geo);
      for (const sx of [-0.8, -0.4, 0, 0.4, 0.8]) { const s = new THREE.Mesh(geo, spike); s.position.set(sx, 0.42, hl + 0.55); g.add(s); }
      return g;
    },
  };

  const model: CarModel = {
    root, body, frontPivots, wheelMeshes, wheelRadius: wheelR, tailMat, suspensionSlot, boosterSlot, utilitySlot,
    setPaint(color: number, accentColor: number) {
      paint.color.setHex(color);
      accent.color.setHex(accentColor); accent.emissive.setHex(accentColor);
    },
    applyLoadout(loadout: Loadout) {
      for (const slot of [suspensionSlot, boosterSlot, utilitySlot]) slot.clear();
      const s = loadout.suspension, b = loadout.booster, u = loadout.utility;
      if (s && lib[s]) suspensionSlot.add(lib[s]());
      if (b && lib[b]) {
        const g = lib[b]();
        boosterSlot.add(g);
      }
      if (u && lib[u]) utilitySlot.add(lib[u]());
      // off-road lift raises the body a little, low-kit lowers it
      body.position.y = s === 'susp_offroad' ? 0.14 : s === 'susp_street' ? -0.05 : 0;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of own) m.dispose();
    },
  };
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && ghost) (o as THREE.Mesh).castShadow = false; });
  return model;
}


export type LiteKind = 'sedan' | 'taxi' | 'van' | 'hatch';

let liteBodyMat: THREE.MeshStandardMaterial | null = null;
let liteHeadMat: THREE.MeshStandardMaterial | null = null;

/**
 * Cheap civilian car for traffic: the whole body is merged into one vertex-coloured mesh (+ one tail-light mesh and
 * one headlight mesh), so 20 cars cost about 60 draw calls instead of ~700. Wheels do not spin.
 */
export function buildLiteCar(kind: LiteKind, color: number): CarModel {
  liteBodyMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.2 });
  liteHeadMat ??= new THREE.MeshStandardMaterial({ color: 0xfff6d6, emissive: 0xfff0c0, emissiveIntensity: 1.5, flatShading: true });
  const parts: THREE.BufferGeometry[] = [];
  const tails: THREE.BufferGeometry[] = [];
  const heads: THREE.BufferGeometry[] = [];
  const add = (list: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, col: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const c = new THREE.Color(col);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    list.push(g);
  };
  const glass = 0x1d2a3c, dark = 0x15171f;
  const van = kind === 'van';
  const len = van ? 4.8 : kind === 'hatch' ? 3.8 : 4.3;
  const bodyH = van ? 1.25 : 0.42;
  add(parts, 1.9, bodyH, len, 0, van ? 0.92 : 0.52, 0, color);
  if (van) {
    add(parts, 1.7, 0.5, 1.0, 0, 1.75, 1.4, glass);
  } else {
    add(parts, 1.7, 0.2, 1.3, 0, 0.78, len * 0.31, color);
    add(parts, 1.5, 0.5, kind === 'hatch' ? 1.9 : 1.9, 0, 0.98, -0.25, glass);
    add(parts, 1.4, 0.07, 1.6, 0, 1.25, -0.28, color);
  }
  if (kind === 'taxi') add(parts, 0.6, 0.2, 0.3, 0, 1.4, -0.3, 0xfff2a8);
  add(parts, 1.96, 0.1, 0.35, 0, 0.28, len / 2 - 0.15, dark);
  for (const [x, z] of [[-0.98, 1.4], [0.98, 1.4], [-0.98, -1.4], [0.98, -1.4]] as const) add(parts, 0.34, 0.8, 0.8, x, 0.4, z * (len / 4.3), dark);
  for (const sx of [-0.62, 0.62]) {
    add(tails, 0.5, 0.17, 0.08, sx, van ? 0.9 : 0.62, -len / 2 - 0.02, 0xff2230);
    add(heads, 0.42, 0.15, 0.08, sx, van ? 0.9 : 0.62, len / 2 + 0.02, 0xfff6d6);
  }
  const bodyGeo = mergeGeometries(parts, false)!;
  const tailGeo = mergeGeometries(tails, false)!;
  const headGeo = mergeGeometries(heads, false)!;
  for (const g of [...parts, ...tails, ...heads]) g.dispose();
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2230, emissive: 0xff1020, emissiveIntensity: 1.1, flatShading: true });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bm = new THREE.Mesh(bodyGeo, liteBodyMat);
  bm.castShadow = true;
  body.add(bm, new THREE.Mesh(tailGeo, tailMat), new THREE.Mesh(headGeo, liteHeadMat));
  const none = () => new THREE.Group();
  return {
    root, body, frontPivots: [], wheelMeshes: [], wheelRadius: 0.4, tailMat,
    suspensionSlot: none(), boosterSlot: none(), utilitySlot: none(),
    setPaint() { /* civilians keep their colour */ },
    applyLoadout() { /* civilians carry no equipment */ },
    dispose() { bodyGeo.dispose(); tailGeo.dispose(); headGeo.dispose(); tailMat.dispose(); },
  };
}
