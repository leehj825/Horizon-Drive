import * as THREE from 'three';
import type { BiomeWorld } from '../world/BiomeLoader';
import { AIDriver } from './AIDriver';
import { CarController, NEUTRAL, type CarFx } from '../vehicle/CarController';
import { buildCar } from '../vehicle/CarMeshBuilder';
import { BASE_STATS } from '../data/upgrades';
import { NO_MODS } from '../data/equipment';
import { GhostPlayer, GhostRecorder } from './Ghost';
import type { GhostData } from '../data/saveState';
import { resolveCars } from './collision';
import type { Traffic } from './Traffic';
import type { SmashProps } from '../world/SmashProps';

import type { RaceMode } from '../data/progression';
export type { RaceMode };
export const RACE_MODES: RaceMode[] = ['time_attack', 'duel', 'circuit', 'boss'];
export const TOTAL_LAPS = 3;

export interface Racer {
  car: CarController;
  ai: AIDriver | null;
  name: string;
  isPlayer: boolean;
  finished: boolean;
  finishTime: number;
  rank: number;
  lapStart: number;
  lastLap: number;
  bestLap: number;
}

export type Phase = 'countdown' | 'racing' | 'finished';

export interface RaceEvents {
  onCountdown: (n: number) => void;
  onGo: () => void;
  onLap: (lap: number, lapTime: number, isBest: boolean) => void;
  onFinish: (rank: number, time: number) => void;
  onCollide: (strength: number, byPlayerBumper: boolean) => void;
  /** The player hit a civilian car or a rival hard enough to crash. */
  onCrash?: (strength: number) => void;
  onWreck?: (car: CarController) => void;
  onNearMiss?: () => void;
  onSmash?: (kind: 0 | 1, x: number, z: number, byPlayer: boolean) => void;
}

const RIVAL_NAMES = ['Kira', 'Dash', 'Nyx', 'Rook', 'Vex', 'Juno', 'Blitz', 'Mako'];

/** Grid, countdown, laps, positions, car-vs-car collisions and ghost handling for one race. */
export class RaceManager {
  racers: Racer[] = [];
  player!: Racer;
  phase: Phase = 'countdown';
  time = 0;
  private countdown = 3.4;
  private lastCount = 4;
  ghost: GhostPlayer | null = null;
  private recorder = new GhostRecorder();
  /** Best lap of this race (for saving a ghost). */
  bestLapGhost: GhostData | null = null;
  finishHold = 0;
  private rubber = true;
  /** Close passes at speed by the player. */
  nearMisses = 0;
  /** Every car on the road: racers plus civilians. */
  everyone: CarController[] = [];

  constructor(
    readonly world: BiomeWorld,
    readonly mode: RaceMode,
    playerCar: CarController,
    private events: RaceEvents,
    savedGhost: GhostData | null,
    rivalSkills: number[],
    scene: THREE.Object3D,
    readonly traffic: Traffic | null = null,
    readonly props: SmashProps | null = null,
  ) {
    const w = world;
    playerCar.features = w.features;
    const slot = mode === 'time_attack' ? 0 : Math.min(rivalSkills.length, 3);
    const gs = w.gridSlot(slot);
    playerCar.placeOnTrack(gs.s, gs.lat);
    playerCar.locked = true;
    this.player = this.makeRacer(playerCar, null, 'YOU', true);
    this.racers.push(this.player);

    const palette: [number, number][] = [[0xff3b6b, 0xffd24a], [0x3b82ff, 0xffffff], [0x7bff9a, 0x1b1f2a], [0xb45cff, 0xffe14a]];
    rivalSkills.forEach((skill, k) => {
      const model = buildCar({ color: mode === 'boss' ? 0x101018 : palette[k % 4][0], accent: mode === 'boss' ? 0xff3b3b : palette[k % 4][1] });
      scene.add(model.root);
      const car = new CarController(w.track, { ...BASE_STATS }, NO_MODS, model);
      // AI ignores ramps (they sit on the left side of the road) but takes boost pads
      car.features = { ramps: [], pads: w.features.pads };
      const g = w.gridSlot(k);
      car.placeOnTrack(g.s, g.lat);
      car.locked = true;
      const hw = w.track.halfWidth;
      const lane = [-0.35, -0.55, -0.1, -0.45][k % 4] * hw;
      const ai = new AIDriver(skill, lane);
      ai.avoid = 'swerve';
      this.racers.push(this.makeRacer(car, ai, mode === 'boss' ? 'BOSS' : RIVAL_NAMES[(k + Math.floor(w.preset.trackShape.seed)) % RIVAL_NAMES.length], false));
      car.setEvents({});
    });
    this.rubber = mode !== 'boss';
    if (traffic) {
      traffic.events.onWreck = (t) => this.events.onWreck?.(t.car);
      traffic.events.onNearMiss = () => {
        this.nearMisses++;
        this.player.car.nitro = Math.min(1, this.player.car.nitro + 0.06);
        this.events.onNearMiss?.();
      };
    }

    if (mode === 'time_attack' && savedGhost) {
      this.ghost = new GhostPlayer(savedGhost, scene);
    }
    this.recorder.reset();
  }

