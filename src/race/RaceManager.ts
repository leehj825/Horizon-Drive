import * as THREE from 'three';
import type { BiomeWorld } from '../world/BiomeLoader';
import { AIDriver } from './AIDriver';
import { CarController, NEUTRAL, type CarFx } from '../vehicle/CarController';
import { buildCar, type CarShape } from '../vehicle/CarMeshBuilder';
import { BASE_STATS } from '../data/upgrades';
import { NO_MODS } from '../data/equipment';
import { GhostPlayer, GhostRecorder } from './Ghost';
import type { GhostData } from '../data/saveState';
import { resolveCars } from './collision';
import { ReplayRecorder } from './Replay';
import type { Traffic } from './Traffic';
import type { SmashProps } from '../world/SmashProps';

import type { RaceMode } from '../data/progression';
export type { RaceMode };
export const RACE_MODES: RaceMode[] = ['time_attack', 'duel', 'circuit', 'elimination', 'drift_trial', 'speed_run', 'delivery', 'pink_slip', 'boss'];
export const TOTAL_LAPS = 3;
/** Laps of a mode (the drift trial is limited by time instead). */
export function lapsFor(mode: RaceMode): number { return mode === 'drift_trial' ? 999 : mode === 'delivery' ? 2 : TOTAL_LAPS; }
export const DRIFT_TRIAL_TIME = 100;

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
  eliminated: boolean;
  elimIdx: number;
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
  onSmash?: (kind: number, x: number, z: number, byPlayer: boolean) => void;
  onEliminated?: (racer: Racer) => void;
  /** The run failed (bomb exploded, cargo destroyed). */
  onFail?: (reason: 'bomb' | 'cargo') => void;
}

