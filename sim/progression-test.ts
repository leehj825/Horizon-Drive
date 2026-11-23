import { strict as assert } from 'node:assert';
import { BIOME_ORDER } from '../src/data/biomes';
import { modsFor } from '../src/data/equipment';
import { applyPayout, buyCar, selectCar, carSetup, buyEquipment, buyUpgrade, computePayout, isBiomeUnlocked, modeAvailable, toggleEquip, upgradeLocation } from '../src/data/progression';
import { SaveState } from '../src/data/saveState';
import { BASE_STATS, featuresFor, locationCost, payoutMultiplier, tunedStats } from '../src/data/upgrades';
import { ACHIEVEMENTS, checkAchievements } from '../src/data/achievements';
import { CHAMPIONSHIPS, claimDaily, dailyChallenge, recordChampRound, todayStr } from '../src/data/challenges';
import { DIFFICULTY, recordStats } from '../src/data/progression';
import { repairCar, repairCost } from '../src/data/progression';
import { I18n } from '../src/i18n/i18n';
import { TRANSLATIONS } from '../src/i18n/translations';

const save = new SaveState();
const d = save.data;
assert.equal(d.credits, 600);
assert.ok(!isBiomeUnlocked(d, 'red_canyon'), 'canyon locked at start');
assert.equal(upgradeLocation(d, 'red_canyon'), 'locked');
assert.equal(upgradeLocation(d, 'neon_street'), 'poor', '600 CR cannot buy 800 CR upgrade');

// vehicle upgrades
assert.equal(buyUpgrade(d, 'engine'), 'ok');
assert.equal(d.credits, 450);
assert.ok(tunedStats(d.upgrades).maxSpeed > BASE_STATS.maxSpeed);

// equipment
d.credits += 1000;
assert.equal(buyEquipment(d, 'util_magnet'), 'ok');
assert.equal(buyEquipment(d, 'util_magnet'), 'owned');
assert.ok(toggleEquip(d, 'util_magnet'));
assert.equal(d.loadout.utility, 'util_magnet');
assert.equal(modsFor(d.loadout).magnetRadius, 20);
assert.ok(toggleEquip(d, 'util_magnet'));
assert.equal(d.loadout.utility, null);
assert.ok(!toggleEquip(d, 'boost_twin'), 'cannot equip what you do not own');
assert.equal(modsFor({ booster: 'boost_twin' }).nitroDurationMul, 1.35);
assert.equal(modsFor({ booster: 'boost_drift' }).driftNitroMul, 2);
assert.equal(modsFor({ suspension: 'susp_street' }).asphaltGrip, 0.2);

// location upgrades & unlock chain
d.credits = 100000; d.techParts = 100;
for (let lv = 1; lv < 5; lv++) assert.equal(upgradeLocation(d, 'neon_street'), 'ok');
assert.equal(d.locations.neon_street, 5);
assert.equal(upgradeLocation(d, 'neon_street'), 'max');
assert.ok(isBiomeUnlocked(d, 'red_canyon'));
assert.ok(!isBiomeUnlocked(d, 'coast_highway'));
assert.ok(modeAvailable(d, 'neon_street', 'boss'));
assert.ok(!modeAvailable(d, 'red_canyon', 'boss'));
assert.deepEqual(locationCost(1), { credits: 800, techParts: 0 });

// features per level (doc table)
assert.deepEqual(Object.values(featuresFor(1)).slice(0, 4), [false, false, false, false]);
assert.ok(featuresFor(2).sponsors && !featuresFor(2).boostPads);
assert.ok(featuresFor(3).boostPads && !featuresFor(3).jumps);
assert.ok(featuresFor(4).jumps && !featuresFor(4).festival);
assert.ok(featuresFor(5).festival);
assert.equal(payoutMultiplier(1), 1); assert.equal(payoutMultiplier(2), 1.25); assert.equal(payoutMultiplier(5), 2);

// payouts
const s2 = new SaveState().data;
const r = { biome: 'neon_street' as const, mode: 'circuit' as const, position: 1, time: 150, driftScore: 1200, perfectDrifts: 2, coins: 10, jumpBonus: 0, nearMisses: 0, smashes: 0 };
const p = computePayout(s2, r);
assert.equal(p.credits, 550 + 100 + 30 + 50);
assert.equal(p.techParts, 1);
applyPayout(s2, r, p);
assert.equal(s2.bestTimes['neon_street:circuit'], 150);
const chaos = computePayout(s2, { ...r, nearMisses: 3, smashes: 10 });
assert.equal(chaos.credits, p.credits + 30 + 20);
const boss = computePayout({ ...s2, locations: { ...s2.locations, neon_street: 5 } }, { ...r, mode: 'boss' });
assert.ok(boss.firstBoss && boss.techParts === 7 && boss.credits > 2000);
const ta = computePayout(s2, { ...r, mode: 'time_attack', time: 100 });
assert.ok(ta.beatPar && ta.techParts === 1);
const lose = computePayout(s2, { ...r, position: 4, driftScore: 0, perfectDrifts: 0, coins: 0 });
assert.equal(lose.credits, 90); assert.equal(lose.techParts, 0);

