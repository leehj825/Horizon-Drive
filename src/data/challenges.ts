import { BIOME_PRESETS, type BiomeId } from './biomes';
import type { ChampProgress, SaveData } from './saveState';
import { mulberry32 } from '../world/PropFactory';

export interface Championship {
  id: string;
  biomes: BiomeId[];
  /** Fixed rival names so points carry across rounds. */
  rivals: [string, string, string];
  rewards: { gold: number; silver: number; bronze: number };
  techParts: { gold: number; silver: number; bronze: number };
}

export const CHAMPIONSHIPS: Championship[] = [
  { id: 'street_series', biomes: ['neon_street', 'harbor_docks', 'downtown_day'], rivals: ['Kira', 'Dash', 'Nyx'], rewards: { gold: 2500, silver: 1500, bronze: 800 }, techParts: { gold: 4, silver: 2, bronze: 1 } },
  { id: 'open_road_cup', biomes: ['red_canyon', 'coast_highway', 'alpine_pass'], rivals: ['Rook', 'Vex', 'Juno'], rewards: { gold: 4000, silver: 2400, bronze: 1200 }, techParts: { gold: 6, silver: 3, bronze: 1 } },
];

export const CHAMP_POINTS = [10, 6, 3, 1];

export function champById(id: string): Championship {
  return CHAMPIONSHIPS.find((c) => c.id === id) ?? CHAMPIONSHIPS[0];
}

export function champProgress(save: SaveData, id: string): ChampProgress {
  return save.champs[id] ?? { round: 0, points: [0, 0, 0, 0], done: false, trophy: null };
}

export function champUnlocked(c: Championship, unlocked: (id: BiomeId) => boolean): boolean {
  return c.biomes.every(unlocked);
}

export interface RoundResult {
  round: number;
  gained: number[];
  points: number[];
  /** Names sorted by championship standing (YOU included). */
  standings: string[];
  finished: boolean;
  trophy: 'gold' | 'silver' | 'bronze' | null;
  credits: number;
  techParts: number;
}

/**
 * Record one finished round. `order` = racer names in finishing order (the player is 'YOU'); unknown names are ignored,
 * rivals missing from the order (e.g. a duel) score nothing.
 */
export function recordChampRound(save: SaveData, id: string, order: string[]): RoundResult {
  const c = champById(id);
  const prog = { ...champProgress(save, id), points: [...champProgress(save, id).points] };
  const names = ['YOU', ...c.rivals];
  const gained = [0, 0, 0, 0];
  order.forEach((n, i) => { const k = names.indexOf(n); if (k >= 0) gained[k] = CHAMP_POINTS[i] ?? 0; });
  prog.points = prog.points.map((p, i) => p + gained[i]);
  prog.round += 1;
  const standings = names.map((n, i) => ({ n, p: prog.points[i], last: gained[i] }))
    .sort((a, b) => b.p - a.p || b.last - a.last).map((x) => x.n);
  let credits = 0, techParts = 0;
  const finished = prog.round >= c.biomes.length;
  if (finished) {
    prog.done = true;
    const place = standings.indexOf('YOU');
    prog.trophy = place === 0 ? 'gold' : place === 1 ? 'silver' : place === 2 ? 'bronze' : null;
    if (prog.trophy) { credits = c.rewards[prog.trophy]; techParts = c.techParts[prog.trophy]; }
    if (prog.trophy === 'gold') save.stats.champsWon++;
  }
  save.champs[id] = prog;
  save.credits += credits; save.techParts += techParts;
  return { round: prog.round, gained, points: prog.points, standings, finished, trophy: prog.trophy, credits, techParts };
}

export function resetChamp(save: SaveData, id: string): void {
  delete save.champs[id];
}

// ---------------- daily challenge ----------------

export interface DailyMods {
  trafficMul: number;
  oncoming: number | null;
  skillAdd: number;
}

export interface DailyChallenge {
  date: string;
  biome: BiomeId;
  mods: DailyMods;
  modIds: ('heavyTraffic' | 'oncomingRush' | 'toughRivals')[];
  reward: { credits: number; techParts: number };
}

export function todayStr(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic challenge for a date: same for every player, no server needed. */
export function dailyChallenge(date: string, unlocked: BiomeId[]): DailyChallenge {
  const rng = mulberry32(hash('hd-' + date));
  const pool = unlocked.filter((b) => !!BIOME_PRESETS[b]);
  const biome = pool[Math.floor(rng() * pool.length)] ?? 'neon_street';
  const all: DailyChallenge['modIds'] = ['heavyTraffic', 'oncomingRush', 'toughRivals'];
  const ids = all.filter(() => rng() < 0.55);
  if (!ids.length) ids.push(all[Math.floor(rng() * all.length)]);
  const mods: DailyMods = {
    trafficMul: ids.includes('heavyTraffic') ? 1.8 : 1,
    oncoming: ids.includes('oncomingRush') ? 0.75 : null,
    skillAdd: ids.includes('toughRivals') ? 0.06 : 0,
  };
  const reward = { credits: 700 + ids.length * 250, techParts: ids.length >= 2 ? 2 : 1 };
  return { date, biome, mods, modIds: ids, reward };
}

export function dailyStatus(save: SaveData, date: string): { done: boolean; streak: number } {
  return { done: save.daily.date === date && save.daily.done, streak: save.dailyStreak };
}

/** Claim the daily reward (once per date). Streak: +10% per consecutive day up to +50%. */
export function claimDaily(save: SaveData, ch: DailyChallenge, position: number): { credits: number; techParts: number; streak: number } | null {
  if (position > 2 || (save.daily.date === ch.date && save.daily.done)) return null;
  const yesterday = new Date(ch.date + 'T00:00:00Z');
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  save.dailyStreak = save.lastDailyDate === todayStr(yesterday) ? save.dailyStreak + 1 : 1;
  save.lastDailyDate = ch.date;
  save.daily = { date: ch.date, done: true };
  const bonus = 1 + Math.min(5, save.dailyStreak - 1) * 0.1;
  const credits = Math.round(ch.reward.credits * bonus);
  save.credits += credits; save.techParts += ch.reward.techParts;
  save.stats.dailies++;
  return { credits, techParts: ch.reward.techParts, streak: save.dailyStreak };
}
