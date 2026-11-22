import { BIOME_PRESETS, type BiomeId } from './biomes';
import { EQUIPMENT, modsFor, type EquipmentId } from './equipment';
import type { SaveData } from './saveState';
import { MAX_LOCATION_LEVEL, MAX_UPGRADE, locationCost, payoutMultiplier, tunedStats, upgradeCost, type UpgradeId } from './upgrades';

export type RaceMode = 'time_attack' | 'duel' | 'circuit' | 'boss';

export function isBiomeUnlocked(save: SaveData, id: BiomeId): boolean {
  const gate = BIOME_PRESETS[id].unlockedBy;
  return gate === null || save.locations[gate] >= 2;
}

export function modeAvailable(save: SaveData, biome: BiomeId, mode: RaceMode): boolean {
  if (mode === 'boss') return save.locations[biome] >= MAX_LOCATION_LEVEL;
  return true;
}

export type BuyResult = 'ok' | 'poor' | 'max' | 'locked' | 'owned';

export function buyUpgrade(save: SaveData, id: UpgradeId): BuyResult {
  const lv = save.upgrades[id];
  if (lv >= MAX_UPGRADE) return 'max';
  const cost = upgradeCost(lv);
  if (save.credits < cost) return 'poor';
  save.credits -= cost;
  save.upgrades[id] = lv + 1;
  return 'ok';
}

export function buyEquipment(save: SaveData, id: EquipmentId): BuyResult {
  if (save.owned.includes(id)) return 'owned';
  const cost = EQUIPMENT[id].cost;
  if (save.credits < cost) return 'poor';
  save.credits -= cost;
  save.owned.push(id);
  return 'ok';
}

/** Equip an owned item; equipping the one already in the slot removes it. */
export function toggleEquip(save: SaveData, id: EquipmentId): boolean {
  if (!save.owned.includes(id)) return false;
  const slot = EQUIPMENT[id].slot;
  save.loadout[slot] = save.loadout[slot] === id ? null : id;
  return true;
}

export function upgradeLocation(save: SaveData, biome: BiomeId): BuyResult {
  const lv = save.locations[biome];
  if (lv >= MAX_LOCATION_LEVEL) return 'max';
  if (!isBiomeUnlocked(save, biome)) return 'locked';
  const c = locationCost(lv);
  if (save.credits < c.credits || save.techParts < c.techParts) return 'poor';
  save.credits -= c.credits;
  save.techParts -= c.techParts;
  save.locations[biome] = lv + 1;
  return 'ok';
}

export interface RaceStats {
  biome: BiomeId;
  mode: RaceMode;
  /** 1-based finishing position (1 for time attack). */
  position: number;
  /** Total race time (s). */
  time: number;
  driftScore: number;
  perfectDrifts: number;
  coins: number;
  jumpBonus: number;
}

export interface Payout {
  lines: { key: string; value: number }[];
  multiplier: number;
  credits: number;
  techParts: number;
  beatPar: boolean;
  firstBoss: boolean;
}

const POSITION_PAY: Record<RaceMode, number[]> = {
  time_attack: [],
  duel: [450, 120],
  circuit: [550, 340, 190, 90],
  boss: [900, 150],
};

/** Rewards for a finished race (location level scales everything). */
export function computePayout(save: SaveData, r: RaceStats): Payout {
  const preset = BIOME_PRESETS[r.biome];
  const level = save.locations[r.biome];
  const lines: { key: string; value: number }[] = [];
  let beatPar = false;
  if (r.mode === 'time_attack') {
    beatPar = r.time <= preset.parTime;
    lines.push({ key: beatPar ? 'payParBeat' : 'payFinish', value: beatPar ? 350 : 140 });
  } else {
    lines.push({ key: 'payPlace', value: POSITION_PAY[r.mode][r.position - 1] ?? 60 });
  }
  if (r.driftScore > 0) lines.push({ key: 'payDrift', value: Math.floor(r.driftScore / 12) });
  if (r.perfectDrifts > 0) lines.push({ key: 'payPerfect', value: r.perfectDrifts * 15 });
  if (r.coins > 0) lines.push({ key: 'payCoins', value: r.coins * 5 });
  if (r.jumpBonus > 0) lines.push({ key: 'payJumps', value: r.jumpBonus });
  const base = lines.reduce((s, l) => s + l.value, 0);
  const multiplier = payoutMultiplier(level);
  let credits = Math.round(base * multiplier);
  let techParts = 0;
  let firstBoss = false;
  const won = r.position === 1;
  if (r.mode === 'time_attack') techParts = beatPar ? 1 : 0;
  else if (r.mode === 'boss') {
    if (won) {
      techParts = 3;
      if (!save.bossesBeaten.includes(r.biome)) { firstBoss = true; credits += 2000; techParts += 4; }
    }
  } else if (won) techParts = 1;
  return { lines, multiplier, credits, techParts, beatPar, firstBoss };
}

export function applyPayout(save: SaveData, r: RaceStats, p: Payout): void {
  save.credits += p.credits;
  save.techParts += p.techParts;
  const key = `${r.biome}:${r.mode}`;
  if (r.mode !== 'time_attack' && r.position !== 1) return;
  if (!(key in save.bestTimes) || r.time < save.bestTimes[key]) save.bestTimes[key] = r.time;
  if (r.mode === 'boss' && r.position === 1 && !save.bossesBeaten.includes(r.biome)) save.bossesBeaten.push(r.biome);
}

export function carSetup(save: SaveData) {
  return { stats: tunedStats(save.upgrades), mods: modsFor(save.loadout) };
}
