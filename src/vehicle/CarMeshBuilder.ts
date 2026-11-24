import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  /** Scorch the paint and crack the windscreen as the car takes damage (0..1). */
  setDamage?(damage: number): void;
  /** Neon glow under the car. */
  setUnderglow?(on: boolean): void;
  dispose(): void;
}

export type CarShape = 'coupe' | 'hatch' | 'muscle' | 'hyper';

export interface CarStyle {
  color: number;
  accent: number;
  ghost?: boolean;
  shape?: CarShape;
  /** Race number on the doors. */
  number?: number;
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

/** How far the rear window leans back (bigger = fastback). */
const RAKE: Record<CarShape, number> = { coupe: 0.3, hatch: 0.1, muscle: 0.45, hyper: 0.5 };

// ---------------------------------------------------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------------------------------------------------

const mat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, metalness: 0.15, ...opts });

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Reflection source shared by every car material that wants reflections (set once per world). */
let carEnv: THREE.Texture | null = null;
const envMats = new Set<THREE.MeshStandardMaterial>();

export function setCarEnvMap(tex: THREE.Texture | null): void {
  carEnv = tex;
  for (const m of envMats) { m.envMap = tex; m.needsUpdate = true; }
}

function withEnv<T extends THREE.MeshStandardMaterial>(m: T, intensity: number): T {
  m.envMap = carEnv;
  m.envMapIntensity = intensity;
  envMats.add(m);
  return m;
}

const _c = new THREE.Color();

/** Bake a flat colour into a geometry (as a vertex colour) in a form that merges with every other part. */
function tint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  let ng = g;
  if (g.index) { ng = g.toNonIndexed(); g.dispose(); }
  ng.deleteAttribute('uv');
  const n = ng.getAttribute('position').count;
  _c.setHex(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}

class Parts {
  readonly list: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: number): void { this.list.push(tint(g, color)); }
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    this.add(g, color);
  }
  /** Thin slab following the line (z0,y0)→(z1,y1): used for stripes laid on a sloped surface. */
  bar(z0: number, y0: number, z1: number, y1: number, w: number, h: number, x: number, color: number): void {
    const len = Math.hypot(z1 - z0, y1 - y0);
    const g = new THREE.BoxGeometry(w, h, len);
    g.rotateX(-Math.atan2(y1 - y0, z1 - z0));
    g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, color);
  }
  cyl(r: number, len: number, x: number, y: number, z: number, color: number, seg = 10): void {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    this.add(g, color);
  }
  merge(): THREE.BufferGeometry | null {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list, false);
    for (const p of this.list) p.dispose();
    this.list.length = 0;
    return g;
  }
}

type Pt = [number, number, number?];

/** Side profile (z forward, y up, optional corner radius) extruded sideways into a rounded, bevelled solid. */
function extrudeProfile(pts: Pt[], width: number, bevel = 0.05, curveSegs = 3): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [z, y, r = 0] = pts[i];
    const [pz, py] = pts[(i + n - 1) % n];
    const [nz, ny] = pts[(i + 1) % n];
    if (r <= 0) { if (i === 0) shape.moveTo(z, y); else shape.lineTo(z, y); continue; }
    const l1 = Math.hypot(pz - z, py - y), l2 = Math.hypot(nz - z, ny - y);
    const t1 = Math.min(0.48, r / l1), t2 = Math.min(0.48, r / l2);
    const sx = z + (pz - z) * t1, sy = y + (py - y) * t1;
    const ex = z + (nz - z) * t2, ey = y + (ny - y) * t2;
    if (i === 0) shape.moveTo(sx, sy); else shape.lineTo(sx, sy);
    shape.quadraticCurveTo(z, y, ex, ey);
  }
  shape.closePath();
  const bt = Math.min(bevel, width * 0.25);
  const depth = width - 2 * bt;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: curveSegs });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  const out = toCreasedNormals(g, 0.7);
  g.dispose();
  return out;
}

interface Kin {
  hl: number; deckY: number; hoodTop: number; cabinTop: number; cf: number; cr: number; noseTop: number; rake: number;
}

function kinOf(D: ShapeDims, rake: number): Kin {
  const belt = D.bodyY + D.bodyH / 2;
  const hoodTop = D.hoodY + 0.1;
  return {
    hl: D.len / 2, deckY: belt + 0.04, hoodTop, cabinTop: D.cabinY + D.cabinH / 2 + 0.035,
    cf: D.cabinZ + D.cabinLen / 2, cr: D.cabinZ - D.cabinLen / 2, noseTop: hoodTop - 0.2, rake,
  };
}

