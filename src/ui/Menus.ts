import { BIOME_ORDER, BIOME_PRESETS, type BiomeId } from '../data/biomes';
import { EQUIPMENT_LIST, SLOTS, type EquipmentId, type SlotId } from '../data/equipment';
import { CAR_IDS, CARS, PAINTS, type CarId } from '../data/cars';
import { buyCar, buyEquipment, buyUpgrade, carSetup, selectCar, isBiomeUnlocked, modeAvailable, toggleEquip, upgradeLocation, type Payout, type RaceMode } from '../data/progression';
import type { SaveState } from '../data/saveState';
import { MAX_LOCATION_LEVEL, MAX_UPGRADE, UPGRADE_IDS, locationCost, payoutMultiplier, upgradeCost, type UpgradeId } from '../data/upgrades';
import type { I18n } from '../i18n/i18n';
import type { Synth } from '../audio/Synth';
import { fmtTime } from './Hud';

export type Screen = 'none' | 'main' | 'race' | 'garage' | 'locations' | 'results' | 'pause';

export interface ResultsData {
  biome: BiomeId;
  mode: RaceMode;
  position: number;
  total: number;
  time: number;
  bestLap: number;
  payout: Payout;
  newBest: boolean;
}

export interface MenuHost {
  save: SaveState;
  i18n: I18n;
  sfx: Synth;
  previewBiome(id: BiomeId): void;
  refreshCar(): void;
  startRace(biome: BiomeId, mode: RaceMode): void;
  resume(): void;
  retry(): void;
  quit(): void;
  /** Camera framing for the menu backdrop. */
  setShowroom(close: boolean): void;
}

const MODES: RaceMode[] = ['time_attack', 'duel', 'circuit', 'boss'];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** DOM menus: main, race setup, garage, locations, results, pause. Pure view over SaveState. */
export class Menus {
  screen: Screen = 'none';
  private mode: RaceMode = 'time_attack';
  private results: ResultsData | null = null;
  readonly root: HTMLElement;

