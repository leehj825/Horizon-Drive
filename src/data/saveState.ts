import { BIOME_ORDER, type BiomeId } from './biomes';
import type { EquipmentId, Loadout } from './equipment';
import { UPGRADE_IDS, type LocationLevels, type UpgradeLevels } from './upgrades';

export interface GhostData {
  time: number;
  /** x, z, heading triples sampled at `GHOST_HZ`. */
  frames: number[];
}
export const GHOST_HZ = 20;

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
  ghosts: Partial<Record<BiomeId, GhostData>>;
  bossesBeaten: BiomeId[];
  selectedBiome: BiomeId;
  lang: 'en' | 'ko';
  muted: boolean;
  tipShown: boolean;
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
    ghosts: {},
    bossesBeaten: [],
    selectedBiome: 'neon_street',
    lang: (typeof navigator !== 'undefined' && navigator.language?.startsWith('ko')) ? 'ko' : 'en',
    muted: false,
    tipShown: false,
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
        if (parsed.v === 1) this.data = { ...this.data, ...parsed, upgrades: { ...this.data.upgrades, ...parsed.upgrades }, locations: { ...this.data.locations, ...parsed.locations } };
      }
    } catch { /* corrupt save: start fresh */ }
  }

  onChange(fn: () => void): void { this.listeners.push(fn); }

  save(): void {
    try { safeStorage()?.setItem(KEY, JSON.stringify(this.data)); } catch { /* quota / private mode */ }
    for (const l of this.listeners) l();
  }

  reset(): void {
    this.data = fresh();
    this.save();
  }
}