/** Paint-coloured shell: lower body + roof slab. */
function hullGeos(D: ShapeDims, K: Kin): THREE.BufferGeometry[] {
  const { hl, deckY, hoodTop, cabinTop, cf, cr, noseTop, rake } = K;
  const hull = extrudeProfile([
    [-hl, 0.3, 0.04], [hl - 0.08, 0.3, 0.06], [hl, 0.42, 0.1], [hl, noseTop, 0.12],
    [hl - 0.55, hoodTop - 0.06, 0.35], [cf + 0.3, hoodTop, 0.25],
    [cr - 0.2, deckY, 0.2], [-hl + 0.35, deckY, 0.25], [-hl, deckY - 0.1, 0.12],
  ], D.width, 0.06);
  const roofFront = cf - 0.2, roofRear = cr + rake;
  const roof = extrudeProfile([
    [roofRear - 0.03, cabinTop - 0.07, 0.02], [roofFront + 0.04, cabinTop - 0.07, 0.02],
    [roofFront + 0.04, cabinTop + 0.01, 0.05], [roofRear - 0.03, cabinTop + 0.01, 0.05],
  ], D.cabinW + 0.08, 0.025, 2);
  return [hull, roof];
}

function glassGeo(D: ShapeDims, K: Kin): THREE.BufferGeometry {
  const { deckY, hoodTop, cabinTop, cf, cr, rake } = K;
  return extrudeProfile([
    [cf + 0.3, hoodTop - 0.05, 0.05], [cf - 0.2, cabinTop - 0.02, 0.1],
    [cr + rake, cabinTop - 0.02, 0.1], [cr - 0.2, deckY - 0.03, 0.05],
  ], D.cabinW, 0.03, 2);
}

/** Dark/chrome details common to every car (grille, splitter, diffuser, mirrors, door seams, arch shadows…). */
function trimParts(p: Parts, D: ShapeDims, K: Kin): void {
  const { hl, deckY, hoodTop, noseTop, cf, cr } = K;
  const hw = D.width / 2;
  p.box(D.width * 0.58, 0.14, 0.05, 0, noseTop - 0.14, hl - 0.005, 0x0b0c10); // grille
  p.box(D.width * 0.74, 0.07, 0.05, 0, 0.4, hl - 0.005, 0x0b0c10); // lower intake
  p.box(D.width + 0.06, 0.07, 0.4, 0, 0.3, hl - 0.12, 0x15171f); // splitter
  p.box(D.width * 0.72, 0.12, 0.34, 0, 0.35, -hl + 0.1, 0x15171f); // diffuser
  for (const sx of [-0.45, 0.45]) p.cyl(0.055, 0.2, sx, 0.34, -hl - 0.03, 0xb9bec8, 8); // exhausts
  for (const sx of [-1, 1]) {
    p.box(0.06, 0.09, D.wheelZ * 2 - 0.35, sx * (hw + 0.01), 0.33, 0, 0x15171f); // side skirts
    p.box(0.1, 0.1, 0.18, sx * (D.cabinW / 2 + 0.1), hoodTop + 0.1, cf - 0.05, 0x15171f); // mirrors
    p.box(0.012, 0.3, 0.02, sx * (hw + 0.002), deckY - 0.2, cf - 0.45, 0x0b0c10); // door seams
    p.box(0.012, 0.3, 0.02, sx * (hw + 0.002), deckY - 0.2, cr + 0.3, 0x0b0c10);
    p.box(0.02, 0.025, 0.14, sx * (hw + 0.01), deckY - 0.1, cr + 0.45, 0xb9bec8); // handle
    for (const z of [D.wheelZ, -D.wheelZ]) { // shadowed wheel arch above each wheel
      const g = new THREE.CircleGeometry(D.wheelR + 0.07, 14, 0, Math.PI);
      g.rotateY(sx * Math.PI / 2);
      g.translate(sx * (hw + 0.012), D.wheelR, z);
      p.add(g, 0x08090c);
    }
  }
  p.box(0.5, 0.11, 0.02, 0, deckY - 0.2, -hl - 0.01, 0xe9ecef); // number plate
}