/** Fixed attitudes of the named rivals. */
const PERSONALITY: Record<string, 'clean' | 'aggressive' | 'blocker'> = { Kira: 'aggressive', Dash: 'clean', Nyx: 'blocker', Rook: 'aggressive', Vex: 'clean', Juno: 'blocker' };

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
  readonly replay = new ReplayRecorder();
  /** Every car on the road: racers plus civilians. */
  everyone: CarController[] = [];
  readonly laps: number;
  /** Speed-run bomb charge and delivery cargo integrity (0..1). */
  bomb = 1;
  cargo = 1;
  failed = false;
  private elimCount = 0;
  private elimLaps = new Set<number>();

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
    rivalNames: string[] | null = null,
    rivalShape: CarShape | null = null,
  ) {
    const w = world;
    this.laps = lapsFor(mode);
    playerCar.features = w.features;
    const slot = mode === 'time_attack' ? 0 : Math.min(rivalSkills.length, 3);
    const gs = w.gridSlot(slot);
    playerCar.placeOnTrack(gs.s, gs.lat);
    playerCar.locked = true;
    this.player = this.makeRacer(playerCar, null, 'YOU', true);
    this.racers.push(this.player);

    const palette: [number, number][] = [[0xff3b6b, 0xffd24a], [0x3b82ff, 0xffffff], [0x7bff9a, 0x1b1f2a], [0xb45cff, 0xffe14a]];
    rivalSkills.forEach((skill, k) => {
      const shapes = ['coupe', 'hatch', 'muscle', 'hyper'] as const;
      const model = buildCar({ color: mode === 'boss' ? 0x101018 : palette[k % 4][0], accent: mode === 'boss' ? 0xff3b3b : palette[k % 4][1], shape: mode === 'boss' ? 'hyper' : rivalShape ?? shapes[(k + 1) % 4] });
      scene.add(model.root);
      const car = new CarController(w.track, { ...BASE_STATS }, NO_MODS, model);
      // AI ignores ramps (they sit on the left side of the road) but takes boost pads
      car.features = { ramps: [], pads: w.features.pads };
      const g = w.gridSlot(k);
      car.placeOnTrack(g.s, g.lat);
      car.locked = true;
      const hw = w.track.halfWidth;
      const lane = [-0.4, -0.6, -0.3, -0.5][k % 4] * hw;
      const ai = new AIDriver(skill, lane);
      ai.avoid = 'swerve';
      ai.target = playerCar;
      ai.style = mode === 'boss' ? 'aggressive' : PERSONALITY[rivalNames?.[k] ?? ''] ?? (['clean', 'aggressive', 'blocker'] as const)[k % 3];
      this.racers.push(this.makeRacer(car, ai, mode === 'boss' ? 'BOSS' : rivalNames?.[k] ?? RIVAL_NAMES[(k + Math.floor(w.preset.trackShape.seed)) % RIVAL_NAMES.length], false));
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
    return { car, ai, name, isPlayer, finished: false, finishTime: 0, rank: 0, lapStart: 0, lastLap: -1, bestLap: Infinity, eliminated: false, elimIdx: 0 };
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
      if (r.eliminated && !r.isPlayer) continue;
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
    this.modeRules(dt);
    this.updateDraft(dt);
    this.collide();
    this.props?.update(dt, this.everyone, (car, kind, x, z) => this.events.onSmash?.(kind, x, z, car === this.player.car));
    this.rank();
    this.replay.step(dt, this.time, this.everyone);

    if (this.mode === 'time_attack' && this.ghost) this.ghost.update(dt);
    if (this.player.car.lap >= 0 && this.phase === 'racing') this.recorder.step(dt, this.player.car);

    if (this.phase === 'finished') this.finishHold += dt;
  }

  private finishPlayer(rank: number, failed: boolean): void {
    if (this.phase === 'finished') return;
    this.failed = failed;
    this.player.finished = true;
    this.player.finishTime = this.time;
    this.player.rank = rank;
    this.phase = 'finished';
    this.events.onFinish(rank, this.time);
  }

  /** Current bomb-run speed limit (m/s). */
  bombSpeed(): number { return this.world.preset.bombSpeeds[Math.max(0, Math.min(2, this.player.car.lap))]; }

  /** Delivery: cargo takes damage from crashes. */
  hurtCargo(amount: number): void {
    if (this.mode !== 'delivery' || this.phase !== 'racing') return;
    this.cargo = Math.max(0, this.cargo - amount);
  }

  private eliminateLast(): void {
    const active = this.racers.filter((r) => !r.eliminated && !r.finished);
    if (active.length <= 2) return;
    const victim = [...active].sort((a, b) => a.car.progress - b.car.progress)[0];
    victim.eliminated = true;
    victim.elimIdx = ++this.elimCount;
    victim.car.locked = true;
    if (!victim.isPlayer && victim.car.model) victim.car.model.root.visible = false;
    this.events.onEliminated?.(victim);
    if (victim.isPlayer) this.finishPlayer(active.length, false);
  }

  /** Mode-specific win/lose rules (time limit, bomb, cargo). */
  private modeRules(dt: number): void {
    if (this.phase !== 'racing') return;
    const pc = this.player.car;
    if (this.mode === 'drift_trial' && this.time >= DRIFT_TRIAL_TIME) this.finishPlayer(1, false);
    else if (this.mode === 'speed_run' && this.time > 6) {
      const thr = this.bombSpeed();
      this.bomb = pc.speed >= thr ? Math.min(1, this.bomb + dt / 5) : Math.max(0, this.bomb - dt / 3.5);
      if (this.bomb <= 0) { this.events.onFail?.('bomb'); this.finishPlayer(4, true); }
    } else if (this.mode === 'delivery' && this.cargo <= 0) { this.events.onFail?.('cargo'); this.finishPlayer(4, true); }
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
    if (this.mode === 'elimination' && (lap === 1 || lap === 2) && !this.elimLaps.has(lap)) {
      this.elimLaps.add(lap);
      this.eliminateLast();
    }
    if (lap >= this.laps && !r.finished) {
      r.finished = true;
      r.finishTime = this.time;
      if (r.isPlayer) {
        this.rank();
        const finishedBefore = this.racers.filter((o) => o.finished && o !== r).length;
        this.finishPlayer(finishedBefore + 1, false);
      }
      return;
    }
    if (r.isPlayer) this.events.onLap(lap, lapTime, best);
  }

  /** Current order: finished racers by finish time, then the rest by progress. */
  rank(): void {
    const order = [...this.racers].sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.eliminated && b.eliminated) return b.elimIdx - a.elimIdx;
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
    for (const r of this.racers) if (!r.eliminated) a.push(r.car);
    if (this.traffic) for (const t of this.traffic.cars) a.push(t.car);
  }

  /** Slipstream: sit in the wake of a car ahead and you gain speed. */
  private updateDraft(dt: number): void {
    const cars = this.everyone;
    for (const r of this.racers) {
      const c = r.car;
      let best = 0;
      if (c.speed > 20 && !c.locked) {
        const sh = Math.sin(c.heading), ch = Math.cos(c.heading);
        for (const o of cars) {
          if (o === c) continue;
          const dx = o.position.x - c.position.x, dz = o.position.z - c.position.z;
          const f = dx * sh + dz * ch;
          if (f < 4 || f > 32) continue;
          if (Math.abs(dx * ch - dz * sh) > 2.3) continue;
          if (o.vx * sh + o.vz * ch < 8) continue; // must be moving the same way
          best = Math.max(best, 1 - (f - 4) / 28);
        }
      }
      c.draft += (best - c.draft) * Math.min(1, dt * (best > c.draft ? 1.6 : 3));
    }
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
        if (rv > 3) { this.events.onCollide(rv, pc.mods.bumper); this.hurtCargo(rv * 0.011); }
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
