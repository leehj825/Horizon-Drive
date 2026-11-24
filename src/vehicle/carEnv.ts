import * as THREE from 'three';

export interface EnvSpec { sky: number; horizon: number; ground: number; accent: number; sun: number; night: boolean }

/** Small procedural sky + light-panel scene baked into a PMREM texture; gives car paint and glass something to reflect. */
export function buildCarEnv(renderer: THREE.WebGLRenderer, spec: EnvSpec): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(40, 24, 14);
  const pos = geo.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  const top = new THREE.Color(spec.sky), mid = new THREE.Color(spec.horizon), low = new THREE.Color(spec.ground).multiplyScalar(0.35);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 40;
    if (y >= 0) c.copy(mid).lerp(top, Math.pow(y, 0.6)); else c.copy(mid).lerp(low, Math.min(1, -y * 3));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w: number, h: number, az: number, el: number, color: number, k: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(Math.sin(az) * Math.cos(el) * 30, Math.sin(el) * 30, Math.cos(az) * Math.cos(el) * 30);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  if (spec.night) {
    for (let i = 0; i < 6; i++) panel(14, 3, (i / 6) * Math.PI * 2 + 0.3, 0.12 + (i % 2) * 0.1, i % 3 === 0 ? spec.accent : i % 3 === 1 ? 0xffd9a0 : 0x4fd8ff, 4.5);
    panel(30, 4, 0, 0.9, 0x8aa0ff, 0.8);
  } else {
    panel(8, 8, 0.8, 0.7, spec.sun, 9);
    panel(30, 10, 0, 1.25, 0xffffff, 1.6);
    panel(20, 3, 3.4, 0.15, 0xffffff, 1.1);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.03);
  pm.dispose();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  });
  return rt;
}
