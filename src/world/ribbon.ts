import * as THREE from 'three';
import type { Track } from './track';

export interface RibbonOpts {
  latA: number;
  latB: number;
  y?: number;
  /** Lap-distance range; may exceed track.length to cross the start line. */
  s0?: number;
  s1?: number;
  /** Texture repeat length along the track (metres per UV unit). */
  vScale?: number;
}

/** Flat strip following the track between two lateral offsets. */
export function ribbonGeometry(track: Track, o: RibbonOpts): THREE.BufferGeometry {
  const y = o.y ?? 0;
  const s0 = o.s0 ?? 0;
  const s1 = o.s1 ?? track.length;
  const ds = track.length / track.n;
  const cnt = Math.max(1, Math.round((s1 - s0) / ds));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k <= cnt; k++) {
    const s = s0 + ((s1 - s0) * k) / cnt;
    const i = track.indexAt(s);
    const cx = track.px[i], cz = track.pz[i], nx = track.nx(i), nz = track.nz(i);
    pos.push(cx + nx * o.latA, y, cz + nz * o.latA, cx + nx * o.latB, y, cz + nz * o.latB);
    const v = (s - s0) / (o.vScale ?? 10);
    uv.push(0, v, 1, v);
    if (k < cnt) {
      const a = k * 2;
      // winding so the face points up (+y)
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // computeVertexNormals may flip depending on direction; force up
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** Vertical wall (inner face + top cap) at lateral offset `lat`. `side` = +1 left wall, -1 right wall. */
export function wallGeometry(track: Track, lat: number, height: number, thick = 0.5): THREE.BufferGeometry {
  const ds = track.length / track.n;
  const cnt = Math.round(track.length / (ds * 2));
  const pos: number[] = [], idx: number[] = [], nrm: number[] = [];
  const sign = lat > 0 ? 1 : -1;
  for (let k = 0; k <= cnt; k++) {
    const i = track.indexAt((track.length * k) / cnt);
    const cx = track.px[i], cz = track.pz[i], nx = track.nx(i), nz = track.nz(i);
    const inner = lat, outer = lat + sign * thick;
    // inner bottom, inner top, outer top
    pos.push(cx + nx * inner, 0, cz + nz * inner, cx + nx * inner, height, cz + nz * inner, cx + nx * outer, height, cz + nz * outer);
    nrm.push(-nx * sign, 0, -nz * sign, 0, 1, 0, 0, 1, 0);
    if (k < cnt && !track.inGap((track.length * (k + 0.5)) / cnt, sign)) {
      const a = k * 3, b = a + 3;
      // face 1: inner vertical (a0,a1 -> b0,b1); face 2: top (a1,a2 -> b1,b2)
      idx.push(a, a + 1, b, b, a + 1, b + 1, a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** Merge many small quads (lane dashes, chevrons...) into one geometry. */
export function dashGeometry(track: Track, lat: number, width: number, length: number, spacing: number, y: number, s0 = 0, s1 = track.length): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  let v = 0;
  for (let s = s0; s < s1 - length; s += spacing) {
    const a = track.indexAt(s), b = track.indexAt(s + length);
    const pts: [number, number][] = [];
    for (const [i, side] of [[a, -1], [a, 1], [b, -1], [b, 1]] as const) {
      const off = lat + side * width * 0.5;
      pts.push([track.px[i] + track.nx(i) * off, track.pz[i] + track.nz(i) * off]);
    }
    for (const p of pts) pos.push(p[0], y, p[1]);
    idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
