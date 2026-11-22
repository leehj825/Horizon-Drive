import * as THREE from 'three';
import type { BiomePreset } from '../data/biomes';
import { featuresFor, type LocationFeatures } from '../data/upgrades';
import type { Ramp, Rect, TrackFeatures } from '../vehicle/CarController';
import { Fireworks } from '../fx/Particles';
import { dashGeometry, ribbonGeometry, wallGeometry } from './ribbon';
import { along, instanceParts, mulberry32, scatter, stdMat, unitBox, unitCone, unitCyl, type Placement } from './PropFactory';
import { adTexture, bannerTexture, checkerTexture, chevronTexture, glowTexture, jumbotronTexture, kerbTexture, windowTexture } from './textures';
import type { Track } from './track';
import { buildCity } from './CityBuilder';

export type SignalState = 'green' | 'amber' | 'red';

/** A signalled crossroads (cross traffic runs while racers face red). */
export interface Intersection {
  s: number;
  x: number;
  z: number;
  /** Unit vector along the cross street (the track's left normal). */
  cx: number;
  cz: number;
  /** Track heading at the junction. */
  heading: number;
  /** Half-width of the cross street. */
  halfStreet: number;
  setSignal(state: SignalState): void;
}

export interface BuiltTrack {
  intersections: Intersection[];
  group: THREE.Group;
  features: TrackFeatures;
  /** Extra coins (ramp bonus arcs) in world coordinates. */
  bonusCoins: { x: number; y: number; z: number }[];
  /** Ramp landing spots used for jump bonuses. */
  fireworks: Fireworks | null;
  update(dt: number, time: number): void;
  dispose(): void;
}