  private makeRacer(car: CarController, ai: AIDriver | null, name: string, isPlayer: boolean): Racer {
    return { car, ai, name, isPlayer, finished: false, finishTime: 0, rank: 0, lapStart: 0, lastLap: -1, bestLap: Infinity };
  }

  /** Fixed-step update. `playerCtl` is the human input. */
  step(dt: number, playerCtl: typeof NEUTRAL, fx: CarFx | null, aiFx: CarFx | null): void {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - 0.4);
      if (n !== this.lastCount && n >= 1 && n <= 3) { this.lastCount = n; this.events.onCountdown(n); }
      if (this.countdown <= 0.4 && this.lastCount !== 0) {
        this.lastCount = 0;
        this.phase = 'racing';
        for (const r of this.racers) r.car.locked = false;
        this.events.onGo();
      }
      // let cars settle on the grid; the street is already alive
      for (const r of this.racers) r.car.update(dt, NEUTRAL, null);
      this.traffic?.update(dt, this.player.car, (x, y, z) => this.smoke(x, y, z));
      return;
    }

    this.time += dt;
    this.refreshEveryone();
    for (const r of this.racers) if (r.ai) r.ai.others = this.everyone;
    // rubber band relative to the player
    const pp = this.player.car.progress;
    for (const r of this.racers) {
      const c = r.car;
      const wasLap = c.lap;
      if (r.isPlayer) {
        c.update(dt, this.phase === 'finished' ? NEUTRAL : playerCtl, fx);
        if (this.phase === 'finished') { c.locked = true; }
      } else if (r.ai) {
        const gap = pp - c.progress; // + player ahead
        const scale = this.rubber ? 1 + Math.max(-0.045, Math.min(0.05, gap / 500)) : 1;
        c.update(dt, r.finished ? NEUTRAL : r.ai.update(c, dt, scale), aiFx);
        if (r.finished) { c.locked = true; }
      }
      if (c.lap > wasLap) this.lapCrossed(r, c.lap);
    }
    this.traffic?.update(dt, this.player.car, (x, y, z) => this.smoke(x, y, z));
    this.refreshEveryone();
    this.collide();
    this.props?.update(dt, this.everyone, (car, kind, x, z) => this.events.onSmash?.(kind, x, z, car === this.player.car));
    this.rank();

    if (this.mode === 'time_attack' && this.ghost) this.ghost.update(dt);
    if (this.player.car.lap >= 0 && this.phase === 'racing') this.recorder.step(dt, this.player.car);

    if (this.phase === 'finished') this.finishHold += dt;
  }

  private lapCrossed(r: Racer, lap: number): void {
    if (lap < 0) return;
    if (lap === 0) { r.lapStart = this.time; if (r.isPlayer) { this.recorder.reset(); this.ghost?.restart(); } return; }
    const lapTime = this.time - r.lapStart;
    r.lapStart = this.time;
    r.lastLap = lapTime;
    const best = lapTime < r.bestLap;
    if (best) r.bestLap = lapTime;
    if (r.isPlayer) {
      if (best) this.bestLapGhost = this.recorder.finishLap();
      this.recorder.reset();
      this.ghost?.restart();
    }
    if (lap >= TOTAL_LAPS && !r.finished) {
      r.finished = true;
      r.finishTime = this.time;
      if (r.isPlayer) {
        this.rank();
        const finishedBefore = this.racers.filter((o) => o.finished && o !== r).length;
        this.player.rank = finishedBefore + 1;
        this.phase = 'finished';
        this.events.onFinish(this.player.rank, this.time);
      }
      return;
    }
    if (r.isPlayer) this.events.onLap(lap, lapTime, best);
  }

  /** Current order: finished racers by finish time, then the rest by progress. */
  rank(): void {
    const order = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.car.progress - a.car.progress;
    });
    order.forEach((r, i) => { r.rank = i + 1; });
  }

  private refreshEveryone(): void {
    const a = this.everyone;
    a.length = 0;
    for (const r of this.racers) a.push(r.car);
    if (this.traffic) for (const t of this.traffic.cars) a.push(t.car);
  }

  private smoke(x: number, y: number, z: number): void {
    this.world.particles.emit(x, y, z, (Math.random() - 0.5) * 1.2, 2.4 + Math.random(), (Math.random() - 0.5) * 1.2, 0x5d606b, 3.4, 1.7, -0.7);
  }

  private collide(): void {
    const cars = this.everyone;
    const pc = this.player.car;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const rv = resolveCars(a, b);
      if (rv <= 0) continue;
      if (this.traffic) { this.traffic.registerHit(a, rv); this.traffic.registerHit(b, rv); }
      if (a === pc || b === pc) {
        if (rv > 3) this.events.onCollide(rv, pc.mods.bumper);
        if (rv > 13) this.events.onCrash?.(rv);
      }
    }
  }

  /** Remove AI cars / ghost from the scene. */
  dispose(): void {
    for (const r of this.racers) {
      if (!r.isPlayer) { r.car.model?.root.removeFromParent(); r.car.model?.dispose(); }
    }
    this.ghost?.dispose();
    this.traffic?.dispose();
  }
}
