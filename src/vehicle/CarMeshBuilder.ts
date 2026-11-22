import * as THREE from 'three';
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
  /** Swap the visible 3D attachments to match the equipped parts. */
  applyLoadout(loadout: Loadout): void;
  dispose(): void;
}

export interface CarStyle {
  color: number;
  accent: number;
  ghost?: boolean;
}

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
  body.add(bx(1.9, 0.42, 4.3, paint, 0, 0.52, 0));
  body.add(bx(1.7, 0.2, 1.3, paint, 0, 0.78, 1.35)); // hood
  body.add(bx(1.5, 0.5, 1.9, glass, 0, 0.98, -0.25)); // cabin glass
  body.add(bx(1.4, 0.07, 1.6, paint, 0, 1.25, -0.28)); // roof
  body.add(bx(1.96, 0.1, 0.35, dark, 0, 0.28, 2.0)); // splitter
  body.add(bx(1.7, 0.08, 0.5, accent, 0, 0.92, -2.05)); // spoiler wing
  body.add(bx(0.1, 0.3, 0.12, dark, 0.6, 0.78, -2.0));
  body.add(bx(0.1, 0.3, 0.12, dark, -0.6, 0.78, -2.0));
  body.add(bx(0.7, 0.05, 3.6, accent, 0, 0.75, 0.1).translateX(0)); // racing stripe on top of body
  for (const sx of [-0.62, 0.62]) {
    body.add(bx(0.5, 0.17, 0.08, tailMat, sx, 0.62, -2.17));
    body.add(bx(0.42, 0.15, 0.08, headMat, sx, 0.62, 2.17));
  }

  // wheels
  const wheelR = 0.4;
  const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.34, 12);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.36, 6);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = ghostify(mat(0xc9ced8, { metalness: 0.7, roughness: 0.3 }));
  const frontPivots: THREE.Object3D[] = [];
  const wheelMeshes: THREE.Object3D[] = [];
  for (const [x, z, front] of [[-0.98, 1.4, true], [0.98, 1.4, true], [-0.98, -1.4, false], [0.98, -1.4, false]] as const) {
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
  boosterSlot.position.set(0, 1.0, -1.15);
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
      g.add(bx(2.1, 0.26, 0.3, m, 0, 0.42, 2.36));
      const geo = new THREE.ConeGeometry(0.1, 0.35, 5); geo.rotateX(Math.PI / 2); geos.push(geo);
      for (const sx of [-0.8, -0.4, 0, 0.4, 0.8]) { const s = new THREE.Mesh(geo, spike); s.position.set(sx, 0.42, 2.7); g.add(s); }
      return g;
    },
  };

  const model: CarModel = {
    root, body, frontPivots, wheelMeshes, wheelRadius: wheelR, tailMat, suspensionSlot, boosterSlot, utilitySlot,
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
