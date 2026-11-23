import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Music } from './audio/Music';
import { Synth } from './audio/Synth';
import { CameraRig } from './camera/CameraRig';
import { BIOME_PRESETS, type BiomeId } from './data/biomes';
import { CARS, PAINTS, type CarId } from './data/cars';
import { checkAchievements } from './data/achievements';
import { champById, champProgress, claimDaily, recordChampRound, type DailyChallenge } from './data/challenges';
import { applyPayout, awardMedal, carSetup, perkFor, computePayout, DIFFICULTY, isBiomeUnlocked, pinkSlipPrize, recordStats, todaysChallenge, type RaceMode } from './data/progression';
import { SaveState } from './data/saveState';
import { I18n } from './i18n/i18n';
import { Input } from './input/Input';
import { AIDriver } from './race/AIDriver';
import { DRIFT_TRIAL_TIME, RaceManager } from './race/RaceManager';
import { Traffic } from './race/Traffic';
import { Hud } from './ui/Hud';
import { Menus, type MenuHost, type RaceExtra, type ResultsData, type Screen } from './ui/Menus';
import { CarController, type CarFx, type ControlState } from './vehicle/CarController';
import { buildCar, type CarModel } from './vehicle/CarMeshBuilder';
import { loadBiomeScene, type BiomeWorld, type Quality, type WorldOptions } from './world/BiomeLoader';

const DT = 1 / 120;
type State = 'menu' | 'race' | 'paused' | 'results' | 'replay';
type RaceCtx = { type: 'free' } | { type: 'champ'; id: string } | { type: 'daily'; ch: DailyChallenge };

export interface GameOptions {
  /** Drive the player car with the AI (smoke tests / demos). */
  autopilot?: boolean;
  autostart?: { biome: BiomeId; mode: RaceMode; extra?: RaceExtra };
  level?: number;
  quality?: Partial<Quality>;
}

