/** Biome presets: lighting, fog, surface physics and track layout. Each race happens in exactly one biome. */

import type { GridRouteSpec } from '../world/gridRoute';

export type BiomeId = 'neon_street' | 'harbor_docks' | 'downtown_day' | 'red_canyon' | 'coast_highway' | 'alpine_pass';
export type CityStyle = 'neon' | 'harbor' | 'day';
export type SurfaceKind = 'asphalt' | 'dirt' | 'snow';

export interface TrackShape {
  /** Base radius in metres. */
  radius: number;
  /** x stretch (1 = circle, >1 = elongated for long straights). */
  stretchX: number;
  /** Radial harmonics: [frequency, amplitude (fraction of radius), phase]. */
  harmonics: [number, number, number][];
  /** Seed for scenery placement. */
  seed: number;
}

export interface BiomePreset {
  id: BiomeId;
  skyColor: number;
  /** Optional lower sky colour for the gradient dome. */
  horizonColor: number;
  fog: { color: number; density: number };
  ambientLight: { color: number; intensity: number };
  sunLight: { color: number; intensity: number; position: [number, number, number] };
  roadColor: number;
  groundColor: number;
  shoulderColor: number;
  wallColor: number;
  wallGlow: number | null;
  laneColor: number;
  /** Road friction multiplier (1 = dry asphalt). */
  friction: number;
  surface: SurfaceKind;
  roadWidth: number;
  /** Width of the soft off-road strip between the road and the wall (per side). */
  shoulder: number;
  props: string[];
  trackShape: TrackShape;
  /** When set the track is a city-grid circuit instead of the harmonic spline. */
  route?: GridRouteSpec;
  /** Look of the city blocks (route presets only). */
  cityStyle?: CityStyle;
  /** Tunnel ranges as fractions of the lap [start, end]. */
  tunnels: [number, number][];
  /** Drift score zones (fractions of the lap); 2x score and nitro. */
  driftZones: [number, number][];
  /** Sparks / smoke tint for drifting. */
  fxColor: number;
  /** Time-attack par time (seconds for 3 laps) used for the payout bonus. */
  parTime: number;
  /** Falling particles around the camera. */
  weather: 'none' | 'snow' | 'dust' | 'rain';
  /** Civilian traffic: slow lane cars, cross traffic at signalled junctions. */
  traffic: { cars: number; cross: number; /** share of lane cars driving the opposite way (0..1) */ oncoming: number };
  /** Bloom strength on emissive elements. */
  bloom: number;
  /** Which biome must be Lv.2+ to unlock this one. */
  unlockedBy: BiomeId | null;
}

export const BIOME_ORDER: BiomeId[] = ['neon_street', 'harbor_docks', 'downtown_day', 'red_canyon', 'coast_highway', 'alpine_pass'];

