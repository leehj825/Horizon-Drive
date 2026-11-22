import { strict as assert } from 'node:assert';
import { BIOME_ORDER } from '../src/data/biomes';
import { modsFor } from '../src/data/equipment';
import { applyPayout, buyEquipment, buyUpgrade, computePayout, isBiomeUnlocked, modeAvailable, toggleEquip, upgradeLocation } from '../src/data/progression';
import { SaveState } from '../src/data/saveState';
import { BASE_STATS, featuresFor, locationCost, payoutMultiplier, tunedStats } from '../src/data/upgrades';
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
const r = { biome: 'neon_street' as const, mode: 'circuit' as const, position: 1, time: 150, driftScore: 1200, perfectDrifts: 2, coins: 10, jumpBonus: 0 };
const p = computePayout(s2, r);
assert.equal(p.credits, 550 + 100 + 30 + 50);
assert.equal(p.techParts, 1);
applyPayout(s2, r, p);
assert.equal(s2.bestTimes['neon_street:circuit'], 150);
const boss = computePayout({ ...s2, locations: { ...s2.locations, neon_street: 5 } }, { ...r, mode: 'boss' });
assert.ok(boss.firstBoss && boss.techParts === 7 && boss.credits > 2000);
const ta = computePayout(s2, { ...r, mode: 'time_attack', time: 100 });
assert.ok(ta.beatPar && ta.techParts === 1);
const lose = computePayout(s2, { ...r, position: 4, driftScore: 0, perfectDrifts: 0, coins: 0 });
assert.equal(lose.credits, 90); assert.equal(lose.techParts, 0);

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