export class Game implements MenuHost {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.5, 4200);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  readonly rig: CameraRig;
  readonly save = new SaveState();
  readonly i18n: I18n;
  readonly sfx = new Synth();
  readonly music = new Music(this.sfx);
  readonly input = new Input();
  readonly hud: Hud;
  readonly menus: Menus;
  quality: Quality;

  world: BiomeWorld | null = null;
  player!: CarController;
  playerModel!: CarModel;
  private modelKey = '';
  private holdRace = false;
  private raceCtx: RaceCtx = { type: 'free' };
  private slip: { car: CarId; stake: number } | null = null;
  private warnedWorks = -1;
  private worksRng = Math.random;
  private raceExtra: RaceExtra = {};
  private special = false;
  private headlight: THREE.SpotLight | null = null;
  private wreckCount = 0;
  private slowT = 0;
  private timeScale = 1;
  private qualityKey: 'auto' | 'high' | 'low' = 'auto';
  private baseQuality: Quality;
  private replayT = 0;
  private replayCam = 0;
  private replayCamT = 0;
  private replayEl: HTMLElement | null = null;
  private replayPoses = new Map<number, { x: number; y: number; z: number; h: number }>();
  private tutorialEl: HTMLElement | null = null;
  race: RaceManager | null = null;
  state: State = 'menu';
  private acc = 0;
  private time = 0;
  private lastT = 0;
  private autopilot: AIDriver | null = null;
  private coinsCollected = 0;
  private jumpBonus = 0;
  private smashCount = 0;
  private warnedJunction = -1;
  private lastMode: RaceMode = 'time_attack';
  private lastBiome: BiomeId = 'neon_street';
  private resultsShown = false;
  private showroomClose = false;
  private menuShift = 0;
  private prevNitro = 0;
  private wrongWayT = 0;
  private frameEma = 1 / 60;
  private adaptT = 0;
  private adaptive = !navigator.webdriver;
  private readonly maxPixelRatio: number;
  private wrongWayCool = 0;
  private prevLap = -1;
  private levelOverride: number | null = null;
  private fx: CarFx;
  private aiFx: CarFx;
  private ctlCache: ControlState = { throttle: 0, steer: 0, handbrake: false, nitro: false };

  constructor(private canvas: HTMLCanvasElement, ui: HTMLElement, opts: GameOptions = {}) {
    const coarse = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
    this.quality = { shadows: !coarse, bloom: !coarse, pixelRatio: Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2), ...opts.quality };
    this.maxPixelRatio = this.quality.pixelRatio;
    this.baseQuality = { ...this.quality };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.rig = new CameraRig(this.camera);
    this.input.touch = coarse;
    this.i18n = new I18n(this.save.data.lang);
    this.sfx.muted = this.save.data.muted;
    this.hud = new Hud(ui, this.i18n, () => this.togglePause());
    this.menus = new Menus(ui, this);
    this.i18n.onChange(() => { this.hud.relabel(); document.documentElement.lang = this.i18n.lang; });
    document.documentElement.lang = this.i18n.lang;

    this.buildPlayerModel();
    this.levelOverride = opts.level ?? null;
    if (opts.autopilot) { this.autopilot = new AIDriver(0.97, 0); this.autopilot.avoid = 'swerve'; }

    this.fx = {
      skid: (x, z, h) => this.world?.skids.add(x, z, h),
      spark: (x, z, vx, vz, n) => {
        const p = this.world; if (!p) return;
        const tierCols = [p.preset.fxColor, 0x4aa8ff, 0xff9a2a, 0xc45cff];
        const c = tierCols[this.player.driftTier] ?? p.preset.fxColor;
        const dust = p.preset.surface !== 'asphalt' || this.player.offroad;
        if (!dust && Math.random() < 0.5) p.particles.emit(x + (Math.random() - 0.5) * 0.8, 0.25, z + (Math.random() - 0.5) * 0.8, -vx * 0.05, 1.1 + Math.random() * 0.8, -vz * 0.05, 0xc9ccd8, 2.7, 0.95, -0.5);
        for (let i = 0; i < n; i++) {
          p.particles.emit(x + (Math.random() - 0.5), 0.2, z + (Math.random() - 0.5), -vx * 0.15 + (Math.random() - 0.5) * 3, dust ? 1.2 + Math.random() * 1.5 : 1 + Math.random() * 2.5, -vz * 0.15 + (Math.random() - 0.5) * 3, dust ? (p.preset.surface === 'snow' ? 0xffffff : 0xcaa27a) : c, dust ? 1.5 : 1.1, dust ? 0.6 : 0.45, dust ? -0.5 : 7);
        }
      },
      smoke: (x, y, z) => { this.world?.particles.emit(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, 2.2, (Math.random() - 0.5) * 0.8, 0x4a4d57, 2.6, 1.2, -0.6); },
      flame: (x, y, z, vx, vz) => {
        const p = this.world; if (!p) return;
        p.particles.emit(x, y, z, vx + (Math.random() - 0.5), 0.4, vz + (Math.random() - 0.5), Math.random() < 0.5 ? 0xff8a1f : 0x5fd2ff, 1.5, 0.25);
      },
    };
    this.aiFx = { skid: this.fx.skid, spark: () => {}, flame: () => {} };

    this.loadWorld(this.save.data.selectedBiome);
    this.applySettings();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.sfx.setMuted(this.save.data.muted);
    addEventListener('blur', () => { if (this.state === 'race') this.togglePause(); });
    const unlock = () => { this.sfx.resume(); this.music.start(); this.updateMusic(); };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);

    if (opts.autostart && isBiomeUnlockedForStart(this.save, opts.autostart.biome, opts.level)) {
      this.startRace(opts.autostart.biome, opts.autostart.mode, opts.autostart.extra);
    } else {
      this.menus.show('main');
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- world / car ----------
  private levelFor(biome: BiomeId): number {
    return this.levelOverride ?? this.save.data.locations[biome];
  }

  /** (Re)build the scene for a biome at its current Location level. */
  loadWorld(biome: BiomeId, opts: WorldOptions = { perk: perkFor(this.save.data, biome) }): void {
    this.world?.dispose();
    this.setHeadlights(opts.weather === 'night');
    this.world = loadBiomeScene(this.scene, biome, this.levelFor(biome), this.quality, opts);
    this.rebuildPostFx();
    const { stats, mods } = carSetup(this.save.data);
    this.player = new CarController(this.world.track, stats, mods, this.playerModel, {});
    this.player.features = this.world.features;
    this.playerModel.applyLoadout(this.save.data.loadout);
    const gs = this.world.gridSlot(0);
    this.player.placeOnTrack(gs.s, gs.lat);
    this.player.locked = true;
    this.hud.setTrack(this.world.track);
    {
      // street canyons: keep the chase camera between the facades
      const tr = this.world.track;
      let hint = -1;
      const q = { idx: 0, s: 0, lat: 0, tx: 0, tz: 1 };
      this.rig.blocked = tr.city ? (x, z) => {
        if (tr.alleys.length) { const al = tr.alleyAt(x, z, 0); if (al) return Math.abs(al.v) > al.alley.hh - 1.2; }
        tr.query(x, z, hint, q); hint = q.idx; return Math.abs(q.lat) > tr.halfWidth + tr.shoulder - 1.2;
      } : null;
    }
    this.wirePlayerEvents();
    this.rig.snap();
    this.world.particles.setViewScale(this.canvas.clientHeight || 720);
  }

  /** Road works pop up somewhere new on a straight at the start of every lap. */
  private moveRoadWorks(): void {
    const w = this.world;
    if (!w || !w.track.city) { return; }
    const straights = w.track.pickStraights(10, 120, [0, w.track.length]).filter((s) => s > 120 && s < w.track.length - 140 && !w.track.crossings.some((c) => Math.abs(c - s) < 20));
    if (!straights.length) return;
    const s = straights[Math.floor(this.worksRng() * straights.length)];
    w.props.placeEvent(s, (this.worksRng() - 0.65) * w.track.halfWidth * 0.9);
    this.warnedWorks = -1;
  }

  private setHeadlights(on: boolean): void {
    if (this.headlight) { this.headlight.removeFromParent(); this.headlight.target.removeFromParent(); this.headlight.dispose(); this.headlight = null; }
    if (!on) return;
    const l = new THREE.SpotLight(0xfff2cc, 70, 80, 0.55, 0.5, 1.2);
    l.position.set(0, 1.0, 1.8);
    l.target.position.set(0, 0, 20);
    this.playerModel.root.add(l, l.target);
    this.headlight = l;
  }

  private wirePlayerEvents(): void {
    this.player.setEvents({
      onWall: (s) => { this.rig.shake(Math.min(0.9, s * 0.05)); this.sfx.wall(s); this.race?.hurtCargo(s * 0.008); },
      onLand: (dist) => {
        this.sfx.land(); this.rig.shake(0.25); this.race?.hurtCargo(0.03);
        if (dist >= 12) {
          const bonus = 20 + Math.round(dist);
          this.jumpBonus += bonus;
          this.hud.toast(this.i18n.t('ui.jump', { n: bonus }), 'gold');
        }
      },
      onPad: () => { this.sfx.pad(); this.rig.shake(0.2); this.hud.toast(this.i18n.t('ui.boost'), 'cyan', 900); },
      onDriftScore: (pts, mult) => { if (mult > 1) this.hud.toast(this.i18n.t('ui.chainUp', { m: mult.toFixed(1) }) + ` · +${pts}`, 'gold', 1100); },
      onDamage: (lvl) => { this.hud.toast(this.i18n.t(lvl >= 2 ? 'ui.critical' : 'ui.damaged'), lvl >= 2 ? 'gold' : '', 2200); this.rig.shake(0.3); },
      onMiniTurbo: (tier) => { this.sfx.pad(); this.rig.shake(0.12); this.hud.toast(this.i18n.t('ui.miniTurbo', { t: '▲'.repeat(tier) }), tier === 3 ? 'cyan' : '', 900); },
      onPerfectDrift: (pts) => { this.sfx.perfect(); this.hud.center(`${this.i18n.t('ui.perfectDrift')} +${pts}`, 1.3, 'perfect'); },
    });
  }

  private rebuildPostFx(): void {
    this.composer?.dispose();
    this.composer = null; this.bloom = null;
    if (!this.quality.bloom) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.quality.pixelRatio);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), this.world?.preset.bloom ?? 0.5, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(size.x, size.y);
  }

  private resize(): void {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.world?.particles.setViewScale(h);
  }

  // ---------- MenuHost ----------
  previewBiome(id: BiomeId): void {
    if (this.state !== 'menu') return;
    this.loadWorld(id);
  }

  // ---------- settings ----------
  applySettings(): void {
    const st = this.save.data.settings;
    this.rig.fovOffset = st.fov;
    this.rig.shakeScale = st.shake;
    this.input.sensitivity = st.steer;
    this.sfx.setVolume(st.volume);
    document.documentElement.style.setProperty('--touch-scale', String(st.touchScale));
    if (st.quality !== this.qualityKey) {
      this.qualityKey = st.quality;
      const b = this.baseQuality;
      if (st.quality === 'auto') { this.quality = { ...b }; this.adaptive = !navigator.webdriver; }
      else if (st.quality === 'high') { this.quality = { shadows: true, bloom: true, pixelRatio: this.maxPixelRatio }; this.adaptive = false; }
      else { this.quality = { shadows: false, bloom: false, pixelRatio: Math.min(0.8, this.maxPixelRatio) }; this.adaptive = false; }
      this.renderer.shadowMap.enabled = this.quality.shadows;
      if (this.world) this.world.sun.castShadow = this.quality.shadows;
      this.rebuildPostFx();
      this.applyPixelRatio();
    }
  }

  // ---------- replay ----------
  startReplay(): void {
    const r = this.race;
    if (!r || this.state !== 'results' || !r.replay.samples.length) return;
    this.state = 'replay';
    this.menus.show('none');
    this.replayT = 0; this.replayCam = 0; this.replayCamT = 0;
    this.player.locked = true;
    const el = document.createElement('div');
    el.id = 'replay';
    el.innerHTML = `<span class="tag">● ${this.i18n.t('ui.replay')}</span><div><button class="btn sm" data-r="skip">${this.i18n.t('ui.skip')}</button><button class="btn sm primary" data-r="exit">${this.i18n.t('ui.exitReplay')}</button></div>`;
    document.getElementById('ui')!.appendChild(el);
    el.addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).dataset.r;
      if (k === 'exit') this.exitReplay(true);
      else if (k === 'skip') { this.replayCam = (this.replayCam + 1) % 4; this.replayCamT = 0; }
    });
    this.replayEl = el;
    document.body.classList.remove('racing');
  }

  private exitReplay(showResults: boolean): void {
    this.replayEl?.remove(); this.replayEl = null;
    if (this.state === 'replay') this.state = 'results';
    if (showResults) this.menus.show('results');
  }

  private replayTick(dt: number): void {
    const r = this.race;
    if (!r) { this.exitReplay(true); return; }
    const rec = r.replay;
    if (this.input.consume('Escape') || this.input.consume('Enter')) { this.exitReplay(true); return; }
    // slow motion around crashes
    const slow = rec.crashes.some((c) => this.replayT > c - 0.6 && this.replayT < c + 1.4);
    this.replayT += dt * (slow ? 0.35 : 1);
    this.replayCamT += dt;
    if (slow) { this.replayCam = 0; this.replayCamT = 0; }
    else if (this.replayCamT > 5) { this.replayCam = (this.replayCam + 1) % 4; this.replayCamT = 0; }
    if (this.replayT >= rec.duration) { this.exitReplay(true); return; }
    rec.at(this.replayT, this.replayPoses);
    for (const c of r.everyone) {
      const pose = this.replayPoses.get(rec.idOf(c));
      if (!pose || !c.model) continue;
      c.model.root.position.set(pose.x, pose.y + 0.08, pose.z);
      c.model.root.rotation.y = pose.h;
      c.model.body.rotation.set(0, 0, c.extraRoll);
      c.model.root.visible = true;
    }
    const me = this.replayPoses.get(rec.idOf(this.player));
    if (!me) return;
    const fx = Math.sin(me.h), fz = Math.cos(me.h);
    const pos = new THREE.Vector3(me.x, me.y, me.z);
    const cam = this.camera;
    if (this.replayCam === 0) {
      this.rig.update(dt, { position: pos, heading: me.h, lateralSpeed: 0, forwardSpeed: 30, speed: 30, nitroActive: false, boostTimer: 0 });
    } else if (this.replayCam === 1) {
      cam.position.set(me.x + fx * 16 + fz * 9, 2.4, me.z + fz * 16 - fx * 9); cam.lookAt(pos.x, 0.9, pos.z);
      cam.fov += (50 - cam.fov) * 0.1; cam.updateProjectionMatrix();
    } else if (this.replayCam === 2) {
      this.rig.orbit(dt, pos, 22, 9);
    } else {
      cam.position.set(me.x + fx * 22, 1.3, me.z + fz * 22); cam.lookAt(pos.x, 1.0, pos.z);
      cam.fov += (62 - cam.fov) * 0.1; cam.updateProjectionMatrix();
    }
  }

  /** (Re)build the player's 3D car for the selected car and paint. */
  private buildPlayerModel(): void {
    const d = this.save.data;
    const [color, accent] = PAINTS[d.paint] ?? PAINTS[0];
    const old = this.playerModel;
    const pos = old?.root.position.clone();
    const rot = old?.root.rotation.y ?? 0;
    this.playerModel = buildCar({ color, accent, shape: CARS[d.car].shape });
    if (pos) { this.playerModel.root.position.copy(pos); this.playerModel.root.rotation.y = rot; }
    this.scene.add(this.playerModel.root);
    this.modelKey = `${d.car}:${d.paint}`;
    if (old) { old.root.removeFromParent(); old.dispose(); }
    if (this.player) this.player.model = this.playerModel;
    if (this.headlight) this.setHeadlights(true);
  }

  refreshCar(): void {
    const d = this.save.data;
    if (this.modelKey !== `${d.car}:${d.paint}`) this.buildPlayerModel();
    const { stats, mods } = carSetup(d);
    this.player.stats = stats; this.player.mods = mods;
    this.playerModel.applyLoadout(d.loadout);
  }

  setShowroom(close: boolean): void { this.showroomClose = close; }

  startRace(biome: BiomeId, mode: RaceMode, extra: RaceExtra = {}): void { this.launch(biome, mode, { type: 'free' }, extra); }

  startChampionship(id: string): void {
    const c = champById(id);
    const prog = champProgress(this.save.data, id);
    if (prog.done) return;
    this.launch(c.biomes[Math.min(prog.round, c.biomes.length - 1)], 'circuit', { type: 'champ', id });
  }

  startDaily(): void {
    const ch = todaysChallenge(this.save.data);
    this.launch(ch.biome, 'circuit', { type: 'daily', ch }, { weather: ch.mods.weather, reverse: ch.mods.reverse, routeSeed: ch.mods.routeSeed });
  }

  private launch(biome: BiomeId, mode: RaceMode, ctx: RaceCtx, extra: RaceExtra = {}): void {
    this.raceCtx = ctx;
    this.raceExtra = extra;
    this.special = !!extra.routeSeed || !!extra.reverse || (!!extra.weather && extra.weather !== 'default');
    this.lastBiome = biome; this.lastMode = mode;
    if (this.state === 'replay') this.exitReplay(false);
    this.race?.dispose();
    this.race = null;
    this.save.data.selectedBiome = biome;
    this.save.save();
    const wantOpts: WorldOptions = { perk: perkFor(this.save.data, biome), routeSeed: extra.routeSeed || null, weather: extra.weather ?? 'default', reverse: !!extra.reverse };
    const wo = this.world?.opts;
    const same = !!this.world && this.world.preset.id === biome && this.world.level === this.levelFor(biome) && (wo?.perk ?? null) === (wantOpts.perk ?? null) && (wo?.routeSeed ?? null) === (wantOpts.routeSeed ?? null) && (wo?.weather ?? 'default') === wantOpts.weather && !!wo?.reverse === !!wantOpts.reverse;
    if (!same) this.loadWorld(biome, wantOpts);
    const world = this.world!;
    this.refreshCar();
    this.player.damage = this.save.data.damage;
    const perk = perkFor(this.save.data, biome);
    if (perk === 'racing') this.player.stats = { ...this.player.stats, nitroRate: this.player.stats.nitroRate * 1.15 };
    if (perk === 'safety') this.player.stats = { ...this.player.stats, armor: this.player.stats.armor * 0.6 };
    const lv = world.level;
    const diff = DIFFICULTY[this.save.data.settings.difficulty];
    const dailyMods = ctx.type === 'daily' ? ctx.ch.mods : null;
    const adj = diff.skill + (dailyMods?.skillAdd ?? 0);
    const trio = [(0.78 + (lv - 1) * 0.014) * adj, (0.84 + (lv - 1) * 0.014) * adj, (0.9 + (lv - 1) * 0.014) * adj];
    const skills: Record<RaceMode, number[]> = {
      time_attack: [],
      duel: [(0.85 + (lv - 1) * 0.014) * adj],
      circuit: trio,
      elimination: trio,
      drift_trial: [], speed_run: [], delivery: [],
      pink_slip: [(0.95 + (lv - 1) * 0.014) * adj],
      boss: [1.1 * adj],
    };
    this.slip = null;
    if (mode === 'pink_slip') {
      const prize = pinkSlipPrize(this.save.data);
      if (!prize || this.save.data.credits < prize.stake) { this.menus.show('race'); return; }
      this.slip = prize;
      this.save.data.credits -= prize.stake;
      this.save.save();
    }
    const champ = ctx.type === 'champ' ? champById(ctx.id) : null;
    this.wreckCount = 0; this.slowT = 0; this.timeScale = 1;
    world.skids.clear();
    world.coins.reset();
    world.props.reset();
    this.coinsCollected = 0; this.jumpBonus = 0; this.smashCount = 0; this.warnedJunction = -1; this.resultsShown = false;
    this.prevLap = -1; this.prevNitro = 0.5; this.warnedWorks = -1;
    this.moveRoadWorks();
    this.race = new RaceManager(world, mode, this.player, {
      onCountdown: (n) => { this.hud.center(String(n), 0.9, 'count'); this.sfx.beep(false); },
      onGo: () => { this.hud.center(this.i18n.t('ui.go'), 0.8, 'go'); this.sfx.beep(true); },
      onLap: (lap, lapTime, best) => {
        this.sfx.lap();
        this.hud.toast(`${this.i18n.t('ui.lap')} ${lap}/${this.race?.laps ?? 3} · ${fmt(lapTime)}${best ? ' ★' : ''}`, best ? 'gold' : '');
      },
      onFinish: (rank, time) => this.onFinish(rank, time),
      onEliminated: (rv) => {
        this.sfx.wall(8);
        if (rv.isPlayer) this.hud.center(this.i18n.t('ui.youEliminated'), 1.6, 'crash');
        else this.hud.toast(this.i18n.t('ui.eliminated', { name: rv.name }), 'gold', 1800);
      },
      onTrainWarning: () => {
        const tr = world.train;
        if (!tr) return;
        const d = Math.hypot(tr.px - this.player.position.x, tr.pz - this.player.position.z);
        this.sfx.beep(false);
        if (d < 220) this.hud.toast(this.i18n.t('ui.trainComing'), 'gold', 2200);
      },
      onTrainHit: (car, speed) => {
        if (car !== this.player) return;
        this.rig.shake(1.0); this.sfx.wall(speed);
        this.race?.replay.markCrash(this.race.time);
        this.hud.center(this.i18n.t('ui.crash'), 1.1, 'crash');
        this.slowT = 0.7;
      },
      onFail: (reason) => {
        this.rig.shake(1.2); this.sfx.wall(30);
        this.hud.center(this.i18n.t(reason === 'bomb' ? 'ui.bombBlew' : 'ui.cargoLost'), 1.8, 'crash');
        const p = this.player.position;
        for (let i = 0; i < 60; i++) world.particles.emit(p.x, 1, p.z, (Math.random() - 0.5) * 22, 2 + Math.random() * 12, (Math.random() - 0.5) * 22, i % 2 ? 0xff7a1a : 0xffe08a, 1.6, 0.9, 12);
      },
      onCollide: (s, bumper) => { this.rig.shake(Math.min(0.5, s * 0.04)); this.sfx.wall(s * 0.6); if (bumper) this.hud.toast('💥', 'cyan', 600); },
      onCrash: (s) => {
        this.rig.shake(1.0);
        this.hud.center(this.i18n.t('ui.crash'), 1.1, 'crash');
        this.race?.replay.markCrash(this.race.time);
        if (s > 17) this.slowT = 0.75;
        const p = this.player.position;
        for (let i = 0; i < 26; i++) world.particles.emit(p.x, 0.8, p.z, (Math.random() - 0.5) * 14, 2 + Math.random() * 7, (Math.random() - 0.5) * 14, i % 3 ? 0xffb347 : 0xffffff, 1.2, 0.7, 14);
      },
      onWreck: (c) => { if (Math.hypot(c.position.x - this.player.position.x, c.position.z - this.player.position.z) < 40) this.wreckCount++; this.hud.toast(this.i18n.t('ui.wreck'), 'gold', 1000); for (let i = 0; i < 14; i++) world.particles.emit(c.position.x, 0.8, c.position.z, (Math.random() - 0.5) * 9, 2 + Math.random() * 5, (Math.random() - 0.5) * 9, 0xffb347, 1.1, 0.6, 14); },
      onNearMiss: () => { this.hud.toast(this.i18n.t('ui.nearMiss', { n: 10 }), 'cyan', 1100); this.sfx.coin(); },
      onSmash: (kind, x, z, byPlayer) => {
        if (byPlayer) { this.smashCount++; this.rig.shake(kind === 1 ? 0.22 : 0.12); this.sfx.wall(kind === 1 ? 4 : 2); }
        for (let i = 0; i < 6; i++) world.particles.emit(x, 0.4, z, (Math.random() - 0.5) * 6, 1 + Math.random() * 3, (Math.random() - 0.5) * 6, kind === 1 ? 0xff8a3a : kind === 3 ? 0x7fc8ff : 0xffffff, 0.9, 0.5, 12);
      },
    }, mode === 'time_attack' && !this.special ? (this.save.data.ghosts[biome] ?? null) : null, skills[mode], this.scene,
    world.preset.traffic.cars > 0 || world.intersections.length > 0 ? new Traffic(world, this.scene, world.intersections, { countMul: diff.traffic * (dailyMods?.trafficMul ?? 1) * (mode === 'speed_run' ? 0.4 : 1) * (perk === 'safety' ? 0.7 : 1), oncoming: mode === 'speed_run' ? 0 : dailyMods?.oncoming ?? null }) : null, world.props, champ ? [...champ.rivals] : null, this.slip ? CARS[this.slip.car].shape : null);
    this.race.ghost?.model.applyLoadout({});
    const rivals = this.race.racers.filter((x) => x.ai);
    if (rivals.length > 1 || mode === 'duel') this.hud.toast(`${this.i18n.t('ui.rivalsAre')}: ` + rivals.map((x) => `${x.name} (${this.i18n.t('ui.style_' + x.ai!.style)})`).join(' · '), '', 3800);
    this.state = 'race';
    this.updateMusic();
    this.menus.show('none');
    this.hud.setVisible(true);
    this.hud.clearToasts();
    this.rig.snap();
    document.body.classList.add('racing');
    if (!this.save.data.tutorialSeen && !navigator.webdriver) this.showTutorial();
    else if (!this.save.data.tipShown) { this.hud.toast(this.i18n.t('ui.hintFirst'), '', 4500); this.save.data.tipShown = true; this.save.save(); }
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'race';
    this.menus.show('none');
  }

  retry(): void { this.launch(this.lastBiome, this.lastMode, this.raceCtx, this.raceExtra); }

  quit(): void {
    if (this.race && this.state !== 'menu' && this.player) this.save.data.damage = this.player.damage;
    this.race?.dispose();
    this.race = null;
    this.state = 'menu';
    this.updateMusic();
    this.hud.setVisible(false);
    document.body.classList.remove('racing');
    this.loadWorld(this.save.data.selectedBiome);
    this.menus.show('main');
  }

  togglePause(): void {
    if (this.state === 'race') { this.state = 'paused'; this.menus.show('pause'); }
    else if (this.state === 'paused') this.resume();
  }

  private onFinish(rank: number, time: number): void {
    const r = this.race!;
    const p = r.player;
    const d = this.save.data;
    const biome = this.lastBiome, mode = this.lastMode;
    const stats = {
      biome, mode, position: mode === 'time_attack' ? 1 : rank, time,
      driftScore: this.player.driftScore, perfectDrifts: this.player.perfectDrifts,
      coins: this.coinsCollected, jumpBonus: this.jumpBonus,
      nearMisses: r.nearMisses, smashes: this.smashCount,
      difficulty: d.settings.difficulty, wrecks: this.wreckCount, jumps: this.player.jumps,
      noRecords: this.special, score: this.player.driftScore, integrity: r.cargo, failed: r.failed, stake: this.slip?.stake, prizeCar: this.slip?.car ?? null,
    };
    const prevBest = mode === 'drift_trial' ? d.bestScores[`${biome}:${mode}`] : d.bestTimes[`${biome}:${mode}`];
    d.damage = this.player.damage;
    const payout = computePayout(d, stats);
    applyPayout(d, stats, payout);
    recordStats(d, stats, payout.credits);
    const newBest = this.special ? false : mode === 'drift_trial' ? this.player.driftScore > (prevBest ?? 0) : (mode === 'time_attack' || (rank === 1 && !r.failed)) && (prevBest === undefined || time < prevBest);
    if (r.bestLapGhost && !this.special) {
      const old = d.ghosts[biome];
      if (!old || r.bestLapGhost.time < old.time) d.ghosts[biome] = r.bestLapGhost;
      if (!(biome in d.bestLaps) || r.bestLapGhost.time < d.bestLaps[biome]) d.bestLaps[biome] = r.bestLapGhost.time;
    }
    let champ: ResultsData['champ'];
    let daily: { credits: number; techParts: number; streak: number } | null | undefined;
    const ctx = this.raceCtx;
    if (ctx.type === 'champ') {
      const order = [...r.racers].sort((a, b) => a.rank - b.rank).map((x) => x.name);
      const rr = recordChampRound(d, ctx.id, order);
      champ = { ...rr, id: ctx.id, rounds: champById(ctx.id).biomes.length };
    } else if (ctx.type === 'daily') {
      daily = claimDaily(d, ctx.ch, rank);
    }
    const timeMedal = mode === 'time_attack' && !this.special ? awardMedal(d, biome, time) : undefined;
    const achievements = checkAchievements(d);
    this.save.save();
    this.sfx.finish(rank === 1);
    this.hud.center(rank === 1 ? this.i18n.t('results.win') : this.i18n.t('results.lose'), 2, rank === 1 ? 'go' : '');
    this.pendingResults = {
      biome, mode, position: rank, total: r.racers.length, time, bestLap: p.bestLap, payout, newBest,
      champ, daily, dailyAttempt: ctx.type === 'daily', achievements, replayAvailable: r.replay.samples.length > 30,
      timeMedal, failed: r.failed, score: mode === 'drift_trial' ? this.player.driftScore : undefined, medal: payout.medal, slip: this.slip ? { won: rank === 1, car: this.slip.car, stake: this.slip.stake } : undefined,
    };
  }
  private pendingResults: ResultsData | null = null;

  // ---------- loop ----------
  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000);
    this.lastT = now;
    this.tick(dt);
  }

  private renderOnly(dt: number): void {
    this.world!.update(dt, this.time, this.player.position, this.camera.position);
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }

  /** One rendered frame: input, fixed-step simulation, visuals. Exposed for tests. */
  tick(dt: number): void {
    this.time += dt;
    const world = this.world!;
    const inp = this.input;
    if (this.state === 'race' || this.state === 'paused') {
      if (inp.consume('Escape') || inp.consume('KeyP')) this.togglePause();
    } else if (this.state !== 'replay') { inp.consume('Escape'); inp.consume('KeyP'); }
    if (inp.consume('KeyM')) { this.save.data.muted = !this.save.data.muted; this.sfx.setMuted(this.save.data.muted); this.save.save(); }

    let ctl = inp.poll(dt);
    if (this.state === 'race' && this.race) {
      const race = this.race;
      if (this.autopilot) { this.autopilot.others = race.everyone; ctl = this.autopilot.update(this.player, dt); }
      if (inp.consume('KeyR') && race.phase === 'racing') this.player.respawn();
      if (this.holdRace) { if (inp.consume('Enter') || inp.consume('Space')) this.dismissTutorial(); this.acc = 0; this.rig.update(dt, this.player); return this.renderOnly(dt); }
      this.slowT = Math.max(0, this.slowT - dt);
      this.timeScale += ((this.slowT > 0 ? 0.35 : 1) - this.timeScale) * Math.min(1, dt * 10);
      this.ctlCache = ctl;
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= DT && steps < 40) {
        race.step(DT, this.ctlCache, this.fx, this.aiFx);
        this.acc -= DT; steps++;
      }
      if (steps >= 40) this.acc = 0;
      this.afterRaceStep(dt);
      this.rig.update(dt, this.player);
      this.applyMenuShift(false);
    } else if (this.state === 'replay') {
      this.replayTick(dt);
    } else if (this.state === 'menu' || this.state === 'results') {
      inp.consume('KeyR');
      const car = this.playerModel.root.position;
      this.rig.orbit(dt, car, this.showroomClose ? 8.6 : 10, this.showroomClose ? 2.6 : 3.6);
      this.applyMenuShift(true);
    } else {
      this.rig.update(0, this.player); // paused: hold camera
    }

    const focus = this.state === 'menu' ? this.playerModel.root.position : this.player.position;
    world.update(dt, this.time, focus, this.camera.position);
    if (this.state === 'race' || this.state === 'paused') this.audioTick();
    else this.sfx.engine(0, 0, false, 0, false);

    if (this.state === 'race' && this.race?.phase === 'finished' && this.pendingResults && !this.resultsShown && this.race.phase === 'finished') {
      // let the cars roll out for a moment, then show the results
      if (this.race.finishHold > 2.2) {
        this.resultsShown = true;
        this.state = 'results';
        this.updateMusic();
        this.hud.setVisible(false);
        document.body.classList.remove('racing');
        this.menus.show('results', this.pendingResults);
      }
    }

    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
    this.adaptQuality(dt);
  }

  private showTutorial(): void {
    this.holdRace = true;
    const t = (k: string) => this.i18n.t('tutorial.' + k);
    const el = document.createElement('div');
    el.id = 'tutorial';
    el.innerHTML = `<div class="panel"><h2>${t('title')}</h2>
      <p>🏎️ ${this.input.touch ? t('driveTouch') : t('drive')}</p><p>💨 ${t('drift')}</p><p>🔥 ${t('nitro')}</p><p>⚠️ ${t('hazards')}</p>
      <button class="btn primary big">${t('start')}</button></div>`;
    document.getElementById('ui')!.appendChild(el);
    this.tutorialEl = el;
    el.querySelector('button')!.addEventListener('click', () => this.dismissTutorial());
    this.hud.clearCenter();
  }

  private dismissTutorial(): void {
    if (!this.holdRace) return;
    this.holdRace = false;
    this.tutorialEl?.remove(); this.tutorialEl = null;
    this.save.data.tutorialSeen = true;
    this.save.save();
    this.sfx.resume(); this.music.start();
  }

  private updateMusic(): void {
    const racing = this.state === 'race' || this.state === 'paused';
    this.music.setTheme(racing || this.state === 'results' ? this.lastBiome : 'menu', racing ? 1 : 0.5);
  }

  /** Adaptive resolution: trade pixels (then bloom, then shadows) for a steady frame rate on weak devices. */
  private adaptQuality(dt: number): void {
    if (!this.adaptive || document.hidden || dt <= 0 || dt > 0.25) return;
    this.frameEma += (dt - this.frameEma) * 0.05;
    this.adaptT += dt;
    if (this.adaptT < 2.5) return;
    this.adaptT = 0;
    const q = this.quality;
    if (this.frameEma > 1 / 42) {
      if (q.pixelRatio > 0.75) q.pixelRatio = Math.max(0.75, q.pixelRatio * 0.82);
      else if (q.bloom) { q.bloom = false; this.rebuildPostFx(); }
      else if (q.shadows) { q.shadows = false; this.renderer.shadowMap.enabled = false; if (this.world) this.world.sun.castShadow = false; }
      else return;
      this.applyPixelRatio();
      this.frameEma = 1 / 50; // give the new setting a fair chance
    } else if (this.frameEma < 1 / 57 && q.pixelRatio < this.maxPixelRatio) {
      q.pixelRatio = Math.min(this.maxPixelRatio, q.pixelRatio * 1.12);
      this.applyPixelRatio();
    }
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.composer?.setPixelRatio(this.quality.pixelRatio);
    this.resize();
  }

  /** Slides the 3D view sideways so the car stays visible beside the menu panel. */
  private applyMenuShift(on: boolean): void {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    const target = on && w > 900 ? (this.showroomClose ? 0.27 : this.menus.screen === 'main' ? 0.17 : 0.1) : 0;
    this.menuShift += (target - this.menuShift) * 0.12;
    if (Math.abs(this.menuShift) < 0.002 && target === 0) { this.menuShift = 0; this.camera.clearViewOffset(); return; }
    this.camera.setViewOffset(w, h, -w * this.menuShift, 0, w, h);
  }

  private afterRaceStep(dt: number): void {
    const race = this.race!;
    const world = this.world!;
    const p = this.player;
    const active = race.phase !== 'countdown';
    const got = world.coins.update(dt, this.time, p.position.x, p.position.z, p.position.y, p.mods.magnetRadius, active && race.phase === 'racing');
    if (got) { this.coinsCollected += got; this.sfx.coin(); }
    if (p.lap !== this.prevLap) { if (p.lap > this.prevLap) { world.coins.reset(); if (p.lap > 0) this.moveRoadWorks(); } this.prevLap = p.lap; }
    if (world.props.eventS >= 0 && race.phase === 'racing') {
      const L = world.track.length;
      const ahead = (((world.props.eventS - p.tq.s) % L) + L) % L;
      if (ahead < 130 && ahead > 25 && this.warnedWorks !== world.props.eventS) { this.warnedWorks = world.props.eventS; this.hud.toast(this.i18n.t('ui.roadWorks'), 'gold', 1500); }
    }
    if (this.prevNitro < 0.999 && p.nitro >= 0.999 && race.phase === 'racing') this.hud.toast(this.i18n.t('ui.boostReady'), 'cyan', 1200);
    this.prevNitro = p.nitro;
    // red signal ahead: cross traffic is about to cross
    if (race.traffic && race.phase === 'racing') {
      const L = world.track.length;
      world.intersections.forEach((it, j) => {
        const ahead = (((it.s - p.tq.s) % L) + L) % L;
        if (ahead < 110 && ahead > 15 && race.traffic!.signalAt(j) === 'red' && this.warnedJunction !== j) {
          this.warnedJunction = j;
          this.hud.toast(this.i18n.t('ui.redLight'), 'gold', 1500);
        }
        if (ahead > 140 && this.warnedJunction === j) this.warnedJunction = -1;
      });
    }
    // wrong-way hint
    this.wrongWayCool = Math.max(0, this.wrongWayCool - dt);
    const along = p.vx * p.tq.tx + p.vz * p.tq.tz;
    this.wrongWayT = along < -4 && race.phase === 'racing' ? this.wrongWayT + dt : 0;
    if (this.wrongWayT > 1 && this.wrongWayCool <= 0) { this.wrongWayCool = 3; this.hud.toast(this.i18n.t('ui.wrongWay'), 'gold', 1600); }
    const me = race.player;
    const lapNo = Math.max(1, Math.min(race.laps, p.lap + 1));
    const t = (k: string, v?: Record<string, string | number>) => this.i18n.t(k, v);
    let extra: { label: string; frac: number; kind: string } | null = null;
    let extra2: string | null = null;
    if (race.mode === 'drift_trial') { const left = Math.max(0, DRIFT_TRIAL_TIME - race.time); extra = { label: `${t('ui.timeLeft')} ${Math.ceil(left)}s`, frac: left / DRIFT_TRIAL_TIME, kind: left < 15 ? 'warn' : '' }; extra2 = `${t('ui.scoreL')} ${Math.round(p.driftScore)}`; }
    else if (race.mode === 'speed_run') { const thr = race.bombSpeed(); extra = { label: t('ui.bombLabel', { v: Math.round(thr * 3.6) }), frac: race.bomb, kind: race.bomb < 0.35 ? 'warn' : 'good' }; }
    else if (race.mode === 'delivery') extra = { label: t('ui.cargoLabel', { p: Math.round(race.cargo * 100) }), frac: race.cargo, kind: race.cargo < 0.4 ? 'warn' : 'gold' };
    else if (race.mode === 'elimination') extra2 = t('ui.elimLeft', { n: race.racers.filter((x) => !x.eliminated).length });
    this.hud.update({
      speedKmh: p.speed * 3.6, nitro: p.nitro, nitroActive: p.nitroActive || p.boostTimer > 0,
      lap: lapNo, totalLaps: race.laps, extra, extra2, pos: me.rank || 1, total: race.racers.length,
      time: race.time,
      lapTime: 0,
      bestLap: Math.min(me.bestLap, this.lapBestFromSave(this.lastBiome)),
      driftPoints: p.driftPoints, driftActive: p.drifting,
      driftZone: world.track.driftZones.some(([a, b]) => p.tq.s / world.track.length >= a && p.tq.s / world.track.length <= b),
      coins: this.coinsCollected, offroad: p.offroad && race.phase === 'racing',
      chain: p.chain, mult: p.chainMultiplier, chainActive: p.chainT > 0, tier: p.driftTier, draft: p.draft, damage: p.damage,
    }, dt);
    this.hud.drawMinimap(dt, race.racers.map((r) => ({ x: r.car.position.x, z: r.car.position.z, player: r.isPlayer })));
  }

  private lapBestFromSave(biome: BiomeId): number {
    return this.save.data.bestLaps[biome] ?? Infinity;
  }

  private audioTick(): void {
    const p = this.player;
    const racing = this.state === 'race' && !!this.race && this.race.phase !== 'countdown';
    this.sfx.engine(p.speed, Math.max(0, this.ctlCache.throttle), p.nitroActive, Math.abs(p.lateralSpeed), racing || this.state === 'paused' ? this.state === 'race' : false);
  }
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`;
}

function isBiomeUnlockedForStart(save: SaveState, biome: BiomeId, levelOverride?: number): boolean {
  void BIOME_PRESETS;
  return levelOverride !== undefined || isBiomeUnlocked(save.data, biome);
}

export type { Screen };