/** Builds road, walls, scenery and the Location Lv.1~5 additions for one biome. */
export function buildTrack(track: Track, preset: BiomePreset, level: number): BuiltTrack {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const mats = <T extends { dispose(): void }>(m: T): T => { disposables.push(m); return m; };
  const geom = (g: THREE.BufferGeometry): THREE.BufferGeometry => { disposables.push(g); return g; };
  const feat: LocationFeatures = featuresFor(level);
  const rng = mulberry32(preset.trackShape.seed * 977 + level);
  const hw = track.halfWidth;
  const W = hw + track.shoulder;
  const L = track.length;
  const animators: ((dt: number, time: number) => void)[] = [];
  const addMesh = (g: THREE.BufferGeometry, m: THREE.Material, y = 0, receive = true): THREE.Mesh => {
    const mesh = new THREE.Mesh(geom(g), m);
    mesh.position.y = y;
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  };
  const wantInst = (placements: Placement[], parts: Parameters<typeof instanceParts>[2]) => {
    for (const p of parts) { disposables.push(p.geo); disposables.push(p.mat); }
    return instanceParts(group, placements, parts);
  };

  // ---- ground ----
  const isCoast = preset.id === 'coast_highway';
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    mats(new THREE.MeshStandardMaterial({ color: preset.groundColor, roughness: isCoast ? 0.25 : 0.95, metalness: isCoast ? 0.1 : 0, flatShading: true })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = isCoast ? -0.9 : -0.06;
  ground.receiveShadow = true;
  disposables.push(ground.geometry);
  group.add(ground);

  const dbl = <T extends THREE.Material>(m: T): T => { m.side = THREE.DoubleSide; return m; };

  if (isCoast) {
    // sand causeway the road sits on
    for (const sgn of [1, -1]) {
      addMesh(ribbonGeometry(track, { latA: sgn * (W - 0.5), latB: sgn * (W + 34), y: -0.04, vScale: 30 }), mats(dbl(stdMat(preset.shoulderColor))));
    }
  }

  const city = !!track.city;
  if (city) buildCity(track, preset, group, disposables);

  // ---- road surface ----
  const road = mats(dbl(stdMat(preset.roadColor, { roughness: preset.id === 'neon_street' ? 0.32 : 0.9, metalness: preset.id === 'neon_street' ? 0.25 : 0 })));
  addMesh(ribbonGeometry(track, { latA: -hw, latB: hw, y: 0.02, vScale: 12 }), road);
  for (const sgn of [1, -1]) {
    addMesh(ribbonGeometry(track, { latA: sgn * hw, latB: sgn * (W + 0.1), y: 0.0, vScale: 12 }), mats(dbl(stdMat(preset.shoulderColor))));
  }

  // lane markings
  const laneMat = mats(dbl(new THREE.MeshBasicMaterial({ color: preset.laneColor })));
  addMesh(dashGeometry(track, 0, 0.35, 4.5, 11, 0.035), laneMat, 0, false);
  const glowL = preset.id === 'neon_street' ? 0xff3fa6 : preset.laneColor;
  const glowR = preset.id === 'neon_street' ? 0x19e6ff : preset.laneColor;
  addMesh(ribbonGeometry(track, { latA: hw - 0.7, latB: hw - 0.35, y: 0.035 }), mats(dbl(new THREE.MeshBasicMaterial({ color: glowL }))), 0, false);
  addMesh(ribbonGeometry(track, { latA: -hw + 0.35, latB: -hw + 0.7, y: 0.035 }), mats(dbl(new THREE.MeshBasicMaterial({ color: glowR }))), 0, false);
  if (preset.id !== 'neon_street') {
    const kerb = kerbTexture(preset.id === 'alpine_pass' ? '#d94a2b' : '#e23b3b');
    disposables.push(kerb);
    const kerbMat = mats(dbl(new THREE.MeshBasicMaterial({ map: kerb })));
    for (const sgn of [1, -1]) addMesh(ribbonGeometry(track, { latA: sgn * hw, latB: sgn * (hw + 1.1), y: 0.03, vScale: 2.2 }), kerbMat, 0, false);
  }

  // start / finish line
  const checker = checkerTexture();
  disposables.push(checker);
  addMesh(ribbonGeometry(track, { latA: -hw, latB: hw, y: 0.045, s0: L - 1.2, s1: L + 1.2, vScale: 2.4 }), mats(dbl(new THREE.MeshBasicMaterial({ map: checker }))), 0, false);

  // neon drift zones
  for (const [a, b] of track.driftZones) {
    addMesh(ribbonGeometry(track, { latA: -hw + 0.8, latB: hw - 0.8, y: 0.04, s0: a * L, s1: b * L }), mats(dbl(new THREE.MeshBasicMaterial({ color: 0xff3fa6, transparent: true, opacity: 0.22, depthWrite: false }))), 0, false);
    addMesh(dashGeometry(track, 0, 1.2, 5, 14, 0.042, a * L, b * L), mats(dbl(new THREE.MeshBasicMaterial({ color: 0xff7ac8, transparent: true, opacity: 0.8 }))), 0, false);
  }

  // ---- signalled junctions (street racing): open the walls, add cross street, crosswalks and signals ----
  const intersections: Intersection[] = [];
  const STREET = preset.id === 'neon_street' ? hw : 6.5;
  if (preset.traffic.cross > 0) {
    const avoidS = [0, L, ...track.driftZones.map(([a, b]) => ((a + b) / 2) * L)];
    let spots: number[];
    if (city) {
      // signalled junctions: spread over the lap, away from the start line and corners
      const pool = track.crossings.filter((s) => s > 90 && s < L - 90);
      spots = [];
      const want = preset.traffic.cross;
      for (let k = 0; k < want; k++) {
        const target = ((k + 0.5) / want) * L;
        const pick = pool.filter((s) => !spots.includes(s)).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
        if (pick !== undefined) spots.push(pick);
      }
      spots.sort((a, b) => a - b);
    } else {
      spots = track.pickStraights(preset.traffic.cross, Math.max(260, L / (preset.traffic.cross + 1) * 0.8), avoidS);
    }
    const signalCol: Record<SignalState, number> = { green: 0x35ff7a, amber: 0xffc928, red: 0xff2a3a };
    const crossMat = mats(dbl(stdMat(preset.roadColor, { roughness: preset.id === 'neon_street' ? 0.32 : 0.9, metalness: preset.id === 'neon_street' ? 0.25 : 0, flatShading: false })));
    const white = mats(new THREE.MeshBasicMaterial({ color: 0x8a93ad }));
    const stripeP: Placement[] = [];
    const dashP: Placement[] = [];
    const poleP: Placement[] = [];
    for (const s of spots) {
      track.wallGaps.push([s - STREET - 1, s + STREET + 1]);
      const i = track.indexAt(s);
      const x = track.px[i], z = track.pz[i], h = track.heading(i);
      const cx = track.nx(i), cz = track.nz(i);
      if (!city) {
        const sg = new THREE.PlaneGeometry(2 * (W + 80), STREET * 2);
        sg.rotateX(-Math.PI / 2);
        const street = new THREE.Mesh(geom(sg), crossMat);
        street.position.set(x, 0.037, z); street.rotation.y = h; street.receiveShadow = true;
        group.add(street);
      }
      for (const dir of [-1, 1]) {
        for (let lat = -hw + 1; lat <= hw - 0.9; lat += 1.7) {
          const sp = track.pointAt(s + dir * (STREET + 2.4), lat);
          stripeP.push({ x: sp.x, y: 0.045, z: sp.z, rot: h, sx: 0.8, sy: 0.04, sz: 3.4 });
        }
        if (!city) for (let u = hw + 2; u < W + 76; u += 7.5) dashP.push({ x: x + cx * dir * u, y: 0.05, z: z + cz * dir * u, rot: h + Math.PI / 2, sx: 0.3, sy: 0.04, sz: 3.4 });
      }
      // signal heads for approaching racers (mounted both sides, light faces back up the road)
      const lightMat = mats(new THREE.MeshBasicMaterial({ color: signalCol.green }));
      const sig = track.pointAt(s - STREET - 7, 0);
      for (const side of [-1, 1]) {
        const lat = side * (W + 0.9);
        const pp = track.pointAt(s - STREET - 7, lat);
        poleP.push({ x: pp.x, y: 0, z: pp.z, rot: h, sx: 1, sy: 1, sz: 1 });
        const lamp = new THREE.Mesh(geom(new THREE.BoxGeometry(0.55, 0.55, 0.12)), lightMat);
        lamp.position.set(pp.x, 5.15, pp.z);
        lamp.rotation.y = h + Math.PI;
        lamp.translateZ(0.3);
        group.add(lamp);
      }
      void sig;
      intersections.push({
        s, x, z, cx, cz, heading: h, halfStreet: STREET,
        setSignal(state) { lightMat.color.setHex(signalCol[state]); },
      });
    }
    wantInst(stripeP, [{ geo: unitBox().translate(0, 0, 0), mat: white }]);
    wantInst(dashP, [{ geo: unitBox(), mat: white.clone() }]);
    const poleMat = stdMat(0x232734, { metalness: 0.5, roughness: 0.5 });
    wantInst(poleP, [
      { geo: unitCyl(0.12, 0.14, 6), mat: poleMat, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 5.2, 1)) },
      { geo: unitBox(), mat: poleMat.clone(), local: new THREE.Matrix4().compose(new THREE.Vector3(0, 4.85, 0), new THREE.Quaternion(), new THREE.Vector3(0.8, 0.8, 0.5)) },
    ]);
  }
  /** Lap ranges that are not open junction gaps (for wall decoration strips). */
  const solidRanges = (): [number, number][] => {
    const out: [number, number][] = [];
    let cur = 0;
    for (const [a, b] of [...track.wallGaps].sort((p, q) => p[0] - q[0])) { if (a > cur) out.push([cur, a]); cur = b; }
    if (cur < L) out.push([cur, L]);
    return out;
  };

  // ---- walls ----
  const wallMat = mats(dbl(stdMat(preset.wallColor, { roughness: 0.8 })));
  for (const sgn of [1, -1]) {
    addMesh(wallGeometry(track, sgn * W, preset.id === 'red_canyon' ? 0.7 : 1.05, 0.55), wallMat);
    if (preset.wallGlow !== null) {
      const glowMat = mats(dbl(new THREE.MeshBasicMaterial({ color: preset.wallGlow })));
      for (const [a, b] of solidRanges()) addMesh(ribbonGeometry(track, { latA: sgn * (W + 0.1), latB: sgn * (W + 0.42), y: 1.07, s0: a, s1: b }), glowMat, 0, false);
    }
  }
  if (preset.id === 'alpine_pass') {
    const posts = along(track, 7, W + 0.25, 0, L, [0.28, 1.5, 0.28]);
    const posts2 = along(track, 7, -(W + 0.25), 0, L, [0.28, 1.5, 0.28]);
    wantInst([...posts, ...posts2], [{ geo: unitBox(), mat: stdMat(0x5a3a22) }]);
  }

  // ---- tunnels (coast) ----
  for (const [a, b] of preset.tunnels) {
    const tunnelMat = mats(dbl(stdMat(0x6b7280, { roughness: 0.9 })));
    const H = 9.5, seg = 12;
    for (let k = 0; k < seg; k++) {
      const p0 = (k / seg) * Math.PI, p1 = ((k + 1) / seg) * Math.PI;
      const ds = track.length / track.n;
      const cnt = Math.round(((b - a) * L) / ds);
      const pos: number[] = [], idx: number[] = [];
      for (let j = 0; j <= cnt; j++) {
        const i = track.indexAt(a * L + (((b - a) * L) * j) / cnt);
        for (const ph of [p0, p1]) {
          const lat = Math.cos(ph) * (W + 0.3);
          pos.push(track.px[i] + track.nx(i) * lat, 1.0 + Math.sin(ph) * H, track.pz[i] + track.nz(i) * lat);
        }
        if (j < cnt) { const o = j * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      addMesh(g, tunnelMat, 0, false);
    }
    // ceiling light strip + portal frames
    const ds = track.length / track.n;
    const cnt = Math.round(((b - a) * L) / ds);
    const pos: number[] = [], idx: number[] = [];
    for (let j = 0; j <= cnt; j++) {
      const i = track.indexAt(a * L + (((b - a) * L) * j) / cnt);
      for (const lat of [-0.5, 0.5]) pos.push(track.px[i] + track.nx(i) * lat, 1.0 + H - 0.05, track.pz[i] + track.nz(i) * lat);
      if (j < cnt) { const o = j * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setIndex(idx);
    addMesh(lg, mats(dbl(new THREE.MeshBasicMaterial({ color: 0xcfbf90 }))), 0, false);
  }

  // ---- biome scenery (all levels) ----
  const tunnelSkip = (s: number) => preset.tunnels.some(([a, b]) => s > a * L - 40 && s < b * L + 40);
  const nearTunnel = (x: number, z: number) => {
    if (!preset.tunnels.length) return false;
    for (const [a, b] of preset.tunnels) for (let s = a * L; s <= b * L; s += 30) { const p = track.pointAt(s, 0); if (Math.hypot(p.x - x, p.z - z) < 40) return true; }
    return false;
  };
  const noTunnel = (arr: Placement[]) => arr.filter((p) => !nearTunnel(p.x, p.z));
  const lookup = (id: string) => preset.props.includes(id);

  if (lookup('cyberBuilding') && !city) {
    const win = windowTexture(preset.trackShape.seed);
    disposables.push(win);
    const place = scatter(track, rng, 150, 7, 85, (r) => [10 + r() * 16, 22 + r() * r() * 110, 10 + r() * 16], { clearance: 7 });
    wantInst(place, [{ geo: unitBox(), mat: new THREE.MeshStandardMaterial({ color: 0x1b1f33, map: win, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 1.1, roughness: 0.6, flatShading: true }), cast: false }]);
    // rooftop beacons
    wantInst(place.map((p) => ({ ...p, y: p.sy, sx: 1.2, sy: 2.4, sz: 1.2 })), [{ geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: 0xff3fa6 }) }]);
  }
  if (lookup('neonArch') && !city) {
    const place = along(track, 190, 0, 90, L - 60).filter((p) => !nearTunnel(p.x, p.z));
    const post = new THREE.MeshBasicMaterial({ color: 0x19e6ff });
    const beam = new THREE.MeshBasicMaterial({ color: 0xff3fa6 });
    wantInst(place, [
      { geo: unitBox(), mat: post, local: new THREE.Matrix4().compose(new THREE.Vector3(W + 0.8, 0, 0), new THREE.Quaternion(), new THREE.Vector3(0.7, 9, 0.7)) },
      { geo: unitBox(), mat: post.clone(), local: new THREE.Matrix4().compose(new THREE.Vector3(-(W + 0.8), 0, 0), new THREE.Quaternion(), new THREE.Vector3(0.7, 9, 0.7)) },
      { geo: unitBox(), mat: beam, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 8.6, 0), new THREE.Quaternion(), new THREE.Vector3(2 * (W + 1.15), 0.7, 0.7)) },
    ]);
  }
  if (lookup('mesaRock')) {
    const mesa = new THREE.MeshStandardMaterial({ color: 0xb4532a, roughness: 0.95, flatShading: true });
    const big = scatter(track, rng, 34, 40, 340, (r) => { const w = 40 + r() * 80; return [w, 30 + r() * 80, w * (0.7 + r() * 0.5)]; }, { clearance: 28 });
    wantInst(big, [{ geo: unitCyl(0.72, 1, 7), mat: mesa }, { geo: unitCyl(0.5, 0.74, 7), mat: new THREE.MeshStandardMaterial({ color: 0xd9743c, roughness: 0.95, flatShading: true }), local: new THREE.Matrix4().compose(new THREE.Vector3(0, 0.999, 0), new THREE.Quaternion(), new THREE.Vector3(0.9, 0.25, 0.9)) }]);
    const rocks = scatter(track, rng, 80, 5, 60, (r) => { const s = 1.2 + r() * 3.4; return [s * 1.3, s, s]; });
    const rg = new THREE.DodecahedronGeometry(1, 0); rg.translate(0, 0.5, 0);
    wantInst(rocks, [{ geo: rg, mat: new THREE.MeshStandardMaterial({ color: 0x9a4a28, roughness: 1, flatShading: true }) }]);
  }
  if (lookup('cactus')) {
    const place = scatter(track, rng, 90, 6, 90, (r) => { const s = 0.9 + r() * 1.3; return [s, s, s]; });
    const green = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.9, flatShading: true });
    wantInst(place, [
      { geo: unitCyl(0.4, 0.5, 6), mat: green, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 4.2, 1)) },
      { geo: unitCyl(0.25, 0.28, 5), mat: green, local: new THREE.Matrix4().compose(new THREE.Vector3(0.75, 1.5, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1.7, 1)) },
      { geo: unitCyl(0.25, 0.28, 5), mat: green, local: new THREE.Matrix4().compose(new THREE.Vector3(-0.7, 2.1, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1.3, 1)) },
    ]);
  }
  if (lookup('woodenSign')) {
    const place = along(track, 160, W + 2.2, 70, L - 50, [1, 1, 1]);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4527, flatShading: true });
    wantInst(place, [
      { geo: unitBox(), mat: wood, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(0.25, 2.4, 0.25)) },
      { geo: unitBox(), mat: new THREE.MeshStandardMaterial({ color: 0xe9b872, flatShading: true }), local: new THREE.Matrix4().compose(new THREE.Vector3(0, 1.7, 0), new THREE.Quaternion(), new THREE.Vector3(2.2, 0.9, 0.18)) },
    ]);
  }
  if (lookup('palmTree')) {
    const place = noTunnel(scatter(track, rng, 110, 3, 24, (r) => { const s = 0.8 + r() * 0.7; return [s, s, s]; }, { clearance: 2.5 }));
    const trunk = new THREE.MeshStandardMaterial({ color: 0x8a6a45, flatShading: true });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f9e57, flatShading: true, side: THREE.DoubleSide });
    const parts: Parameters<typeof instanceParts>[2] = [{ geo: unitCyl(0.14, 0.24, 5), mat: trunk, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 6.2, 1)), cast: false }];
    const lg = new THREE.BoxGeometry(0.7, 0.06, 3.4); lg.translate(0, 0, 1.7);
    for (let k = 0; k < 6; k++) parts.push({ geo: lg, mat: leaf, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 6.2, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45, (k / 6) * Math.PI * 2, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)) });
    wantInst(place, parts);
  }
  if (lookup('beachUmbrella')) {
    const place = noTunnel(scatter(track, rng, 36, 3, 18, (r) => { const s = 0.9 + r() * 0.4; return [s, s, s]; }, { clearance: 2.5 }));
    const cols = [0xff4f6d, 0xffd24a, 0x19c6ff, 0xffffff, 0x7bff9a];
    for (const p of place) p.color = new THREE.Color(cols[Math.floor(rng() * cols.length)]);
    wantInst(place, [
      { geo: unitCyl(0.05, 0.05, 5), mat: stdMat(0xe8e8e8), local: new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 2.4, 1)) },
      { geo: unitCone(1.5, 8), mat: stdMat(0xffffff, { side: THREE.DoubleSide }), colored: true, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 2.1, 0), new THREE.Quaternion(), new THREE.Vector3(1, 0.6, 1)) },
    ]);
  }
  if (lookup('highwayArch')) {
    const place = along(track, 420, 0, 200, L - 80).filter((p) => !nearTunnel(p.x, p.z));
    const white = stdMat(0xf2f4f6);
    const sign = stdMat(0x1f7a4d, { emissive: 0x0a3a24, emissiveIntensity: 0.5 });
    wantInst(place, [
      { geo: unitBox(), mat: white, local: new THREE.Matrix4().compose(new THREE.Vector3(W + 0.9, 0, 0), new THREE.Quaternion(), new THREE.Vector3(0.7, 8.2, 0.7)) },
      { geo: unitBox(), mat: white.clone(), local: new THREE.Matrix4().compose(new THREE.Vector3(-(W + 0.9), 0, 0), new THREE.Quaternion(), new THREE.Vector3(0.7, 8.2, 0.7)) },
      { geo: unitBox(), mat: white.clone(), local: new THREE.Matrix4().compose(new THREE.Vector3(0, 8.2, 0), new THREE.Quaternion(), new THREE.Vector3(2 * (W + 1.25), 0.8, 0.8)) },
      { geo: unitBox(), mat: sign, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 6.2, 0), new THREE.Quaternion(), new THREE.Vector3(9, 1.8, 0.25)) },
    ]);
  }
  if (lookup('pineTree')) {
    const place = scatter(track, rng, 210, 4, 120, (r) => { const s = 0.9 + r() * 1.1; return [s, s, s]; }, { clearance: 3.5 });
    const trunk = stdMat(0x5a3a22);
    const pine = stdMat(0x2d6a4f);
    const snow = stdMat(0xf4fbff);
    wantInst(place, [
      { geo: unitCyl(0.25, 0.32, 5), mat: trunk, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 2.2, 1)) },
      { geo: unitCone(2.2, 7), mat: pine, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 1.6, 0), new THREE.Quaternion(), new THREE.Vector3(1, 3.2, 1)) },
      { geo: unitCone(1.7, 7), mat: pine.clone(), local: new THREE.Matrix4().compose(new THREE.Vector3(0, 3.6, 0), new THREE.Quaternion(), new THREE.Vector3(1, 2.8, 1)) },
      { geo: unitCone(1.0, 7), mat: snow, local: new THREE.Matrix4().compose(new THREE.Vector3(0, 5.5, 0), new THREE.Quaternion(), new THREE.Vector3(1, 2.2, 1)) },
    ]);
  }
  if (lookup('snowRock')) {
    const place = scatter(track, rng, 70, 5, 110, (r) => { const s = 1.5 + r() * r() * 9; return [s * 1.2, s, s]; }, { clearance: 4 });
    const rg = new THREE.DodecahedronGeometry(1, 0); rg.translate(0, 0.4, 0);
    wantInst(place, [{ geo: rg, mat: stdMat(0xa7b3b8, { roughness: 1 }) }]);
    // distant peaks
    const peaks = scatter(track, rng, 16, 180, 700, (r) => { const s = 90 + r() * 140; return [s, s * (1.1 + r() * 0.8), s]; }, { clearance: 140 });
    wantInst(peaks, [{ geo: unitCone(1, 6), mat: stdMat(0xdbe7ee) }, { geo: unitCone(0.5, 6), mat: stdMat(0xffffff), local: new THREE.Matrix4().compose(new THREE.Vector3(0, 0.62, 0), new THREE.Quaternion(), new THREE.Vector3(1, 0.4, 1)) }]);
  }

  // ---- Location Lv.2: sponsors, gantry, streetlights ----
  const nearJunction = (s: number) => intersections.some((it) => Math.abs(s - it.s) < 16);
  if (feat.sponsors || preset.id === 'neon_street') {
    const skipLamp = (s: number) => tunnelSkip(s) || nearJunction(s);
    const lampLat = city ? W - 0.9 : W + 1.4;
    const lampPos = [...along(track, city ? 40 : 52, lampLat, 20, L - 20, [1, 1, 1], skipLamp), ...along(track, city ? 40 : 52, -lampLat, 36, L - 20, [1, 1, 1], skipLamp)];
    const warm = preset.id === 'neon_street' ? 0xff9ad8 : 0xfff0c0;
    wantInst(lampPos, [
      { geo: unitCyl(0.1, 0.14, 5), mat: stdMat(0x2a2f3a), local: new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 7.5, 1)) },
      { geo: unitBox(), mat: new THREE.MeshBasicMaterial({ color: warm }), local: new THREE.Matrix4().compose(new THREE.Vector3(0, 7.4, 0), new THREE.Quaternion(), new THREE.Vector3(0.9, 0.22, 0.45)) },
    ]);
    if (preset.id === 'neon_street') {
      // wet-road light pools under every lamp
      const gt = glowTexture(); disposables.push(gt);
      const pool = new THREE.PlaneGeometry(1, 1); pool.rotateX(-Math.PI / 2);
      const poolMat = new THREE.MeshBasicMaterial({ map: gt, color: 0xff6fc0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
      const pools = lampPos.map((p) => {
        const i = track.query(p.x, p.z, -1);
        const side = i.lat > 0 ? 1 : -1;
        const c = track.pointAt(i.s, side * (hw - 2.2));
        return { x: c.x, y: 0.048, z: c.z, rot: 0, sx: 16, sy: 1, sz: 16 } as Placement;
      });
      wantInst(pools, [{ geo: pool, mat: poolMat }]);
    }
  }
  if (feat.sponsors) {
    // start gantry
    const gantry = new THREE.Group();
    const frame = mats(stdMat(0x1f2430, { metalness: 0.4, roughness: 0.5 }));
    const gi = track.indexAt(0);
    gantry.position.set(track.px[gi], 0, track.pz[gi]);
    gantry.rotation.y = track.heading(gi);
    for (const sgn of [1, -1]) {
      const p = new THREE.Mesh(geom(new THREE.BoxGeometry(0.9, 9, 0.9)), frame); p.position.set(sgn * (W + 0.8), 4.5, 0); p.castShadow = true; gantry.add(p);
    }
    const beam = new THREE.Mesh(geom(new THREE.BoxGeometry(2 * (W + 1.25), 1.6, 1.0)), frame); beam.position.set(0, 9.2, 0); gantry.add(beam);
    const bt = bannerTexture('HORIZON DRIVE'); disposables.push(bt);
    const banner = new THREE.Mesh(geom(new THREE.PlaneGeometry(2 * W * 0.8, 1.4)), mats(new THREE.MeshBasicMaterial({ map: bt })));
    banner.position.set(0, 9.2, -0.52); banner.rotation.y = Math.PI; gantry.add(banner);
    const banner2 = banner.clone(); banner2.position.z = 0.52; banner2.rotation.y = 0; gantry.add(banner2);
    group.add(gantry);
    // billboards
    const bs = [0.1, 0.24, 0.4, 0.55, 0.7, 0.86];
    bs.forEach((f, k) => {
      const s = f * L;
      if (tunnelSkip(s)) return;
      const side = k % 2 ? 1 : -1;
      const i = track.indexAt(s);
      const bx = track.px[i] + track.nx(i) * side * (W + 6), bz = track.pz[i] + track.nz(i) * side * (W + 6);
      const at = adTexture(k); disposables.push(at);
      const board = new THREE.Mesh(geom(new THREE.PlaneGeometry(12, 6)), mats(new THREE.MeshBasicMaterial({ map: at, side: THREE.DoubleSide })));
      board.position.set(bx, 6.8, bz);
      board.lookAt(track.px[i], 6.8, track.pz[i]);
      const stand = new THREE.Mesh(geom(new THREE.BoxGeometry(0.5, 6.8, 0.5)), frame);
      stand.position.set(bx, 3.4, bz);
      group.add(board, stand);
    });
  }

  // ---- Location Lv.3: boost pads ----
  const features: TrackFeatures = { ramps: [], pads: [] };
  const bonusCoins: { x: number; y: number; z: number }[] = [];
  const padS: number[] = [];
  if (feat.boostPads) {
    const pads = track.pickStraights(5, Math.max(260, L / 6), [0, L]).filter((s) => !tunnelSkip(s));
    const ct = chevronTexture(preset.id === 'neon_street' ? '#19e6ff' : '#ffe14a'); disposables.push(ct);
    const padMat = mats(dbl(new THREE.MeshStandardMaterial({ map: ct, emissiveMap: ct, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4 })));
    for (const s of pads) {
      padS.push(s);
      addMesh(ribbonGeometry(track, { latA: -4.2, latB: 4.2, y: 0.05, s0: s - 9, s1: s + 9, vScale: 9 }), padMat, 0, false);
      const i = track.indexAt(s);
      features.pads.push({ x: track.px[i], z: track.pz[i], dx: track.tx[i], dz: track.tz[i], w: 8.4, l: 18 } as Rect);
    }
    animators.push((_dt, time) => { padMat.emissiveIntensity = 0.75 + Math.sin(time * 6) * 0.25; });
  }

  // ---- Location Lv.4: jump ramps ----
  if (feat.jumps) {
    const rampS = track.pickStraights(2, L / 3, [0, L, ...padS]).filter((s) => !tunnelSkip(s));
    const rampMat = mats(stdMat(0x5b6384, { roughness: 0.55, emissive: 0x161c36, emissiveIntensity: 1 }));
    const stripe = mats(new THREE.MeshBasicMaterial({ color: preset.id === 'neon_street' ? 0xff3fa6 : 0xffc928 }));
    const arrowMat = mats(new THREE.MeshBasicMaterial({ color: 0x19e6ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    const arrowGeo = geom(new THREE.ConeGeometry(0.5, 1.7, 4));
    arrowGeo.rotateX(Math.PI / 2); // tip along +z
    const arrows: { m: THREE.Mesh; base: number }[] = [];
    for (const s of rampS) {
      const lat = hw * 0.48;
      const i = track.indexAt(s);
      const x = track.px[i] + track.nx(i) * lat, z = track.pz[i] + track.nz(i) * lat;
      const r: Ramp = { x, z, dx: track.tx[i], dz: track.tz[i], w: 7.4, l: 15, h: 2.3 };
      features.ramps.push(r);
      // wedge mesh
      const hwid = r.w / 2, hl = r.l / 2;
      const wedge = new THREE.BufferGeometry();
      const v = [
        -hwid, 0, -hl, hwid, 0, -hl, -hwid, r.h, hl, hwid, r.h, hl, // top slope corners (front low .. back high)
        -hwid, 0, hl, hwid, 0, hl,
      ];
      wedge.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      wedge.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 0, 4, 2, 1, 3, 5]);
      wedge.computeVertexNormals();
      const mesh = new THREE.Mesh(geom(wedge), rampMat);
      mesh.position.set(x, 0.02, z);
      mesh.rotation.y = track.heading(i);
      mesh.castShadow = true;
      mesh.material = dbl(rampMat);
      group.add(mesh);
      const edge = new THREE.Mesh(geom(new THREE.BoxGeometry(r.w, 0.14, 0.7)), stripe);
      edge.position.set(0, r.h + 0.07, hl - 0.2);
      mesh.add(edge);
      for (let k = 0; k < 3; k++) {
        const a = new THREE.Mesh(arrowGeo, arrowMat);
        const ap = track.pointAt(s - 22 - k * 9, lat);
        a.position.set(ap.x, 1.3, ap.z);
        a.rotation.y = track.heading(i);
        group.add(a);
        arrows.push({ m: a, base: k });
      }
      // bonus coins on the flight arc
      const j = track.indexAt(s + r.l / 2 + 2);
      for (let k = 0; k < 6; k++) {
        const f = k / 5;
        bonusCoins.push({
          x: track.px[j] + track.tx[j] * f * 16 + track.nx(j) * lat,
          z: track.pz[j] + track.tz[j] * f * 16 + track.nz(j) * lat,
          y: 1.4 + Math.sin(f * Math.PI) * 2.6,
        });
      }
    }
    animators.push((_dt, time) => {
      for (const a of arrows) {
        a.m.position.y = 1.3 + Math.sin(time * 4 - a.base * 0.9) * 0.25;
        (a.m.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.3 * Math.max(0, Math.sin(time * 6 - a.base * 1.3));
      }
    });
  }

  // ---- Location Lv.5: grandstands, jumbotron, fireworks ----
  let fireworks: Fireworks | null = null;
  if (feat.festival) {
    const tierMat = mats(stdMat(0x39405a, { roughness: 0.7 }));
    const roofMat = mats(stdMat(preset.id === 'neon_street' ? 0xff3fa6 : 0xe23b6b, { emissive: 0x330814, emissiveIntensity: 0.5 }));
    for (let tier = 0; tier < 3; tier++) {
      const lat = -(W + 9 + tier * 3.6);
      const pl = along(track, 8, lat, L - 70, L + 40, [1, 1, 1]).map((p) => ({ ...p, sx: 8.2, sy: 1.6 + tier * 1.5, sz: 3.6 }));
      wantInst(pl, [{ geo: unitBox(), mat: tierMat.clone(), cast: true }]);
    }
    const crowd: Placement[] = [];
    for (let tier = 0; tier < 3; tier++) {
      const lat = -(W + 9 + tier * 3.6);
      for (let s = L - 68; s < L + 38; s += 2.1) {
        const i = track.indexAt(s);
        const jitter = (rng() - 0.5) * 1.4;
        crowd.push({
          x: track.px[i] + track.nx(i) * (lat + jitter), z: track.pz[i] + track.nz(i) * (lat + jitter),
          y: 1.6 + tier * 1.5, rot: track.heading(i), sx: 0.55, sy: 1 + rng() * 0.3, sz: 0.5,
          color: new THREE.Color().setHSL(rng(), 0.7, 0.55),
        });
      }
    }
    wantInst(crowd, [{ geo: unitBox(), mat: stdMat(0xffffff, { roughness: 0.9 }), colored: true }]);
    const roof = along(track, 8, -(W + 12.6), L - 70, L + 40, [1, 1, 1]).map((p) => ({ ...p, y: 7.6, sx: 8.4, sy: 0.35, sz: 8.5 }));
    wantInst(roof, [{ geo: unitBox(), mat: roofMat }]);
    // jumbotron
    const jt = jumbotronTexture(); disposables.push(jt);
    const ji = track.indexAt(150);
    const jx = track.px[ji] + track.nx(ji) * (W + 14), jz = track.pz[ji] + track.nz(ji) * (W + 14);
    const screen = new THREE.Mesh(geom(new THREE.PlaneGeometry(24, 12)), mats(new THREE.MeshBasicMaterial({ map: jt, side: THREE.DoubleSide })));
    screen.position.set(jx, 12, jz);
    screen.lookAt(track.px[ji], 12, track.pz[ji]);
    const frameMat = mats(stdMat(0x1a1d27));
    const back = new THREE.Mesh(geom(new THREE.BoxGeometry(25, 13, 0.6)), frameMat);
    back.position.copy(screen.position); back.quaternion.copy(screen.quaternion); back.translateZ(-0.4);
    const leg = new THREE.Mesh(geom(new THREE.BoxGeometry(1, 6, 1)), frameMat); leg.position.set(jx, 3, jz);
    group.add(back, screen, leg);
    // fireworks launch from beyond the stands
    const origins: THREE.Vector3[] = [];
    for (const s of [L - 40, 20, 90]) {
      const i = track.indexAt(s);
      origins.push(new THREE.Vector3(track.px[i] + track.nx(i) * -(W + 30), 2, track.pz[i] + track.nz(i) * -(W + 30)));
    }
    fireworks = new Fireworks(origins);
    group.add(fireworks.ps.points);
    disposables.push(fireworks.ps);
  }

  return {
    group, features, bonusCoins, fireworks, intersections,
    update(dt: number, time: number) {
      for (const a of animators) a(dt, time);
      fireworks?.update(dt);
    },
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) {
          // geometry/material are tracked via disposables where created here; instanced parts too
        }
      });
      for (const d of disposables) d.dispose();
    },
  };
}
