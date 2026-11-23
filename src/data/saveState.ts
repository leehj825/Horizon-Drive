import { BIOME_ORDER, type BiomeId } from './biomes';
import type { CarId } from './cars';
import type { EquipmentId, Loadout } from './equipment';
import { UPGRADE_IDS, type LocationLevels, type UpgradeLevels } from './upgrades';

export interface GhostData {
  time: number;
  /** x, z, heading triples sampled at `GHOST_HZ`. */
  frames: number[];
}
export const GHOST_HZ = 20;

export type Difficulty = 'easy' | 'normal' | 'hard';
export type QualitySetting = 'auto' | 'high' | 'low';

export type Perk = 'sponsor' | 'racing' | 'safety';

export interface Settings {
  difficulty: Difficulty;
  /** Steering response multiplier. */
  steer: number;
  /** Extra field of view in degrees. */
  fov: number;
  quality: QualitySetting;
  /** Size of the on-screen touch buttons. */
  touchScale: number;
  volume: number;
  /** Camera shake multiplier. */
  shake: number;
}

export interface ChampProgress {
  round: number;
  /** Points: [player, rival 1, rival 2, rival 3]. */
  points: number[];
  done: boolean;
  trophy: 'gold' | 'silver' | 'bronze' | null;
}

export interface Stats {
  races: number; wins: number; nearMisses: number; perfectDrifts: number; smashes: number;
  wrecks: number; jumps: number; coins: number; dailies: number; champsWon: number; earned: number;
}

export interface SaveData {
  v: 1;
  credits: number;
  techParts: number;
  upgrades: UpgradeLevels;
  owned: EquipmentId[];
  loadout: Loadout;
  locations: LocationLevels;
  /** `${biome}:${mode}` -> best total race time in seconds. */
  bestTimes: Record<string, number>;
  bestLaps: Record<string, number>;
  /** Drift-trial best scores per `${biome}:drift_trial`. */
  bestScores: Record<string, number>;
  ghosts: Partial<Record<BiomeId, GhostData>>;
  bossesBeaten: BiomeId[];
  selectedBiome: BiomeId;
  lang: 'en' | 'ko';
  muted: boolean;
  tipShown: boolean;
  tutorialSeen: boolean;
  car: CarId;
  carsOwned: CarId[];
  paint: number;
  settings: Settings;
  champs: Record<string, ChampProgress>;
  daily: { date: string; done: boolean };
  dailyStreak: number;
  lastDailyDate: string;
  stats: Stats;
  achievements: string[];
  /** Persistent car damage 0..1 (repair in the garage). */
  damage: number;
  /** Location focus perks (unlocked at Lv.3). */
  perks: Partial<Record<BiomeId, Perk>>;
  /** Passive track income is collected from this time (ms since epoch). */
  incomeAt: number;
  tune: { gear: number; aero: number };
  /** Best time-attack medal per biome (0 none .. 3 gold). */
  medals: Partial<Record<BiomeId, number>>;
}

const KEY = 'hd_save_v1';

function fresh(): SaveData {
  const locations = {} as LocationLevels;
  for (const b of BIOME_ORDER) locations[b] = 1;
  const upgrades = {} as UpgradeLevels;
  for (const u of UPGRADE_IDS) upgrades[u] = 0;
  return {
    v: 1,
    credits: 600,
    techParts: 0,
    upgrades,
    owned: [],
    loadout: { suspension: null, booster: null, utility: null },
    locations,
    bestTimes: {},
    bestLaps: {},
    bestScores: {},
    ghosts: {},
    bossesBeaten: [],
    selectedBiome: 'neon_street',
    lang: (typeof navigator !== 'undefined' && navigator.language?.startsWith('ko')) ? 'ko' : 'en',
    muted: false,
    tipShown: false,
    tutorialSeen: false,
    car: 'coupe',
    carsOwned: ['coupe'],
    paint: 0,
    settings: { difficulty: 'normal', steer: 1, fov: 0, quality: 'auto', touchScale: 1, volume: 1, shake: 1 },
    champs: {},
    daily: { date: '', done: false },
    dailyStreak: 0,
    lastDailyDate: '',
    stats: { races: 0, wins: 0, nearMisses: 0, perfectDrifts: 0, smashes: 0, wrecks: 0, jumps: 0, coins: 0, dailies: 0, champsWon: 0, earned: 0 },
    achievements: [],
    damage: 0,
    perks: {},
    incomeAt: Date.now(),
    tune: { gear: 0, aero: 0 },
    medals: {},
  };
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export class SaveState {
  data: SaveData;
  private listeners: (() => void)[] = [];

  constructor() {
    this.data = fresh();
    try {
      const raw = safeStorage()?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        if (parsed.v === 1) this.data = { ...this.data, ...parsed, upgrades: { ...this.data.upgrades, ...parsed.upgrades }, locations: { ...this.data.locations, ...parsed.locations }, settings: { ...this.data.settings, ...parsed.settings }, stats: { ...this.data.stats, ...parsed.stats }, tune: { ...this.data.tune, ...parsed.tune } };
      }
    } catch { /* corrupt save: start fresh */ }
  }

  onChange(fn: () => void): void { this.listeners.push(fn); }

  /** Write to storage without notifying listeners (sliders). */
  persist(): void {
    try { safeStorage()?.setItem(KEY, JSON.stringify(this.data)); } catch { /* quota / private mode */ }
  }

  save(): void {
    try { safeStorage()?.setItem(KEY, JSON.stringify(this.data)); } catch { /* quota / private mode */ }
    for (const l of this.listeners) l();
  }

  reset(): void {
    this.data = fresh();
    this.save();
  }
}
