import * as THREE from 'three';
import { BIOME_PRESETS, type BiomeId, type BiomePreset } from '../data/biomes';
import { featuresFor, type LocationFeatures } from '../data/upgrades';
import type { Perk } from '../data/saveState';
import { ParticleSystem, SkidMarks, Weather } from '../fx/Particles';
import type { TrackFeatures } from '../vehicle/CarController';
import { CoinField } from './Coins';
import { SmashProps } from './SmashProps';
import type { Intersection } from './TrackBuilder';
import { gradientSky } from './textures';
import { buildTrack, type BuiltTrack } from './TrackBuilder';
import { Track } from './track';
import { withProceduralRoute } from './procRoute';
import { TrainCrossing } from './TrainCrossing';
import { findAlleys } from './alleys';

export interface Quality {
  shadows: boolean;
  bloom: boolean;
  pixelRatio: number;
}

/** Per-race world options. */
export type Conditions = 'default' | 'rain' | 'fog' | 'night';

export interface WorldOptions {
  perk?: Perk | null;
  /** Seed of a random city circuit (city biomes only). */
  routeSeed?: number | null;
  weather?: Conditions;
  /** Drive the circuit the other way round. */
  reverse?: boolean;
}

export interface BiomeWorld {
  opts: WorldOptions;
  /** Road grip multiplier of the weather (1 = dry). */
  gripMul: number;
  preset: BiomePreset;
  level: number;
  track: Track;
  trackFeatures: LocationFeatures;
  features: TrackFeatures;
  coins: CoinField;
  intersections: Intersection[];
  train: TrainCrossing | null;
  props: SmashProps;
  particles: ParticleSystem;
  skids: SkidMarks;
  sun: THREE.DirectionalLight;
  root: THREE.Group;
  /** Starting grid slot -> lap distance / lateral offset. */
  gridSlot(i: number): { s: number; lat: number };
  update(dt: number, time: number, focus: THREE.Vector3, cam: THREE.Vector3): void;
  dispose(): void;
}

