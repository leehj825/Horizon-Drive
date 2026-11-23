import { BIOME_PRESETS, type BiomeId } from './biomes';
import { applyCar, CARS, type CarId } from './cars';
import { dailyChallenge, todayStr, type DailyChallenge } from './challenges';
import { BIOME_ORDER } from './biomes';
import { EQUIPMENT, modsFor, type EquipmentId } from './equipment';
import type { Difficulty, Perk, SaveData } from './saveState';
import { MAX_LOCATION_LEVEL, MAX_UPGRADE, locationCost, payoutMultiplier, tunedStats, upgradeCost, type UpgradeId } from './upgrades';

export type RaceMode = 'time_attack' | 'duel' | 'circuit' | 'elimination' | 'drift_trial' | 'speed_run' | 'delivery' | 'pink_slip' | 'boss';

export function isBiomeUnlocked(save: SaveData, id: BiomeId): boolean {
  const gate = BIOME_PRESETS[id].unlockedBy;
  return gate === null || save.locations[gate] >= 2;
}

export function modeAvailable(save: SaveData, biome: BiomeId, mode: RaceMode): boolean {
  if (mode === 'boss') return save.locations[biome] >= MAX_LOCATION_LEVEL;
  if (mode === 'pink_slip') return pinkSlipPrize(save) !== null;
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

export const DIFFICULTY: Record<Difficulty, { skill: number; traffic: number; pay: number }> = {
  easy: { skill: 0.9, traffic: 0.65, pay: 0.8 },
  normal: { skill: 1, traffic: 1, pay: 1 },
  hard: { skill: 1.07, traffic: 1.3, pay: 1.25 },
};

/** Drift trial medals: bronze, silver, gold score. */
export const DRIFT_MEDALS = [800, 2000, 4000];
export function driftMedal(score: number): number { return DRIFT_MEDALS.filter((m) => score >= m).length; }

/** Pink-slip duel: the first car you do not own is the prize; you stake 30% of its price. */
export function pinkSlipPrize(save: SaveData): { car: CarId; stake: number } | null {
  for (const id of ['hatch', 'muscle', 'hyper'] as CarId[]) if (!save.carsOwned.includes(id)) return { car: id, stake: Math.round(CARS[id].cost * 0.3) };
  return null;
}

export interface RaceStats {
  /** Conditions/random streets do not count for records and medals. */
  noRecords?: boolean;
  score?: number;
  /** Delivery cargo integrity 0..1. */
  integrity?: number;
  /** Bomb exploded / cargo destroyed. */
  failed?: boolean;
  stake?: number;
  prizeCar?: CarId | null;
  /** Settings difficulty (defaults to normal). */
  difficulty?: Difficulty;
  wrecks?: number;
  jumps?: number;
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
  nearMisses: number;
  smashes: number;
}

export interface Payout {
  lines: { key: string; value: number }[];
  multiplier: number;
  credits: number;
  techParts: number;
  beatPar: boolean;
  firstBoss: boolean;
  medal?: number;
  prizeCar?: CarId | null;
  stakeBack?: number;
}

const POSITION_PAY: Record<RaceMode, number[]> = {
  time_attack: [],
  elimination: [600, 360, 200, 90],
  drift_trial: [], speed_run: [], delivery: [],
  pink_slip: [750, 0],
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
  let medal: number | undefined;
  if (r.mode === 'time_attack') {
    beatPar = r.time <= preset.parTime;
    lines.push({ key: beatPar ? 'payParBeat' : 'payFinish', value: beatPar ? 350 : 140 });
  } else if (r.mode === 'drift_trial') {
    medal = driftMedal(r.score ?? 0);
    lines.push({ key: 'payScore', value: Math.floor(Math.min(r.score ?? 0, 30000) / 8) });
    if (medal) lines.push({ key: 'payMedal', value: [0, 300, 600, 1000][medal] });
  } else if (r.mode === 'speed_run') {
    lines.push({ key: r.failed ? 'payFinish' : 'payBomb', value: r.failed ? 60 : 550 });
  } else if (r.mode === 'delivery') {
    lines.push({ key: r.failed ? 'payFinish' : 'payCargo', value: r.failed ? 40 : Math.round(600 * (r.integrity ?? 1)) });
    if (!r.failed && r.time <= preset.parTime * 0.62) lines.push({ key: 'payParBeat', value: 200 });
  } else {
    lines.push({ key: 'payPlace', value: POSITION_PAY[r.mode][r.position - 1] ?? 60 });
  }
  if (r.driftScore > 0 && r.mode !== 'drift_trial') lines.push({ key: 'payDrift', value: Math.floor(r.driftScore / 12) });
  if (r.perfectDrifts > 0) lines.push({ key: 'payPerfect', value: r.perfectDrifts * 15 });
  if (r.coins > 0) lines.push({ key: 'payCoins', value: r.coins * 5 });
  if (r.jumpBonus > 0) lines.push({ key: 'payJumps', value: r.jumpBonus });
  if (r.nearMisses > 0) lines.push({ key: 'payNearMiss', value: Math.min(25, r.nearMisses) * 10 });
  if (r.smashes > 0) lines.push({ key: 'paySmash', value: Math.min(40, r.smashes) * 2 });
  const base = lines.reduce((s, l) => s + l.value, 0);
  const multiplier = payoutMultiplier(level) * DIFFICULTY[r.difficulty ?? 'normal'].pay * (perkFor(save, r.biome) === 'sponsor' ? 1.2 : 1);
  let credits = Math.round(base * multiplier);
  let techParts = 0;
  let firstBoss = false;
  const won = r.position === 1;
  let prizeCar: CarId | null = null;
  let stakeBack = 0;
  if (r.mode === 'time_attack') techParts = beatPar ? 1 : 0;
  else if (r.mode === 'drift_trial') techParts = medal === 3 ? 2 : medal === 2 ? 1 : 0;
  else if (r.mode === 'speed_run') techParts = r.failed ? 0 : 1;
  else if (r.mode === 'delivery') techParts = !r.failed && (r.integrity ?? 0) >= 0.9 ? 1 : 0;
  else if (r.mode === 'pink_slip') {
    if (won) { techParts = 1; prizeCar = r.prizeCar ?? null; stakeBack = (r.stake ?? 0) * 2; }
  } else if (r.mode === 'boss') {
    if (won) {
      techParts = 3;
      if (!save.bossesBeaten.includes(r.biome)) { firstBoss = true; credits += 2000; techParts += 4; }
    }
  } else if (won) techParts = 1;
  return { lines, multiplier, credits, techParts, beatPar, firstBoss, medal, prizeCar, stakeBack };
}

export function applyPayout(save: SaveData, r: RaceStats, p: Payout): void {
  save.credits += p.credits;
  save.techParts += p.techParts;
  const key = `${r.biome}:${r.mode}`;
  if (p.stakeBack) save.credits += p.stakeBack;
  if (p.prizeCar && !save.carsOwned.includes(p.prizeCar)) save.carsOwned.push(p.prizeCar);
  if (r.noRecords) return;
  if (r.mode === 'drift_trial') {
    if ((r.score ?? 0) > (save.bestScores[key] ?? 0)) save.bestScores[key] = r.score ?? 0;
    return;
  }
  if (r.mode !== 'time_attack' && r.position !== 1) return;
  if (!(key in save.bestTimes) || r.time < save.bestTimes[key]) save.bestTimes[key] = r.time;
  if (r.mode === 'boss' && r.position === 1 && !save.bossesBeaten.includes(r.biome)) save.bossesBeaten.push(r.biome);
}

export function buyCar(save: SaveData, id: CarId): BuyResult {
  if (save.carsOwned.includes(id)) return 'owned';
  const cost = CARS[id].cost;
  if (save.credits < cost) return 'poor';
  save.credits -= cost;
  save.carsOwned.push(id);
  save.car = id;
  return 'ok';
}

export function selectCar(save: SaveData, id: CarId): boolean {
  if (!save.carsOwned.includes(id)) return false;
  save.car = id;
  return true;
}

/** Apply the garage tuning sliders: gearing (top speed vs acceleration) and downforce (grip vs top speed). */
export function applyTune(stats: ReturnType<typeof tunedStats>, tune: { gear: number; aero: number }) {
  return {
    ...stats,
    maxSpeed: stats.maxSpeed * (1 + 0.06 * tune.gear) * (1 - 0.04 * tune.aero),
    accel: stats.accel * (1 - 0.08 * tune.gear),
    grip: stats.grip * (1 + 0.1 * tune.aero),
  };
}

export function perkFor(save: SaveData, biome: BiomeId): Perk | null {
  return save.locations[biome] >= 3 ? save.perks[biome] ?? null : null;
}

export const PERK_CHANGE_COST = 500;

/** Choose (or change, for a fee) the focus of a location. */
export function choosePerk(save: SaveData, biome: BiomeId, perk: Perk): BuyResult {
  if (save.locations[biome] < 3) return 'locked';
  const cur = save.perks[biome];
  if (cur === perk) return 'owned';
  if (cur) { if (save.credits < PERK_CHANGE_COST) return 'poor'; save.credits -= PERK_CHANGE_COST; }
  save.perks[biome] = perk;
  return 'ok';
}

export function carSetup(save: SaveData) {
  const base = applyTune(applyCar(tunedStats(save.upgrades), CARS[save.car]), save.tune);
  return { stats: base, mods: modsFor(save.loadout) };
}

// ---- passive income ----
export const INCOME_PER_LEVEL_HOUR = 25;
export const INCOME_CAP_HOURS = 8;
export function incomeReady(save: SaveData, now = Date.now()): number {
  const hours = Math.max(0, Math.min(INCOME_CAP_HOURS, (now - save.incomeAt) / 3600000));
  let perHour = 0;
  for (const b of BIOME_ORDER) perHour += (save.locations[b] - 1) * INCOME_PER_LEVEL_HOUR;
  return Math.floor(perHour * hours);
}
export function collectIncome(save: SaveData, now = Date.now()): number {
  const c = incomeReady(save, now);
  save.incomeAt = now;
  save.credits += c;
  save.stats.earned += c;
  return c;
}

// ---- time-attack medals ----
export const MEDAL_FACTORS = [1.1, 1.0, 0.9]; // bronze, silver, gold as a factor of the par time
export function medalFor(time: number, par: number): number {
  return MEDAL_FACTORS.filter((f) => time <= par * f).length;
}
const MEDAL_REWARD: { credits: number; techParts: number }[] = [{ credits: 0, techParts: 0 }, { credits: 250, techParts: 0 }, { credits: 500, techParts: 1 }, { credits: 900, techParts: 2 }];
/** Record a medal; pays the difference to the previous best tier. */
export function awardMedal(save: SaveData, biome: BiomeId, time: number): { medal: number; credits: number; techParts: number; improved: boolean } {
  const medal = medalFor(time, BIOME_PRESETS[biome].parTime);
  const prev = save.medals[biome] ?? 0;
  if (medal <= prev) return { medal, credits: 0, techParts: 0, improved: false };
  let credits = 0, techParts = 0;
  for (let t = prev + 1; t <= medal; t++) { credits += MEDAL_REWARD[t].credits; techParts += MEDAL_REWARD[t].techParts; }
  save.medals[biome] = medal;
  save.credits += credits; save.techParts += techParts;
  return { medal, credits, techParts, improved: true };
}

/** Lifetime counters for achievements. Call once per finished race, after applyPayout. */
export function recordStats(save: SaveData, r: RaceStats, creditsEarned: number): void {
  const st = save.stats;
  st.races++;
  if (r.position === 1 && r.mode !== 'time_attack' && r.mode !== 'drift_trial') st.wins++;
  else if (r.mode === 'time_attack' && r.time <= BIOME_PRESETS[r.biome].parTime) st.wins++;
  st.nearMisses += r.nearMisses;
  st.perfectDrifts += r.perfectDrifts;
  st.smashes += r.smashes;
  st.coins += r.coins;
  st.wrecks += r.wrecks ?? 0;
  st.jumps += r.jumps ?? 0;
  st.earned += creditsEarned;
}

/** Today's daily challenge, picked among the biomes this player has unlocked. */
export function todaysChallenge(save: SaveData): DailyChallenge {
  return dailyChallenge(todayStr(), BIOME_ORDER.filter((b) => isBiomeUnlocked(save, b)));
}

/** Cost to bring the car back to 100%. */
export function repairCost(save: SaveData): number {
  return Math.round(save.damage * 900);
}

export function repairCar(save: SaveData): BuyResult {
  if (save.damage <= 0.005) return 'owned';
  const cost = repairCost(save);
  if (save.credits < cost) return 'poor';
  save.credits -= cost;
  save.damage = 0;
  return 'ok';
}