function lightParts(tail: Parts, head: Parts, D: ShapeDims, K: Kin): void {
  const { hl, deckY, noseTop } = K;
  tail.box(D.width - 0.62, 0.06, 0.05, 0, deckY - 0.1, -hl + 0.005, 0xff2230); // LED bar
  for (const sx of [-1, 1]) {
    tail.box(0.38, 0.13, 0.05, sx * (D.width / 2 - 0.3), deckY - 0.1, -hl + 0.005, 0xff2230);
    head.box(0.44, 0.1, 0.05, sx * 0.62, noseTop - 0.04, hl - 0.005, 0xfff6d6);
    head.box(0.2, 0.04, 0.05, sx * 0.86, noseTop - 0.14, hl - 0.005, 0xfff6d6);
  }
}

// --- procedural textures (browser only) ----------------------------------------------------------------------------

const texCache = new Map<string, THREE.Texture>();

function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return null;
  draw(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

const glowTex = () => canvasTex('glow', 64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});

const crackTex = () => canvasTex('crack', 128, (g, s) => {
  g.strokeStyle = 'rgba(235,245,255,0.9)'; g.lineWidth = 1.4;
  const cx = s * 0.62, cy = s * 0.4;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 11; i++) {
    let x = cx, y = cy, a = rnd() * Math.PI * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { a += (rnd() - 0.5) * 0.9; const l = 8 + rnd() * 16; x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); }
    g.stroke();
  }
});

const numberTex = (n: number) => canvasTex('num' + n, 64, (g, s) => {
  g.fillStyle = '#f4f6f8'; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#101218'; g.font = `bold ${s * 0.56}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), s / 2, s / 2 + 3);
});

// ---------------------------------------------------------------------------------------------------------------------
// player / rival cars
// ---------------------------------------------------------------------------------------------------------------------