/** Applies sky, fog, lights and builds the track for a biome at a given Location level. */
export function loadBiomeScene(scene: THREE.Scene, biomeId: BiomeId, locationLevel: number, quality: Quality, opts: WorldOptions = {}): BiomeWorld {
  const basePreset = BIOME_PRESETS[biomeId];
  if (!basePreset) throw new Error(`Unknown biome: ${biomeId}`);
  const preset = opts.routeSeed ? withProceduralRoute(basePreset, opts.routeSeed) : basePreset;
  const wx: Conditions = opts.weather ?? 'default';
  const root = new THREE.Group();
  scene.add(root);
  const disposables: { dispose(): void }[] = [];

  // weather / time of day re-tint the biome palette
  const mixCol = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
  const scaleCol = (a: number, k: number) => new THREE.Color(a).multiplyScalar(k).getHex();
  let skyC = preset.skyColor, horizonC = preset.horizonColor, fogC = preset.fog.color, fogD = preset.fog.density;
  let ambC = preset.ambientLight.color, ambI = preset.ambientLight.intensity;
  let sunC = preset.sunLight.color, sunI = preset.sunLight.intensity, hemiI = 0.45;
  let gripMul = 1;
  if (wx === 'night') {
    skyC = mixCol(scaleCol(skyC, 0.1), 0x050a1e, 0.6); horizonC = mixCol(scaleCol(horizonC, 0.2), 0x101a44, 0.6);
    fogC = 0x0b1233; fogD *= 1.15; ambC = 0x6a78b8; ambI = Math.min(ambI, 0.62); sunC = 0x9fb4ff; sunI = 0.35; hemiI = 0.22;
  } else if (wx === 'fog') {
    skyC = mixCol(skyC, 0xcfd6dd, 0.6); horizonC = mixCol(horizonC, 0xd8dee4, 0.7); fogC = mixCol(fogC, 0xcfd6dd, 0.65); fogD *= 2.7; sunI *= 0.7;
  } else if (wx === 'rain') {
    skyC = scaleCol(mixCol(skyC, 0x5a6475, 0.5), 0.8); horizonC = mixCol(horizonC, 0x7a8494, 0.5); fogC = mixCol(fogC, 0x6a7484, 0.45); fogD *= 1.5; sunI *= 0.55; ambI *= 0.92; gripMul = 0.9;
  }

  scene.background = new THREE.Color(horizonC);
  scene.fog = new THREE.FogExp2(fogC, fogD);

  // sky dome + sun + stars
  const skyMat = gradientSky(skyC, horizonC);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 12), skyMat);
  sky.renderOrder = -10;
  root.add(sky);
  disposables.push(sky.geometry, skyMat);
  const sunDir = new THREE.Vector3(...preset.sunLight.position).normalize();
  if (wx === 'night') sunDir.set(-0.4, 0.55, 0.5).normalize();
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(wx === 'night' ? 70 : preset.id === 'neon_street' ? 170 : 110, 16, 12), new THREE.MeshBasicMaterial({ color: wx === 'night' ? 0xe6edff : preset.id === 'neon_street' ? 0xff3fa6 : preset.sunLight.color, fog: false }));
  sunDisc.visible = wx === 'default' || wx === 'night';
  root.add(sunDisc);
  disposables.push(sunDisc.geometry, sunDisc.material as THREE.Material);
  let stars: THREE.Points | null = null;
  if (preset.id === 'neon_street' || wx === 'night') {
    const n = 500, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, y = 0.1 + Math.random() * 0.9, r = Math.sqrt(1 - y * y);
      arr.set([Math.cos(th) * r * 2800, y * 2800, Math.sin(th) * r * 2800], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false });
    stars = new THREE.Points(g, m);
    root.add(stars);
    disposables.push(g, m);
  }

  // lights
  const ambient = new THREE.AmbientLight(ambC, ambI);
  const hemi = new THREE.HemisphereLight(skyC, preset.groundColor, hemiI);
  const sun = new THREE.DirectionalLight(sunC, sunI);
  sun.castShadow = quality.shadows;
  if (quality.shadows) {
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
  }
  root.add(ambient, hemi, sun, sun.target);

  const track = new Track(preset, 900, !!opts.reverse);
  if (track.city && featuresFor(locationLevel).shortcuts) track.setAlleys(findAlleys(track));
  const built: BuiltTrack = buildTrack(track, preset, locationLevel, opts);
  root.add(built.group);
  const coins = new CoinField(track, built.bonusCoins);
  root.add(coins.mesh);
  const props = new SmashProps(track, built.intersections, track.city ? (preset.id === 'neon_street' ? 1.4 : 1.1) : 0.8, preset.trackShape.seed);
  root.add(props.group);
  let train: TrainCrossing | null = null;
  if (preset.id === 'harbor_docks' && track.city) {
    const sig = built.intersections.map((it) => it.s);
    const pool = track.crossings.filter((c) => c > 220 && c < track.length - 220 && sig.every((q) => Math.abs(q - c) > 30));
    if (pool.length) {
      train = new TrainCrossing(track, pool[Math.floor(((preset.trackShape.seed * 37) % 97) / 97 * pool.length)], preset.trackShape.seed);
      root.add(train.group);
    }
  }
  const particles = new ParticleSystem(1100);
  root.add(particles.points);
  const skids = new SkidMarks(500);
  root.add(skids.mesh);
  const weatherKind = wx === 'rain' && preset.weather !== 'rain' ? 'rain' : preset.weather === 'none' ? null : wx === 'fog' || wx === 'night' ? (preset.weather === 'rain' ? null : preset.weather) : preset.weather;
  const weather = weatherKind ? new Weather(weatherKind) : null;
  if (weather) root.add(weather.points);

  const L = track.length;
  const world: BiomeWorld = {
    opts, gripMul, preset, level: locationLevel, track,
    trackFeatures: featuresFor(locationLevel),
    features: built.features,
    coins, particles, skids, sun, root, intersections: built.intersections, props, train,
    gridSlot(i: number) {
      const row = Math.floor(i / 2);
      return { s: L - 9 - row * 9, lat: i % 2 ? track.halfWidth * 0.42 : -track.halfWidth * 0.42 };
    },
    update(dt, time, focus, cam) {
      built.update(dt, time);
      particles.update(dt);
      weather?.update(dt, cam);
      sky.position.copy(cam);
      stars?.position.copy(cam);
      sunDisc.position.copy(cam).addScaledVector(sunDir, 2600);
      // shadow camera follows the action, snapped to texels to avoid shimmer
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 160);
      void time;
    },
    dispose() {
      scene.remove(root);
      built.dispose();
      coins.dispose();
      props.dispose();
      train?.dispose();
      particles.dispose();
      skids.dispose();
      weather?.dispose();
      for (const d of disposables) d.dispose();
      sun.shadow.map?.dispose();
    },
  };
  return world;
}
