import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges the static, non-instanced meshes that directly belong to `group` and share a material into one mesh each.
 * Cuts draw calls (important on phones). Meshes flagged `userData.noMerge` (animated) are left alone.
 */
export function mergeStatic(group: THREE.Group, disposables: { dispose(): void }[]): number {
  const buckets = new Map<string, THREE.Mesh[]>();
  for (const child of group.children) {
    const m = child as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || m.userData.noMerge || Array.isArray(m.material) || !m.geometry) continue;
    const g = m.geometry;
    const key = [(m.material as THREE.Material).uuid, m.castShadow, m.receiveShadow, g.index ? 'i' : 'n', Object.keys(g.attributes).sort().join(','), m.renderOrder].join('|');
    const list = buckets.get(key);
    if (list) list.push(m); else buckets.set(key, [m]);
  }
  let saved = 0;
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const geos: THREE.BufferGeometry[] = [];
    for (const m of meshes) {
      m.updateMatrix();
      geos.push(m.geometry.clone().applyMatrix4(m.matrix));
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const first = meshes[0];
    const out = new THREE.Mesh(merged, first.material);
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.renderOrder = first.renderOrder;
    out.frustumCulled = false;
    for (const m of meshes) group.remove(m);
    group.add(out);
    disposables.push(merged);
    saved += meshes.length - 1;
  }
  return saved;
}