/** Procedural car with rounded bodywork, detailed wheels and dedicated slots for swappable equipment meshes. */
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
  const shapeId = style.shape ?? 'coupe';
  const D = SHAPES[shapeId];
  const K = kinOf(D, RAKE[shapeId]);
  const { hl } = K;

  const smooth = { flatShading: false } as const;
  const paint = ghostify(withEnv(mat(style.color, { ...smooth, roughness: 0.28, metalness: 0.45 }), 1.0));
  const accent = ghostify(mat(style.accent, { ...smooth, vertexColors: true, emissive: style.accent, emissiveIntensity: 0.22, roughness: 0.4 }));
  const trimMat = ghostify(withEnv(mat(0xffffff, { ...smooth, vertexColors: true, roughness: 0.55, metalness: 0.3 }), 0.5));
  const glass = ghostify(withEnv(mat(0x0d1520, { ...smooth, roughness: 0.04, metalness: 0.92 }), 1.3));
  const tailMat = ghostify(mat(0xff2230, { ...smooth, vertexColors: true, emissive: 0xff1020, emissiveIntensity: 1.1 }));
  const headMat = ghostify(mat(0xfff6d6, { ...smooth, vertexColors: true, emissive: 0xfff0c0, emissiveIntensity: 1.6 }));
  const tireMat = ghostify(mat(0x16181d, { ...smooth, roughness: 0.9, metalness: 0 }));
  const rimMat = ghostify(withEnv(mat(0xffffff, { ...smooth, vertexColors: true, roughness: 0.25, metalness: 0.85 }), 1.0));

  const addMesh = (g: THREE.BufferGeometry | null, m: THREE.Material, shadow = true): THREE.Mesh | null => {
    if (!g) return null;
    geos.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shadow && !ghost;
    body.add(mesh);
    return mesh;
  };

  // painted shell (lower body + roof) and glass
  const hullParts = hullGeos(D, K).map((g) => g);
  addMesh(mergeGeometries(hullParts.map((g) => { const t = g.clone(); t.deleteAttribute('uv'); return t; }), false), paint);
  for (const g of hullParts) g.dispose();
  addMesh(glassGeo(D, K), glass, false);

  // trim (grille, splitter, mirrors, seams, plate…) + hood scoop
  const trim = new Parts();
  trimParts(trim, D, K);
  if (D.scoop) trim.box(0.7, 0.14, 0.9, 0, D.hoodY + 0.14, hl - D.hoodLen / 2 - 0.2, 0x0b0c10);
  addMesh(trim.merge(), trimMat);

  // accent: racing stripes along hood/roof/deck + the rear wing
  const acc = new Parts();
  const hz0 = hl - 0.55, hz1 = K.cf + 0.3; // hood surface runs from (hz0, hoodTop-0.06) up to (hz1, hoodTop)
  const hoodY = (z: number) => K.hoodTop - 0.06 + ((hz0 - z) / (hz0 - hz1)) * 0.06;
  const hoodA = [hl - 0.8, hoodY(hl - 0.8)], hoodB = [K.cf + 0.45, hoodY(K.cf + 0.45)];
  for (const sx of [-0.17, 0.17]) {
    acc.bar(hoodA[0], hoodA[1] + 0.03, hoodB[0], hoodB[1] + 0.03, 0.13, 0.012, sx, 0xffffff);
    acc.bar(K.cr + K.rake - 0.0, K.cabinTop + 0.016, K.cf - 0.2, K.cabinTop + 0.016, 0.13, 0.012, sx, 0xffffff);
    acc.bar(K.cr - 0.45, K.deckY + 0.014, -hl + 0.5, K.deckY + 0.014, 0.13, 0.012, sx, 0xffffff);
  }
  acc.add(new THREE.BoxGeometry(D.wing, 0.06, 0.5).rotateX(0.08).translate(0, D.wingY, -hl + 0.1), 0xffffff);
  addMesh(acc.merge(), accent);
  const wingParts = new Parts();
  for (const sx of [-0.6, 0.6]) wingParts.box(0.1, 0.3, 0.12, sx, D.wingY - 0.14, -hl + 0.15, 0x15171f);
  for (const sx of [-1, 1]) wingParts.box(0.04, 0.2, 0.55, sx * (D.wing / 2), D.wingY + 0.04, -hl + 0.1, 0x15171f);
  addMesh(wingParts.merge(), trimMat);

  // lights
  const tailP = new Parts(), headP = new Parts();
  lightParts(tailP, headP, D, K);
  addMesh(tailP.merge(), tailMat, false);
  addMesh(headP.merge(), headMat, false);

  // soft glow behind the lights, and neon underglow (both additive)
  const glowMats: THREE.MeshBasicMaterial[] = [];
  const decalGeos: THREE.BufferGeometry[] = [];
  let underglow: THREE.Mesh | null = null;
  let underMat: THREE.MeshBasicMaterial | null = null;
  const crackMat = new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false });
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), crackMat);
  if (!ghost) {
    const tex = glowTex();
    const glowMat = (color: number, opacity: number) => {
      const m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      glowMats.push(m);
      return m;
    };
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    decalGeos.push(planeGeo);
    const tailGlow = glowMat(0xff2030, 0.6);
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(planeGeo, tailGlow);
      t.scale.set(0.95, 0.6, 1); t.position.set(sx * (D.width / 2 - 0.35), K.deckY - 0.1, -hl - 0.06); t.rotation.y = Math.PI;
      t.onBeforeRender = () => { tailGlow.opacity = THREE.MathUtils.clamp((tailMat.emissiveIntensity - 0.4) / 3.2, 0.12, 1) * 0.85; };
      const h = new THREE.Mesh(planeGeo, glowMat(0xfff0c0, 0.5));
      h.scale.set(0.8, 0.5, 1); h.position.set(sx * 0.62, K.noseTop - 0.04, hl + 0.06);
      body.add(t, h);
    }
    underMat = glowMat(style.accent, 0.7);
    underglow = new THREE.Mesh(planeGeo, underMat);
    underglow.rotation.x = -Math.PI / 2;
    underglow.scale.set(D.width + 1.2, D.len + 1.0, 1);
    underglow.position.y = 0.05;
    underglow.visible = false;
    root.add(underglow);

    // race number roundels on the doors
    const num = style.number ?? 1 + ((style.color >> 4) % 98);
    const nt = numberTex(num);
    if (nt) {
      const nm = track(new THREE.MeshStandardMaterial({ map: nt, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
      const ng = new THREE.PlaneGeometry(0.34, 0.34);
      geos.push(ng);
      for (const sx of [-1, 1]) {
        const d = new THREE.Mesh(ng, nm);
        d.rotation.y = sx * Math.PI / 2;
        d.position.set(sx * (D.width / 2 + 0.012), K.deckY - 0.17, K.cr + 0.85);
        body.add(d);
      }
    }
    // windscreen crack overlay, laid along the glass slope
    const base = [K.cf + 0.3, K.hoodTop - 0.05], top = [K.cf - 0.2, K.cabinTop - 0.02];
    const dz = base[0] - top[0], dy = top[1] - base[1];
    const L = Math.hypot(dz, dy);
    crack.scale.set(D.cabinW * 0.85, L * 0.9, 1);
    crack.rotation.x = Math.atan2(-dz, dy);
    const nrm = new THREE.Vector3(0, dz / L, dy / L);
    crack.position.set(0, (base[1] + top[1]) / 2, (base[0] + top[0]) / 2).addScaledVector(nrm, 0.02);
    crack.visible = false;
    decalGeos.push(crack.geometry);
    body.add(crack);
  }

  // wheels: rounded tyre + rim (barrel, face, spokes, lip, hub) merged into one mesh
  const wheelR = D.wheelR;
  const lathe: THREE.Vector2[] = [
    [0.62, -0.15], [0.9, -0.15], [0.97, -0.12], [1, -0.07], [1, 0.07], [0.97, 0.12], [0.9, 0.15], [0.62, 0.15],
  ].map(([r, a]) => new THREE.Vector2(r * wheelR, a));
  const tireGeo = new THREE.LatheGeometry(lathe, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const rp = new Parts();
  rp.cyl(wheelR * 0.6, 0.2, 0, 0, 0, 0x23262d, 18);
  for (const sx of [-1, 1]) {
    rp.cyl(wheelR * 0.5, 0.04, sx * 0.1, 0, 0, 0x7b818c, 14); // brake disc
    for (let k = 0; k < 5; k++) {
      const g = new THREE.BoxGeometry(0.035, wheelR * 1.1, 0.07);
      g.rotateX(k * Math.PI / 5 + (sx > 0 ? 0 : Math.PI / 10));
      g.translate(sx * 0.115, 0, 0);
      rp.add(g, 0xdfe3ea);
    }
    const lip = new THREE.TorusGeometry(wheelR * 0.6, 0.022, 6, 18);
    lip.rotateY(Math.PI / 2); lip.translate(sx * 0.105, 0, 0);
    rp.add(lip, 0xcfd4dc);
  }
  rp.cyl(wheelR * 0.14, 0.3, 0, 0, 0, 0xeef1f5, 8);
  const rimGeo = rp.merge()!;
  geos.push(tireGeo, rimGeo);
  const frontPivots: THREE.Object3D[] = [];
  const wheelMeshes: THREE.Object3D[] = [];
  for (const [x, z, front] of [[-D.wheelX, D.wheelZ, true], [D.wheelX, D.wheelZ, true], [-D.wheelX, -D.wheelZ, false], [D.wheelX, -D.wheelZ, false]] as const) {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = !ghost;
    wheel.add(tire, new THREE.Mesh(rimGeo, rimMat));
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

  const baseColor = new THREE.Color(style.color);
  const soot = new THREE.Color(0x1b1612);
  let lastDamage = -1;
  const model: CarModel = {
    root, body, frontPivots, wheelMeshes, wheelRadius: wheelR, tailMat, suspensionSlot, boosterSlot, utilitySlot,
    setPaint(color: number, accentColor: number) {
      baseColor.setHex(color);
      paint.color.copy(baseColor);
      lastDamage = -1;
      accent.color.setHex(accentColor); accent.emissive.setHex(accentColor);
      underMat?.color.setHex(accentColor);
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
    setDamage(d: number) {
      if (Math.abs(d - lastDamage) < 0.01) return;
      lastDamage = d;
      paint.color.copy(baseColor).lerp(soot, d * 0.55);
      paint.roughness = 0.28 + d * 0.45;
      paint.metalness = 0.45 - d * 0.25;
      crack.visible = d > 0.4;
      crackMat.opacity = Math.min(1, (d - 0.4) * 2);
    },
    setUnderglow(on: boolean) { if (underglow) underglow.visible = on; },
    dispose() {
      for (const g of geos) g.dispose();
      for (const g of decalGeos) g.dispose();
      for (const m of own) { envMats.delete(m as THREE.MeshStandardMaterial); m.dispose(); }
      for (const m of glowMats) m.dispose();
      crackMat.dispose();
    },
  };
  return model;
}

// ---------------------------------------------------------------------------------------------------------------------
// civilian traffic
// ---------------------------------------------------------------------------------------------------------------------

export type LiteKind = 'sedan' | 'taxi' | 'van' | 'hatch';

let liteBodyMat: THREE.MeshStandardMaterial | null = null;
let liteHeadMat: THREE.MeshStandardMaterial | null = null;
const liteCache = new Map<string, { body: THREE.BufferGeometry; tail: THREE.BufferGeometry; head: THREE.BufferGeometry }>();

function liteGeometry(kind: LiteKind, color: number) {
  const key = `${kind}|${color}`;
  const hit = liteCache.get(key);
  if (hit) return hit;
  const glassC = 0x141d2b, dark = 0x15171f;
  const body = new Parts(), tail = new Parts(), head = new Parts();
  let len: number;
  if (kind === 'van') {
    len = 4.8;
    const hl = len / 2;
    body.add(extrudeProfile([
      [-hl, 0.3, 0.05], [hl - 0.08, 0.3, 0.06], [hl, 0.42, 0.1], [hl, 0.8, 0.14], [hl - 0.5, 1.05, 0.3], [1.3, 1.12, 0.2],
      [0.95, 1.9, 0.22], [-hl + 0.1, 1.95, 0.14], [-hl, 1.7, 0.1],
    ], 1.9, 0.07), color);
    body.add(extrudeProfile([[1.32, 1.1, 0.04], [0.97, 1.8, 0.08], [0.4, 1.8, 0.08], [0.4, 1.1, 0.04]], 1.94, 0.03, 2), glassC);
    body.box(1.96, 0.1, 0.4, 0, 0.3, hl - 0.12, dark);
    body.box(1.1, 0.12, 0.05, 0, 0.62, hl - 0.005, 0x0b0c10);
    for (const sx of [-1, 1]) {
      tail.box(0.2, 0.5, 0.05, sx * 0.8, 1.0, -hl + 0.005, 0xff2230);
      head.box(0.44, 0.12, 0.05, sx * 0.62, 0.78, hl - 0.005, 0xfff6d6);
    }
    for (const [x, z] of [[-0.98, 1.5], [0.98, 1.5], [-0.98, -1.5], [0.98, -1.5]] as const) {
      body.cyl(0.4, 0.3, x, 0.4, z, 0x16181d, 10);
      body.cyl(0.24, 0.32, x, 0.4, z, 0x9aa0aa, 8);
    }
  } else {
    const shape: CarShape = kind === 'hatch' ? 'hatch' : 'coupe';
    const D = SHAPES[shape];
    const K = kinOf(D, RAKE[shape]);
    len = D.len;
    for (const g of hullGeos(D, K)) body.add(g, color);
    body.add(glassGeo(D, K), glassC);
    trimParts(body, D, K);
    lightParts(tail, head, D, K);
    if (kind === 'taxi') body.box(0.6, 0.18, 0.3, 0, K.cabinTop + 0.1, D.cabinZ, 0xfff2a8);
    for (const [x, z] of [[-D.wheelX, D.wheelZ], [D.wheelX, D.wheelZ], [-D.wheelX, -D.wheelZ], [D.wheelX, -D.wheelZ]] as const) {
      body.cyl(D.wheelR, 0.3, x, D.wheelR, z, 0x16181d, 10);
      body.cyl(D.wheelR * 0.6, 0.32, x, D.wheelR, z, 0x9aa0aa, 8);
    }
  }
  void len;
  const out = { body: body.merge()!, tail: tail.merge()!, head: head.merge()! };
  liteCache.set(key, out);
  return out;
}

/**
 * Cheap civilian car for traffic: the whole body is merged into one vertex-coloured mesh (+ one tail-light mesh and
 * one headlight mesh), so 20 cars cost about 60 draw calls instead of ~700. Wheels do not spin. Geometry is cached
 * per kind and colour.
 */
export function buildLiteCar(kind: LiteKind, color: number): CarModel {
  liteBodyMat ??= withEnv(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.35 }), 0.7);
  liteHeadMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xfff0c0, emissiveIntensity: 1.5 });
  const geo = liteGeometry(kind, color);
  const tailMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xff1020, emissiveIntensity: 1.1 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bm = new THREE.Mesh(geo.body, liteBodyMat);
  bm.castShadow = true;
  body.add(bm, new THREE.Mesh(geo.tail, tailMat), new THREE.Mesh(geo.head, liteHeadMat));
  const none = () => new THREE.Group();
  return {
    root, body, frontPivots: [], wheelMeshes: [], wheelRadius: 0.4, tailMat,
    suspensionSlot: none(), boosterSlot: none(), utilitySlot: none(),
    setPaint() { /* civilians keep their colour */ },
    applyLoadout() { /* civilians carry no equipment */ },
    dispose() { tailMat.dispose(); },
  };
}
