import { BIOME_ORDER } from './biomes';
import { CAR_IDS } from './cars';
import type { SaveData } from './saveState';
import { MAX_LOCATION_LEVEL } from './upgrades';

export interface Achievement {
  id: string;
  reward: number;
  /** current / target for the progress bar */
  progress: (s: SaveData) => [number, number];
}

const stat = (key: keyof SaveData['stats'], target: number) => (s: SaveData): [number, number] => [Math.min(s.stats[key], target), target];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'firstWin', reward: 200, progress: stat('wins', 1) },
  { id: 'tenWins', reward: 800, progress: stat('wins', 10) },
  { id: 'driftKing', reward: 600, progress: stat('perfectDrifts', 25) },
  { id: 'closeCalls', reward: 600, progress: stat('nearMisses', 50) },
  { id: 'smasher', reward: 400, progress: stat('smashes', 200) },
  { id: 'demolition', reward: 500, progress: stat('wrecks', 20) },
  { id: 'airtime', reward: 400, progress: stat('jumps', 10) },
  { id: 'goldDigger', reward: 500, progress: stat('coins', 500) },
  { id: 'collector', reward: 1500, progress: (s) => [s.carsOwned.length, CAR_IDS.length] },
  { id: 'bossSlayer', reward: 1200, progress: (s) => [Math.min(1, s.bossesBeaten.length), 1] },
  { id: 'cityMaster', reward: 2000, progress: (s) => [Math.min(1, BIOME_ORDER.filter((b) => s.locations[b] >= MAX_LOCATION_LEVEL).length), 1] },
  { id: 'champion', reward: 1500, progress: stat('champsWon', 1) },
  { id: 'dailyHabit', reward: 700, progress: (s) => [Math.min(s.dailyStreak, 3), 3] },
];

/** Unlocks every achievement whose progress is complete; pays the credits. Returns the newly unlocked ids. */
export function checkAchievements(save: SaveData): string[] {
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements.includes(a.id)) continue;
    const [cur, tgt] = a.progress(save);
    if (cur >= tgt) { save.achievements.push(a.id); save.credits += a.reward; out.push(a.id); }
  }
  return out;
}