// cars
const sc = new SaveState().data;
assert.equal(buyCar(sc, 'hatch'), 'poor');
sc.credits = 5000;
assert.equal(buyCar(sc, 'hatch'), 'ok');
assert.equal(sc.car, 'hatch');
assert.equal(buyCar(sc, 'hatch'), 'owned');
assert.ok(!selectCar(sc, 'hyper'));
assert.ok(selectCar(sc, 'coupe'));
const coupe = carSetup(sc).stats;
selectCar(sc, 'hatch');
const hatch = carSetup(sc).stats;
assert.ok(hatch.grip > coupe.grip && hatch.maxSpeed < coupe.maxSpeed);

// difficulty scales the payout
const hard = computePayout(s2, { ...r, difficulty: 'hard' });
const easy = computePayout(s2, { ...r, difficulty: 'easy' });
assert.ok(hard.credits > p.credits && easy.credits < p.credits);
assert.ok(DIFFICULTY.hard.skill > DIFFICULTY.easy.skill);

// championship: 3 rounds, points 10/6/3/1, trophy by final standing
const cs = new SaveState().data;
const champ = CHAMPIONSHIPS[0];
let rr = recordChampRound(cs, champ.id, ['YOU', 'Kira', 'Dash', 'Nyx']);
assert.deepEqual(rr.gained, [10, 6, 3, 1]);
assert.ok(!rr.finished);
rr = recordChampRound(cs, champ.id, ['Kira', 'YOU', 'Dash', 'Nyx']);
rr = recordChampRound(cs, champ.id, ['YOU', 'Nyx', 'Kira', 'Dash']);
assert.ok(rr.finished && rr.trophy === 'gold');
assert.equal(cs.credits, 600 + champ.rewards.gold);
assert.equal(cs.stats.champsWon, 1);
const cs2 = new SaveState().data;
['Kira', 'Dash', 'Nyx'].forEach((n) => recordChampRound(cs2, champ.id, [n, 'YOU', 'Kira', 'Dash'].filter((x, i, a) => a.indexOf(x) === i)));
assert.ok(cs2.champs[champ.id].done);

// daily: deterministic per date, claim once, streak
const d1 = dailyChallenge('2026-11-23', ['neon_street', 'harbor_docks']);
assert.deepEqual(d1, dailyChallenge('2026-11-23', ['neon_street', 'harbor_docks']));
assert.ok(['neon_street', 'harbor_docks'].includes(d1.biome));
const ds = new SaveState().data;
assert.equal(claimDaily(ds, d1, 3), null, 'needs a top-2 finish');
const c1 = claimDaily(ds, d1, 1)!;
assert.equal(c1.streak, 1);
assert.equal(claimDaily(ds, d1, 1), null, 'once per day');
const d2 = dailyChallenge('2026-11-24', ['neon_street']);
assert.equal(claimDaily(ds, d2, 2)!.streak, 2);
assert.equal(todayStr(new Date('2026-01-02T12:00:00Z')), '2026-01-02');

// achievements pay once
const as = new SaveState().data;
recordStats(as, { ...r, nearMisses: 0, smashes: 0 }, 100);
assert.deepEqual(checkAchievements(as), ['firstWin']);
assert.deepEqual(checkAchievements(as), []);
assert.equal(as.credits, 600 + ACHIEVEMENTS.find((a) => a.id === 'firstWin')!.reward);

// new modes
import { DRIFT_MEDALS, driftMedal, pinkSlipPrize } from '../src/data/progression';
const nm = new SaveState().data;
const base = { biome: 'neon_street' as const, position: 1, time: 100, driftScore: 0, perfectDrifts: 0, coins: 0, jumpBonus: 0, nearMisses: 0, smashes: 0 };
const dt1 = computePayout(nm, { ...base, mode: 'drift_trial', score: 2500 });
assert.equal(dt1.medal, 2); assert.equal(dt1.techParts, 1);
assert.equal(driftMedal(DRIFT_MEDALS[2]), 3);
const bomb = computePayout(nm, { ...base, mode: 'speed_run', failed: false });
assert.equal(bomb.lines[0].key, 'payBomb'); assert.equal(bomb.techParts, 1);
assert.equal(computePayout(nm, { ...base, mode: 'speed_run', position: 4, failed: true }).techParts, 0);
const del = computePayout(nm, { ...base, mode: 'delivery', integrity: 0.5, time: 999 });
assert.equal(del.lines[0].value, 300);
const slip = pinkSlipPrize(nm)!;
assert.equal(slip.car, 'hatch'); assert.equal(slip.stake, 420);
nm.credits = 1000;
const pw = computePayout(nm, { ...base, mode: 'pink_slip', stake: slip.stake, prizeCar: slip.car });
applyPayout(nm, { ...base, mode: 'pink_slip', stake: slip.stake, prizeCar: slip.car }, pw);
assert.ok(nm.carsOwned.includes('hatch'));
assert.ok(nm.credits >= 1000 + slip.stake * 2);
assert.equal(pinkSlipPrize(nm)!.car, 'muscle');
const el = computePayout(nm, { ...base, mode: 'elimination', position: 2 });
assert.equal(el.lines[0].value, 360);