export const BIOME_PRESETS: Record<BiomeId, BiomePreset> = {
  neon_street: {
    id: 'neon_street',
    skyColor: 0x090b1a,
    horizonColor: 0x2a1450,
    fog: { color: 0x0e122b, density: 0.0062 },
    ambientLight: { color: 0x7d88cc, intensity: 1.35 },
    sunLight: { color: 0xff4fa0, intensity: 1.5, position: [50, 80, -40] },
    roadColor: 0x262a3d,
    groundColor: 0x0d0f18,
    shoulderColor: 0x15182a,
    wallColor: 0x2a2f4a,
    wallGlow: 0x19e6ff,
    laneColor: 0xa9bcdc,
    friction: 1.0,
    surface: 'asphalt',
    roadWidth: 12,
    shoulder: 2.5,
    props: ['cyberBuilding', 'neonArch', 'streetLamp'],
    trackShape: {
      radius: 180,
      stretchX: 1.25,
      harmonics: [[3, 0.24, 0.6], [5, 0.14, 2.1], [2, 0.16, 1.2]],
      seed: 11,
    },
    cityStyle: 'neon',
    route: {
      pitch: 76,
      corners: [[0, 0, 34], [3, 0, 12], [3, 1, 12], [4, 1, 12], [4, 0, 12], [5, 0, 12], [5, 3, 12], [3, 3, 12], [3, 2, 12], [2, 2, 12], [2, 3, 12], [0, 3, 12]],
      startDist: 80,
      plazas: [0],
      drift: [[2, 4], [8, 10]],
    },
    tunnels: [],
    driftZones: [[0.28, 0.38], [0.66, 0.76]],
    fxColor: 0x19e6ff,
    parTime: 235,
    weather: 'rain',
    traffic: { cars: 11, cross: 3, oncoming: 0.4 },
    bloom: 0.85,
    unlockedBy: null,
  },
  harbor_docks: {
    id: 'harbor_docks',
    skyColor: 0x1d2c4a,
    horizonColor: 0xf2a65a,
    fog: { color: 0xc58a6a, density: 0.0052 },
    ambientLight: { color: 0xc4b2c8, intensity: 1.15 },
    sunLight: { color: 0xffb36b, intensity: 2.0, position: [-90, 38, 60] },
    roadColor: 0x3a3d46,
    groundColor: 0x0e4a63,
    shoulderColor: 0x5a5f6b,
    wallColor: 0x80858f,
    wallGlow: null,
    laneColor: 0xe8d27a,
    friction: 0.93,
    surface: 'asphalt',
    roadWidth: 14,
    shoulder: 2.5,
    props: [],
    trackShape: { radius: 250, stretchX: 1.3, harmonics: [], seed: 61 },
    cityStyle: 'harbor',
    route: {
      pitch: 84,
      corners: [[0, 0, 36], [5, 0, 14], [5, 2, 14], [4, 2, 14], [4, 1, 14], [3, 1, 14], [3, 2, 14], [2, 2, 14], [2, 3, 14], [0, 3, 14]],
      startDist: 90,
      plazas: [0],
      drift: [[3, 6], [8, 9]],
    },
    tunnels: [],
    driftZones: [],
    fxColor: 0xffc27a,
    parTime: 215,
    weather: 'none',
    traffic: { cars: 8, cross: 3, oncoming: 0.35 },
    bloom: 0.5,
    unlockedBy: 'neon_street',
  },
  downtown_day: {
    id: 'downtown_day',
    skyColor: 0x4fa8ff,
    horizonColor: 0xdff2ff,
    fog: { color: 0xcfe6f5, density: 0.0024 },
    ambientLight: { color: 0xf2f6ff, intensity: 1.3 },
    sunLight: { color: 0xfff4d8, intensity: 2.5, position: [60, 120, 40] },
    roadColor: 0x44474f,
    groundColor: 0x9aa0a8,
    shoulderColor: 0xb9bcc4,
    wallColor: 0xc6c9d2,
    wallGlow: null,
    laneColor: 0xffffff,
    friction: 0.98,
    surface: 'asphalt',
    roadWidth: 13,
    shoulder: 3,
    props: [],
    trackShape: { radius: 250, stretchX: 1.3, harmonics: [], seed: 71 },
    cityStyle: 'day',
    route: {
      pitch: 80,
      corners: [[0, 0, 12], [4, 0, 12], [4, 1, 12], [5, 1, 12], [5, 3, 34], [3, 3, 12], [3, 2, 12], [1, 2, 12], [1, 3, 12], [0, 3, 12]],
      startDist: 108,
      plazas: [4],
      drift: [[1, 3], [5, 8]],
    },
    tunnels: [],
    driftZones: [],
    fxColor: 0xffffff,
    parTime: 220,
    weather: 'none',
    traffic: { cars: 12, cross: 3, oncoming: 0.4 },
    bloom: 0.22,
    unlockedBy: 'harbor_docks',
  },
  red_canyon: {
    id: 'red_canyon',
    skyColor: 0xff8c42,
    horizonColor: 0xffc27a,
    fog: { color: 0xf4a261, density: 0.0034 },
    ambientLight: { color: 0xffd6a5, intensity: 1.15 },
    sunLight: { color: 0xfff1d0, intensity: 2.2, position: [100, 60, 40] },
    roadColor: 0x8c4a27,
    groundColor: 0xc86432,
    shoulderColor: 0xb25a2c,
    wallColor: 0xa4522b,
    wallGlow: null,
    laneColor: 0xf2c590,
    friction: 0.78,
    surface: 'dirt',
    roadWidth: 20,
    shoulder: 7,
    props: ['mesaRock', 'cactus', 'woodenSign'],
    trackShape: {
      radius: 220,
      stretchX: 1.35,
      harmonics: [[2, 0.308, 0.3], [3, 0.22, 1.7], [4, 0.099, 0.4]],
      seed: 23,
    },
    tunnels: [],
    driftZones: [],
    fxColor: 0xe0a070,
    parTime: 165,
    weather: 'dust',
    traffic: { cars: 0, cross: 0, oncoming: 0 },
    bloom: 0.35,
    unlockedBy: 'neon_street',
  },
  coast_highway: {
    id: 'coast_highway',
    skyColor: 0x4cc9f0,
    horizonColor: 0xcdf3ff,
    fog: { color: 0x90e0ef, density: 0.0021 },
    ambientLight: { color: 0xffffff, intensity: 1.25 },
    sunLight: { color: 0xfff8e7, intensity: 2.3, position: [80, 120, 60] },
    roadColor: 0x2b2d42,
    groundColor: 0x00b4d8,
    shoulderColor: 0xe8d9a8,
    wallColor: 0xf4f4f4,
    wallGlow: null,
    laneColor: 0xffffff,
    friction: 0.96,
    surface: 'asphalt',
    roadWidth: 18,
    shoulder: 6,
    props: ['palmTree', 'beachUmbrella', 'highwayArch'],
    trackShape: {
      radius: 250,
      stretchX: 1.95,
      harmonics: [[2, 0.17, 0.9], [3, 0.102, 0.2], [5, 0.034, 1.0]],
      seed: 37,
    },
    tunnels: [[0.12, 0.2]],
    driftZones: [],
    fxColor: 0xffffff,
    parTime: 205,
    weather: 'none',
    traffic: { cars: 5, cross: 0, oncoming: 0 },
    bloom: 0.45,
    unlockedBy: 'red_canyon',
  },
  alpine_pass: {
    id: 'alpine_pass',
    skyColor: 0xcaf0f8,
    horizonColor: 0xf3fbff,
    fog: { color: 0xe0fbfc, density: 0.0052 },
    ambientLight: { color: 0xb8d8e8, intensity: 1.25 },
    sunLight: { color: 0xffffff, intensity: 1.7, position: [-60, 100, 30] },
    roadColor: 0x4a5759,
    groundColor: 0xf1faee,
    shoulderColor: 0xe3eef0,
    wallColor: 0x8a5a36,
    wallGlow: null,
    laneColor: 0xf2f6f7,
    friction: 0.65,
    surface: 'snow',
    roadWidth: 15,
    shoulder: 5,
    props: ['pineTree', 'snowRock', 'woodenGuardrail'],
    trackShape: {
      radius: 230,
      stretchX: 1.2,
      harmonics: [[3, 0.16, 2.4], [4, 0.12, 0.8], [6, 0.056, 1.6], [2, 0.112, 0.1]],
      seed: 53,
    },
    tunnels: [],
    driftZones: [],
    fxColor: 0xffffff,
    parTime: 165,
    weather: 'snow',
    traffic: { cars: 0, cross: 0, oncoming: 0 },
    bloom: 0.3,
    unlockedBy: 'coast_highway',
  },
};
