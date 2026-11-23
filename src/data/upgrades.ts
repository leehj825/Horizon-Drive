import type { BiomeId } from './biomes';

export type UpgradeId = 'engine' | 'turbo' | 'tires' | 'chassis';
export const UPGRADE_IDS: UpgradeId[] = ['engine', 'turbo', 'tires', 'chassis'];
export const MAX_UPGRADE = 5;

/** Credits needed to buy level (current + 1). */
export function upgradeCost(level: number): number {
  return 150 + level * 190;
}

export interface VehicleStats {
  maxSpeed: number;
  accel: number;
  grip: number;
  /** Multiplier for nitro recharge and drift gain. */
  nitroRate: number;
  /** Fraction of speed kept after a wall hit. */
  wallKeep: number;
  /** Fraction of the landing slowdown that is absorbed. */
  landSoak: number;
  /** Damage taken multiplier (1 = normal). */
  armor: number;
}

export const BASE_STATS: VehicleStats = {
  maxSpeed: 48,
  accel: 26,
  grip: 5.4,
  nitroRate: 1,
  wallKeep: 0.62,
  landSoak: 0,
  armor: 1,
};

export type UpgradeLevels = Record<UpgradeId, number>;

export function tunedStats(up: UpgradeLevels): VehicleStats {
  return {
    maxSpeed: BASE_STATS.maxSpeed * (1 + 0.035 * up.engine),
    accel: BASE_STATS.accel * (1 + 0.05 * up.turbo),
    grip: BASE_STATS.grip * (1 + 0.04 * up.tires),
    nitroRate: 1 + 0.12 * up.turbo,
    wallKeep: Math.min(0.9, BASE_STATS.wallKeep + 0.05 * up.chassis),
    landSoak: Math.min(0.8, 0.15 * up.chassis),
    armor: Math.max(0.5, 1 - 0.08 * up.chassis),
  };
}

/** Location (track) upgrades: Lv.1 -> Lv.5. */
export const MAX_LOCATION_LEVEL = 5;
export interface LocationCost { credits: number; techParts: number }
/** Cost to go from `level` to `level + 1`. */
export function locationCost(level: number): LocationCost {
  const table: LocationCost[] = [
    { credits: 800, techParts: 0 },
    { credits: 1800, techParts: 2 },
    { credits: 3500, techParts: 4 },
    { credits: 6000, techParts: 8 },
  ];
  return table[Math.max(0, Math.min(3, level - 1))];
}

export function payoutMultiplier(level: number): number {
  // Lv1 1.0x, Lv2 +25%, then +25% each level -> Lv5 2.0x
  return 1 + (level - 1) * 0.25;
}

export type LocationLevels = Record<BiomeId, number>;

export interface LocationFeatures {
  sponsors: boolean;
  boostPads: boolean;
  jumps: boolean;
  festival: boolean;
  payout: number;
}
export function featuresFor(level: number): LocationFeatures {
  return {
    sponsors: level >= 2,
    boostPads: level >= 3,
    jumps: level >= 4,
    festival: level >= 5,
    payout: payoutMultiplier(level),
  };
}
