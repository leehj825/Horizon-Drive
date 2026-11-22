import * as THREE from 'three';
import { BIOME_PRESETS, type BiomeId, type BiomePreset } from '../data/biomes';
import { featuresFor, type LocationFeatures } from '../data/upgrades';
import { ParticleSystem, SkidMarks, Weather } from '../fx/Particles';
import type { TrackFeatures } from '../vehicle/CarController';
import { CoinField } from './Coins';
import { SmashProps } from './SmashProps';
import type { Intersection } from './TrackBuilder';
import { gradientSky } from './textures';
import { buildTrack, type BuiltTrack } from './TrackBuilder';
import { Track } from './track';

export interface Quality {
  shadows: boolean;
  bloom: boolean;
  pixelRatio: number;
}

export interface BiomeWorld {
  preset: BiomePreset;
  level: number;
  track: Track;
  trackFeatures: LocationFeatures;
  features: TrackFeatures;
  coins: CoinField;
  intersections: Intersection[];
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
export function loadBiomeScene(scene: THREE.Scene, biomeId: BiomeId, locationLevel: number, quality: Quality): BiomeWorld {
  const preset = BIOME_PRESETS[biomeId];
  if (!preset) throw new Error(`Unknown biome: ${biomeId}`);
  const root = new THREE.Group();
  scene.add(root);
  const disposables: { dispose(): void }[] = [];

  scene.background = new THREE.Color(preset.horizonColor);
  scene.fog = new THREE.FogExp2(preset.fog.color, preset.fog.density);

  // sky dome + sun + stars
  const skyMat = gradientSky(preset.skyColor, preset.horizonColor);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 12), skyMat);
  sky.renderOrder = -10;
  root.add(sky);
  disposables.push(sky.geometry, skyMat);
  const sunDir = new THREE.Vector3(...preset.sunLight.position).normalize();
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(preset.id === 'neon_street' ? 170 : 110, 16, 12), new THREE.MeshBasicMaterial({ color: preset.id === 'neon_street' ? 0xff3fa6 : preset.sunLight.color, fog: false }));
  root.add(sunDisc);
  disposables.push(sunDisc.geometry, sunDisc.material as THREE.Material);
  let stars: THREE.Points | null = null;
  if (preset.id === 'neon_street') {
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
  const ambient = new THREE.AmbientLight(preset.ambientLight.color, preset.ambientLight.intensity);
  const hemi = new THREE.HemisphereLight(preset.skyColor, preset.groundColor, 0.45);
  const sun = new THREE.DirectionalLight(preset.sunLight.color, preset.sunLight.intensity);
  sun.castShadow = quality.shadows;
  if (quality.shadows) {
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
  }
  root.add(ambient, hemi, sun, sun.target);

  const track = new Track(preset);
  const built: BuiltTrack = buildTrack(track, preset, locationLevel);
  root.add(built.group);
  const coins = new CoinField(track, built.bonusCoins);
  root.add(coins.mesh);
  const props = new SmashProps(track, built.intersections, track.city ? (preset.id === 'neon_street' ? 1.4 : 1.1) : 0.8, preset.trackShape.seed);
  root.add(props.group);
  const particles = new ParticleSystem(1100);
  root.add(particles.points);
  const skids = new SkidMarks(500);
  root.add(skids.mesh);
  const weather = preset.weather === 'none' ? null : new Weather(preset.weather);
  if (weather) root.add(weather.points);

  const L = track.length;
  const world: BiomeWorld = {
    preset, level: locationLevel, track,
    trackFeatures: featuresFor(locationLevel),
    features: built.features,
    coins, particles, skids, sun, root, intersections: built.intersections, props,
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
      particles.dispose();
      skids.dispose();
      weather?.dispose();
      for (const d of disposables) d.dispose();
      sun.shadow.map?.dispose();
    },
  };
  return world;
}