  constructor(parent: HTMLElement, private host: MenuHost) {
    this.root = document.createElement('div');
    this.root.id = 'screen';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      this.act(el.dataset.act!, el.dataset.arg ?? '');
    });
    host.i18n.onChange(() => this.render());
    host.save.onChange(() => { if (this.screen !== 'none') this.render(); });
  }

  private get t() { return (p: string, v?: Record<string, string | number>) => this.host.i18n.t(p, v); }

  show(screen: Screen, results?: ResultsData): void {
    this.screen = screen;
    if (results) this.results = results;
    this.host.setShowroom(screen === 'garage');
    this.render();
  }

  private act(a: string, arg: string): void {
    const { save, sfx } = this.host;
    const d = save.data;
    sfx.resume();
    switch (a) {
      case 'nav': sfx.click(); this.show(arg as Screen); return;
      case 'lang': sfx.click(); d.lang = arg as 'en' | 'ko'; save.save(); this.host.i18n.setLanguage(arg as 'en' | 'ko'); return;
      case 'sound': d.muted = !d.muted; sfx.setMuted(d.muted); save.save(); return;
      case 'fullscreen': if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); return;
      case 'reset': if (confirm(this.t('ui.resetConfirm'))) { save.reset(); this.host.i18n.setLanguage(save.data.lang); this.host.previewBiome(save.data.selectedBiome); this.host.refreshCar(); } return;
      case 'biome': {
        const id = arg as BiomeId;
        if (!isBiomeUnlocked(d, id)) return;
        sfx.click(); d.selectedBiome = id; save.save(); this.host.previewBiome(id);
        if (!modeAvailable(d, id, this.mode)) this.mode = 'time_attack';
        this.render();
        return;
      }
      case 'mode': if (modeAvailable(d, d.selectedBiome, arg as RaceMode)) { sfx.click(); this.mode = arg as RaceMode; this.render(); } return;
      case 'start': this.host.startRace(d.selectedBiome, this.mode); return;
      case 'buyCar': if (buyCar(d, arg as CarId) === 'ok') { sfx.buy(); save.save(); this.host.refreshCar(); } return;
      case 'selCar': if (selectCar(d, arg as CarId)) { sfx.click(); save.save(); this.host.refreshCar(); } return;
      case 'paint': d.paint = Number(arg); sfx.click(); save.save(); this.host.refreshCar(); return;
      case 'buyUp': if (buyUpgrade(d, arg as UpgradeId) === 'ok') { sfx.buy(); save.save(); this.host.refreshCar(); } return;
      case 'buyEq': if (buyEquipment(d, arg as EquipmentId) === 'ok') { sfx.buy(); toggleEquip(d, arg as EquipmentId); save.save(); this.host.refreshCar(); } return;
      case 'equip': if (toggleEquip(d, arg as EquipmentId)) { sfx.click(); save.save(); this.host.refreshCar(); } return;
      case 'upLoc': {
        const id = arg as BiomeId;
        if (upgradeLocation(d, id) === 'ok') { sfx.buy(); save.save(); if (id === d.selectedBiome) this.host.previewBiome(id); }
        return;
      }
      case 'resume': this.host.resume(); return;
      case 'retry': this.host.retry(); return;
      case 'quit': this.host.quit(); return;
    }
  }

  render(): void {
    const s = this.screen;
    this.root.className = `scr-${s}`;
    this.root.hidden = s === 'none';
    if (s === 'none') { this.root.innerHTML = ''; return; }
    const body = s === 'main' ? this.main() : s === 'race' ? this.raceSetup() : s === 'garage' ? this.garage() : s === 'locations' ? this.locations() : s === 'results' ? this.resultsView() : this.pause();
    this.root.innerHTML = body;
  }

  // ---- shared bits ----
  private wallet(): string {
    const d = this.host.save.data;
    return `<div class="wallet"><span class="chip cr">${d.credits.toLocaleString()} <small>${this.t('ui.credits')}</small></span><span class="chip tp">${d.techParts} <small>${this.t('ui.techParts')}</small></span></div>`;
  }

  private header(title: string, back = true): string {
    return `<div class="top">${back ? `<button class="btn ghost" data-act="nav" data-arg="main">‹ ${this.t('ui.back')}</button>` : '<span></span>'}<h2>${esc(title)}</h2>${this.wallet()}</div>`;
  }

  private pips(level: number, max: number): string {
    let h = '<span class="pips">';
    for (let i = 0; i < max; i++) h += `<i class="${i < level ? 'on' : ''}"></i>`;
    return h + '</span>';
  }

  // ---- main ----
  private main(): string {
    const d = this.host.save.data;
    const p = BIOME_PRESETS[d.selectedBiome];
    const lv = d.locations[d.selectedBiome];
    return `<div class="panel main">
      <div class="brand"><h1>${this.t('ui.title')}</h1><p>${this.t('ui.tagline')}</p></div>
      ${this.wallet()}
      <div class="menu-buttons">
        <button class="btn primary" data-act="nav" data-arg="race">${this.t('ui.play')}</button>
        <button class="btn" data-act="nav" data-arg="garage">${this.t('ui.garage')}</button>
        <button class="btn" data-act="nav" data-arg="locations">${this.t('ui.locations')}</button>
      </div>
      <div class="now"><b>${this.t('biomes.' + p.id + '.name')}</b> · ${this.t('ui.locationLevel')} ${lv} · ${this.t('ui.payoutBonus')} ×${payoutMultiplier(lv).toFixed(2)}</div>
      <div class="row settings">
        <span>${this.t('ui.language')}</span>
        <button class="btn sm ${d.lang === 'en' ? 'sel' : ''}" data-act="lang" data-arg="en">EN</button>
        <button class="btn sm ${d.lang === 'ko' ? 'sel' : ''}" data-act="lang" data-arg="ko">한국어</button>
        <button class="btn sm" data-act="sound">${this.t('ui.sound')}: ${d.muted ? this.t('ui.off') : this.t('ui.on')}</button>
        <button class="btn sm" data-act="fullscreen">${this.t('ui.fullscreen')}</button>
      </div>
      <p class="hint">${this.t('ui.controls')}</p>
      <button class="link" data-act="reset">${this.t('ui.reset')}</button>
    </div>`;
  }

  // ---- race setup ----
  private raceSetup(): string {
    const d = this.host.save.data;
    const sel = d.selectedBiome;
    const cards = BIOME_ORDER.map((id) => {
      const p = BIOME_PRESETS[id];
      const unlocked = isBiomeUnlocked(d, id);
      const gate = p.unlockedBy ? this.t('biomes.' + p.unlockedBy + '.name') : '';
      return `<button class="card biome ${id} ${sel === id ? 'sel' : ''} ${unlocked ? '' : 'lock'}" data-act="biome" data-arg="${id}">
        <b>${this.t('biomes.' + id + '.name')}</b>
        <span class="lv">${this.t('ui.locationLevel')} ${d.locations[id]}</span>
        <small>${unlocked ? this.t('biomes.' + id + '.desc') : '🔒 ' + this.t('ui.unlockHint', { biome: gate })}</small>
      </button>`;
    }).join('');
    const modeBtns = MODES.map((m) => {
      const ok = modeAvailable(d, sel, m);
      const best = d.bestTimes[`${sel}:${m}`];
      return `<button class="card mode ${this.mode === m ? 'sel' : ''} ${ok ? '' : 'lock'}" data-act="mode" data-arg="${m}">
        <b>${this.t('modes.' + m + '.name')}</b>
        <small>${ok ? this.t('modes.' + m + '.desc') : '🔒 ' + this.t('ui.bossHint')}</small>
        ${best ? `<span class="lv">${this.t('ui.best')} ${fmtTime(best)}</span>` : ''}
      </button>`;
    }).join('');
    const p = BIOME_PRESETS[sel];
    const rec = EQUIPMENT_LIST.filter((e) => e.recommended.includes(sel) && d.loadout[e.slot] !== e.id).map((e) => this.t('equipment.' + e.id + '.name'));
    const ghost = this.mode === 'time_attack' ? (d.ghosts[sel] ? `${this.t('ui.ghost')} ${fmtTime(d.ghosts[sel]!.time)}` : this.t('ui.noGhost')) : '';
    return `<div class="panel wide">${this.header(this.t('ui.play'))}
      <h3>${this.t('ui.selectLocation')}</h3><div class="cards">${cards}</div>
      <h3>${this.t('ui.selectEvent')}</h3><div class="cards">${modeBtns}</div>
      <div class="meta">${this.t('ui.par')} ${fmtTime(p.parTime)}${ghost ? ' · ' + ghost : ''}${rec.length ? `<br><span class="rec">★ ${this.t('ui.recommended')}: ${rec.join(', ')}</span>` : ''}</div>
      <button class="btn primary big" data-act="start">${this.t('ui.start')}</button>
    </div>`;
  }

  // ---- garage ----
  private garage(): string {
    const d = this.host.save.data;
    const { stats, mods } = carSetup(d);
    const rows = UPGRADE_IDS.map((id) => {
      const lv = d.upgrades[id];
      const max = lv >= MAX_UPGRADE;
      const cost = upgradeCost(lv);
      return `<div class="row up">
        <div class="grow"><b>${this.t('upgrades.' + id + '.name')}</b> ${this.pips(lv, MAX_UPGRADE)}<small>${this.t('upgrades.' + id + '.desc')}</small></div>
        <button class="btn sm ${max ? 'ghost' : 'primary'}" data-act="buyUp" data-arg="${id}" ${max || d.credits < cost ? 'disabled' : ''}>${max ? this.t('ui.maxed') : `${cost} ${this.t('ui.credits')}`}</button>
      </div>`;
    }).join('');
    const slotName: Record<SlotId, string> = { suspension: this.t('ui.slotSuspension'), booster: this.t('ui.slotBooster'), utility: this.t('ui.slotUtility') };
    const sel = d.selectedBiome;
    const eq = SLOTS.map((slot) => {
      const items = EQUIPMENT_LIST.filter((e) => e.slot === slot).map((e) => {
        const owned = d.owned.includes(e.id);
        const on = d.loadout[slot] === e.id;
        const rec = e.recommended.includes(sel) || e.recommended.includes('all');
        const btn = owned
          ? `<button class="btn sm ${on ? 'sel' : ''}" data-act="equip" data-arg="${e.id}">${on ? this.t('ui.equipped') : this.t('ui.equip')}</button>`
          : `<button class="btn sm primary" data-act="buyEq" data-arg="${e.id}" ${d.credits < e.cost ? 'disabled' : ''}>${e.cost} ${this.t('ui.credits')}</button>`;
        return `<div class="item ${on ? 'on' : ''}"><div class="grow"><b>${this.t('equipment.' + e.id + '.name')}</b>${rec ? ' <em>★</em>' : ''}<small>${this.t('equipment.' + e.id + '.desc')}</small></div>${btn}</div>`;
      }).join('');
      return `<div class="slot"><h4>${slotName[slot]}</h4>${items}</div>`;
    }).join('');
    const kmh = Math.round(stats.maxSpeed * 3.6);
    const cars = CAR_IDS.map((id) => {
      const c = CARS[id];
      const owned = d.carsOwned.includes(id);
      const on = d.car === id;
      const m = c.mult;
      const pct = (v: number) => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
      const btn = owned
        ? `<button class="btn sm ${on ? 'sel' : ''}" data-act="selCar" data-arg="${id}">${on ? this.t('ui.selected') : this.t('ui.select')}</button>`
        : `<button class="btn sm primary" data-act="buyCar" data-arg="${id}" ${d.credits < c.cost ? 'disabled' : ''}>${c.cost.toLocaleString()} ${this.t('ui.credits')}</button>`;
      return `<div class="card car ${on ? 'sel' : ''}"><b>${this.t('cars.' + id + '.name')}</b><small>${this.t('cars.' + id + '.desc')}</small>
        <span class="lv">TOP ${pct(m.maxSpeed)} · ACC ${pct(m.accel)} · GRIP ${pct(m.grip)}</span>${btn}</div>`;
    }).join('');
    const swatches = PAINTS.map((p, i) => `<button class="swatch ${d.paint === i ? 'on' : ''}" data-act="paint" data-arg="${i}" style="background:#${p[0].toString(16).padStart(6, '0')};box-shadow:inset 0 -6px 0 #${p[1].toString(16).padStart(6, '0')}" aria-label="paint ${i + 1}"></button>`).join('');
    return `<div class="panel wide garage">${this.header(this.t('ui.garage'))}
      <h3>${this.t('ui.vehicle')}</h3><div class="cards cars">${cars}</div>
      <div class="paints"><span>${this.t('ui.paint')}</span>${swatches}</div>
      <div class="statbar"><span>${kmh} ${this.t('ui.kmh')}</span><span>ACC ${stats.accel.toFixed(0)}</span><span>GRIP ${stats.grip.toFixed(1)}</span><span>NOS ×${(stats.nitroRate * mods.nitroDurationMul).toFixed(2)}</span></div>
      <div class="cols"><div><h3>${this.t('ui.vehicleUpgrades')}</h3>${rows}</div><div><h3>${this.t('ui.modular')}</h3>${eq}</div></div>
    </div>`;
  }

  // ---- locations ----
  private locations(): string {
    const d = this.host.save.data;
    const cards = BIOME_ORDER.map((id) => {
      const p = BIOME_PRESETS[id];
      const lv = d.locations[id];
      const unlocked = isBiomeUnlocked(d, id);
      const max = lv >= MAX_LOCATION_LEVEL;
      const c = locationCost(lv);
      const afford = d.credits >= c.credits && d.techParts >= c.techParts;
      const next = max ? '' : `<small>${this.t('ui.upgrade')} → Lv.${lv + 1}: <b>${this.t('tiers.' + (lv + 1) + '.name')}</b> — ${this.t('tiers.' + (lv + 1) + '.desc')}</small>`;
      const gate = p.unlockedBy ? this.t('biomes.' + p.unlockedBy + '.name') : '';
      return `<div class="card loc ${id} ${unlocked ? '' : 'lock'}">
        <div class="row"><b class="grow">${this.t('biomes.' + id + '.name')}</b><span class="lv">${this.t('ui.locationLevel')} ${lv}</span></div>
        ${this.pips(lv, MAX_LOCATION_LEVEL)}
        <small><b>${this.t('tiers.' + lv + '.name')}</b> · ${this.t('ui.payoutBonus')} ×${payoutMultiplier(lv).toFixed(2)}</small>
        ${unlocked ? next : `<small>🔒 ${this.t('ui.unlockHint', { biome: gate })}</small>`}
        ${unlocked && !max ? `<button class="btn primary sm" data-act="upLoc" data-arg="${id}" ${afford ? '' : 'disabled'}>${this.t('ui.upgrade')} · ${c.credits.toLocaleString()} ${this.t('ui.credits')}${c.techParts ? ` + ${c.techParts} ${this.t('ui.techParts')}` : ''}</button>` : max ? `<span class="chip">${this.t('ui.maxed')}</span>` : ''}
      </div>`;
    }).join('');
    return `<div class="panel wide">${this.header(this.t('ui.locations'))}<div class="cards loc-cards">${cards}</div></div>`;
  }

  // ---- results ----
  private resultsView(): string {
    const r = this.results;
    if (!r) return '';
    const p = r.payout;
    const lines = p.lines.map((l) => `<div class="line"><span>${this.t('results.' + l.key)}</span><b>+${l.value}</b></div>`).join('');
    const won = r.position === 1;
    return `<div class="panel results">
      <h2 class="${won ? 'win' : ''}">${won ? this.t('results.win') : this.t('results.lose')}</h2>
      <div class="big-pos">${r.mode === 'time_attack' ? '' : this.t('results.ordinal' + Math.min(4, r.position))}</div>
      <div class="line"><span>${this.t('results.time')}</span><b>${fmtTime(r.time)}${r.newBest ? ` <em>${this.t('ui.newBest')}</em>` : ''}</b></div>
      <div class="line"><span>${this.t('results.bestLap')}</span><b>${fmtTime(r.bestLap)}</b></div>
      <hr>${lines}
      <div class="line"><span>${this.t('results.multiplier')}</span><b>×${p.multiplier.toFixed(2)}</b></div>
      ${p.firstBoss ? `<div class="bonus">${this.t('results.bossFirst')}</div>` : ''}
      <div class="line total"><span>${this.t('results.total')}</span><b>+${p.credits.toLocaleString()} ${this.t('ui.credits')}${p.techParts ? ` · +${p.techParts} ${this.t('ui.techParts')}` : ''}</b></div>
      <div class="menu-buttons row">
        <button class="btn primary" data-act="retry">${this.t('ui.retry')}</button>
        <button class="btn" data-act="nav" data-arg="garage">${this.t('ui.garage')}</button>
        <button class="btn" data-act="nav" data-arg="locations">${this.t('ui.locations')}</button>
        <button class="btn" data-act="quit">${this.t('ui.menu')}</button>
      </div>
    </div>`;
  }

  private pause(): string {
    return `<div class="panel pause"><h2>${this.t('ui.paused')}</h2>
      <div class="menu-buttons">
        <button class="btn primary" data-act="resume">${this.t('ui.resume')}</button>
        <button class="btn" data-act="retry">${this.t('ui.retry')}</button>
        <button class="btn" data-act="sound">${this.t('ui.sound')}: ${this.host.save.data.muted ? this.t('ui.off') : this.t('ui.on')}</button>
        <button class="btn" data-act="quit">${this.t('ui.quit')}</button>
      </div></div>`;
  }
}