// perks, income, tuning, medals
import { applyTune, awardMedal, choosePerk, collectIncome, incomeReady, medalFor, perkFor } from '../src/data/progression';
const pk = new SaveState().data;
assert.equal(choosePerk(pk, 'neon_street', 'racing'), 'locked', 'needs Lv.3');
pk.locations.neon_street = 3;
assert.equal(choosePerk(pk, 'neon_street', 'racing'), 'ok');
assert.equal(perkFor(pk, 'neon_street'), 'racing');
pk.credits = 100;
assert.equal(choosePerk(pk, 'neon_street', 'sponsor'), 'poor', 'changing costs credits');
pk.credits = 1000;
assert.equal(choosePerk(pk, 'neon_street', 'sponsor'), 'ok');
assert.equal(pk.credits, 500);
const spons = computePayout(pk, { ...base, mode: 'circuit', position: 1 });
pk.perks.neon_street = 'safety';
const nonSpons = computePayout(pk, { ...base, mode: 'circuit', position: 1 });
assert.ok(spons.credits > nonSpons.credits);
const inc = new SaveState().data;
inc.locations.neon_street = 3; inc.locations.red_canyon = 2;
inc.incomeAt = 1_000_000;
assert.equal(incomeReady(inc, 1_000_000 + 3600_000), 75);
assert.equal(incomeReady(inc, 1_000_000 + 100 * 3600_000), 75 * 8, 'capped at 8 hours');
assert.equal(collectIncome(inc, 1_000_000 + 7200_000), 150);
assert.equal(incomeReady(inc, 1_000_000 + 7200_000), 0);
const tuned = applyTune({ maxSpeed: 50, accel: 25, grip: 5, nitroRate: 1, wallKeep: 0.6, landSoak: 0, armor: 1 }, { gear: 1, aero: 0 });
assert.ok(tuned.maxSpeed > 50 && tuned.accel < 25);
const tuned2 = applyTune({ maxSpeed: 50, accel: 25, grip: 5, nitroRate: 1, wallKeep: 0.6, landSoak: 0, armor: 1 }, { gear: 0, aero: 1 });
assert.ok(tuned2.grip > 5 && tuned2.maxSpeed < 50);
const md = new SaveState().data;
const par = 235;
assert.equal(medalFor(300, par), 0); assert.equal(medalFor(250, par), 1); assert.equal(medalFor(235, par), 2); assert.equal(medalFor(200, par), 3);
const m1 = awardMedal(md, 'neon_street', 250);
assert.deepEqual([m1.medal, m1.credits, m1.improved], [1, 250, true]);
const m2 = awardMedal(md, 'neon_street', 200);
assert.deepEqual([m2.medal, m2.credits, m2.techParts], [3, 1400, 3], 'pays silver + gold on top of bronze');
assert.equal(awardMedal(md, 'neon_street', 200).improved, false);

// damage and repair
const dm = new SaveState().data;
assert.equal(repairCar(dm), 'owned');
dm.damage = 0.5;
assert.equal(repairCost(dm), 450);
dm.credits = 100;
assert.equal(repairCar(dm), 'poor');
dm.credits = 1000;
assert.equal(repairCar(dm), 'ok');
assert.equal(dm.damage, 0);
assert.equal(dm.credits, 550);

// i18n: EN/KO parity and fallback
function keys(o: unknown, pre = ''): string[] {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, pre + k + '.') : [pre + k]));
}
assert.deepEqual(keys(TRANSLATIONS.en).sort(), keys(TRANSLATIONS.ko).sort(), 'EN and KO keys match');
const i = new I18n('en');
assert.equal(i.t('ui.play'), 'RACE');
i.setLanguage('ko');
assert.equal(i.t('ui.play'), '레이스 시작');
assert.equal(i.t('ui.jump', { n: 25 }), '점프! +25 CR');
assert.equal(i.t('nope.key'), 'nope.key');
for (const b of BIOME_ORDER) assert.ok(i.t(`biomes.${b}.name`) !== `biomes.${b}.name`);

console.log('progression + i18n tests passed');
