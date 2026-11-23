import * as THREE from 'three';
import type { Track, TrackQuery } from '../world/track';
import type { CarMods } from '../data/equipment';
import { BASE_STATS, type VehicleStats } from '../data/upgrades';
import { NO_MODS } from '../data/equipment';
import type { CarModel } from './CarMeshBuilder';

export interface ControlState {
  /** -1 brake/reverse .. 1 full throttle */
  throttle: number;
  /** -1 left .. 1 right */
  steer: number;
  handbrake: boolean;
  nitro: boolean;
}

export const NEUTRAL: ControlState = { throttle: 0, steer: 0, handbrake: false, nitro: false };

export interface Rect { x: number; z: number; dx: number; dz: number; w: number; l: number }
export interface Ramp extends Rect { h: number }
export interface TrackFeatures { ramps: Ramp[]; pads: Rect[] }
export const NO_FEATURES: TrackFeatures = { ramps: [], pads: [] };

export interface CarEvents {
  onWall?: (strength: number) => void;
  onLand?: (distance: number) => void;
  onPad?: () => void;
  onPerfectDrift?: (score: number) => void;
  onDriftScore?: (points: number, multiplier: number) => void;
  onMiniTurbo?: (tier: number) => void;
  /** Damage crossed a warning threshold (0.5 or 0.8). */
  onDamage?: (level: number) => void;
}

export interface CarFx {
  skid: (x: number, z: number, heading: number) => void;
  spark: (x: number, z: number, vx: number, vz: number, n: number) => void;
  flame: (x: number, y: number, z: number, vx: number, vz: number) => void;
  smoke?: (x: number, y: number, z: number) => void;
}

const NITRO_BOOST = 1.5;
const NITRO_SPEED = 1.38;
const REVERSE_MAX = 12;
const GRAVITY = 24;
const WALL_BOUNCE = 0.25;

/**
 * Snappy arcade driving, ported from Smash Town: decoupled forward/lateral velocity with tunable grip,
 * handbrake drift, nitro, ramps. Racing additions: track-relative surface logic, walls, boost pads,
 * drift scoring that feeds nitro.
 */
export class CarController {
  position = new THREE.Vector3();
  heading = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  forwardSpeed = 0;
  lateralSpeed = 0;
  nitro = 0.5;
  nitroActive = false;
  drifting = false;
  airborne = false;
  offroad = false;
  boostTimer = 0;
  /** Seconds in the current drift and the points it has earned. */
  driftTime = 0;
  driftPoints = 0;
  /** Total drift score of this race. */
  driftScore = 0;
  perfectDrifts = 0;
  jumps = 0;
  /** Cumulative distance along the lap direction, unwrapped (negative on the grid). */
  progress = 0;
  tq: TrackQuery = { idx: 0, s: 0, lat: 0, tx: 0, tz: 1 };
  /** Locked controls (countdown / finished). */
  locked = false;
  wallHits = 0;
  features: TrackFeatures = NO_FEATURES;
  /** Drift chain: consecutive drifts raise the score multiplier (x1 .. x5). */
  chain = 0;
  /** Seconds left to continue the chain with another drift. */
  chainT = 0;
  /** Mini-turbo tier the current drift has reached (0..3). */
  driftTier = 0;
  /** Slipstream strength 0..1 (set by the race manager). */
  draft = 0;
  /** Accumulated damage 0..1: slows the car, pulls it to one side and smokes. */
  damage = 0;
  private pullDir = Math.random() < 0.5 ? -1 : 1;
  private warned = 0;
  /** Weather grip multiplier (1 = dry). */
  roadGripMul = 1;
  /** Free-roaming body (cross traffic): ignores the track surface, walls and lap progress. */
  free = false;
  /** Seconds of reduced steering after a crash. */
  stunT = 0;
  /** Extra body roll (wrecks lean over). */
  extraRoll = 0;
  /** Blink the tail lights (wrecks). */
  hazard = false;
  private clock = 0;
  /** Collision radius used for car-vs-car. */
  readonly radius = 1.55;

  private prevS = 0;
  private hint = -1;
  private driftGrace = 0;
  private driftDirty = false;
  private padCooldown = 0;
  private wallContact = 0;
  private skidAccum = 0;
  private steerVis = 0;
  private wheelSpin = 0;
  private roll = 0;
  private pitch = 0;
  private prevFwd = 0;
  private airStartX = 0;
  private airStartZ = 0;
  private lastRampVy = 0;

  constructor(
    readonly track: Track,
    public stats: VehicleStats = BASE_STATS,
    public mods: CarMods = NO_MODS,
    public model: CarModel | null = null,
    private events: CarEvents = {},
  ) {}

  get speed(): number { return Math.hypot(this.vx, this.vz); }
  get lap(): number { return Math.floor(this.progress / this.track.length); }
  /** Take damage (scaled by armour). */
  hurt(amount: number): void {
    if (this.free || amount <= 0) return;
    this.damage = Math.min(1, this.damage + amount * this.stats.armor);
    const lvl = this.damage >= 0.8 ? 2 : this.damage >= 0.5 ? 1 : 0;
    if (lvl > this.warned) { this.warned = lvl; this.events.onDamage?.(lvl); }
  }

  get chainMultiplier(): number { return this.chain > 0 ? Math.min(5, 1 + 0.5 * (this.chain - 1)) : 1; }

  setEvents(e: CarEvents): void { this.events = e; }

  /** Put the car on the track at lap distance `s`, lateral offset `lat`. */
  placeOnTrack(s: number, lat: number): void {
    const p = this.track.pointAt(s, lat);
    const i = this.track.indexAt(s);
    this.position.set(p.x, 0, p.z);
    this.heading = this.track.heading(i);
    this.vx = this.vz = this.vy = 0;
    this.airborne = false;
    this.hint = -1;
    this.track.query(p.x, p.z, -1, this.tq);
    this.hint = this.tq.idx;
    this.prevS = this.tq.s;
    this.progress = s > this.track.length / 2 ? s - this.track.length : s;
    this.nitro = 0.5;
    this.nitroActive = false;
    this.boostTimer = 0;
    this.driftTime = 0; this.driftPoints = 0; this.driftScore = 0; this.perfectDrifts = 0;
    this.jumps = 0; this.wallHits = 0; this.chain = 0; this.chainT = 0; this.draft = 0; this.warned = this.damage >= 0.8 ? 2 : this.damage >= 0.5 ? 1 : 0;
    this.syncModel(0);
  }

  /** Re-place at the current track position (reset after a spin-out). */
  respawn(): void {
    const s = this.tq.s;
    const i = this.track.indexAt(s);
    this.position.set(this.track.px[i], 0, this.track.pz[i]);
    this.heading = this.track.heading(i);
    this.vx = this.vz = this.vy = 0;
    this.airborne = false;
    this.position.y = 0;
    this.hint = i;
    this.driftTime = 0; this.driftPoints = 0;
  }

  update(dt: number, ctl: ControlState, fx: CarFx | null): void {
    const st = this.stats;
    const mods = this.mods;
    const locked = this.locked;
    const throttle = locked ? 0 : ctl.throttle;
    this.stunT = Math.max(0, this.stunT - dt);
    const steerIn = locked ? 0 : ctl.steer * (this.stunT > 0 ? 0.35 : 1);
    const hb = locked ? false : ctl.handbrake;
    const track = this.track;
    const preset = track.preset;

    // --- surface under the wheels ---
    if (!this.free) {
      const q0 = track.query(this.position.x, this.position.z, this.hint, this.tq);
      this.hint = q0.idx;
    }
    const q = this.tq;
    const inAlley = !this.free && track.alleys.length > 0 && !!track.alleyAt(this.position.x, this.position.z);
    this.offroad = !this.free && !inAlley && Math.abs(q.lat) > track.halfWidth + 0.4;
    let roadGrip = preset.friction;
    if (preset.surface === 'asphalt') roadGrip *= 1 + mods.asphaltGrip;
    else if (mods.ignoreSoft) roadGrip = Math.max(roadGrip, 0.97);
    const softGrip = mods.ignoreSoft ? 0.9 : 0.5;
    const gripMul = (this.offroad ? softGrip : roadGrip) * this.roadGripMul;
    const speedCap = this.offroad ? (mods.ignoreSoft ? 0.92 : 0.6) : 1;

    let fx_ = Math.sin(this.heading), fz_ = Math.cos(this.heading);
    let sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
    let vf = this.vx * fx_ + this.vz * fz_;
    let vl = this.vx * sx + this.vz * sz;

    // --- nitro ---
    const wantsNitro = !locked && ctl.nitro && throttle > 0 && this.nitro > 0.02 && !this.airborne;
    this.nitroActive = wantsNitro;
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.padCooldown = Math.max(0, this.padCooldown - dt);
    const boosting = this.boostTimer > 0;
    if (wantsNitro) this.nitro = Math.max(0, this.nitro - (dt * 0.34) / mods.nitroDurationMul);
    else this.nitro = Math.min(1, this.nitro + dt * 0.035 * st.nitroRate);
    let maxSpeed = st.maxSpeed * speedCap * (1 + 0.07 * this.draft) * (1 - 0.28 * this.damage);
    if (wantsNitro) maxSpeed *= NITRO_SPEED;
    if (boosting) maxSpeed = Math.max(maxSpeed, st.maxSpeed * 1.32);

    const grounded = !this.airborne;

    // --- steering ---
    const speedAbs = Math.abs(vf);
    const authority = (Math.min(1, speedAbs / 7) / (1 + speedAbs / 48)) * (0.65 + 0.35 * Math.min(1, gripMul));
    const dir = vf >= -0.5 ? 1 : -1;
    const steerRate = -steerIn * 2.5 * authority * dir * (hb ? 1.6 : 1) * (grounded ? 1 : 0.25);
    this.heading += steerRate * dt;
    if (this.damage > 0.15 && throttle > 0 && speedAbs > 10 && grounded) this.heading += this.pullDir * this.damage * 0.1 * dt * Math.min(1, speedAbs / 30);
    fx_ = Math.sin(this.heading); fz_ = Math.cos(this.heading);
    sx = Math.cos(this.heading); sz = -Math.sin(this.heading);
    vf = this.vx * fx_ + this.vz * fz_;
    vl = this.vx * sx + this.vz * sz;

    // --- longitudinal ---
    if (grounded) {
      if (throttle > 0) {
        const boostMul = (wantsNitro ? NITRO_BOOST : 1) * (boosting ? 1.6 : 1) * (1 + 0.35 * this.draft);
        if (vf < maxSpeed) vf += st.accel * boostMul * (1 - Math.max(0, vf) / (maxSpeed + 8)) * dt * (0.55 + 0.45 * Math.min(1, gripMul + 0.2));
        else vf -= (vf - maxSpeed) * Math.min(1, dt * 2);
      } else if (throttle < 0) {
        if (vf > 0.5) vf = Math.max(0, vf - 46 * dt * Math.min(1, gripMul + 0.15));
        else vf = Math.max(-REVERSE_MAX, vf - st.accel * 0.6 * dt);
      } else {
        vf *= Math.exp(-0.45 * dt);
      }
      if (hb) vf *= Math.exp(-0.9 * dt);
      if (this.offroad && vf > maxSpeed) vf -= (vf - maxSpeed) * Math.min(1, dt * 3);

      const hardTurn = Math.abs(steerIn) > 0.5 && speedAbs > st.maxSpeed * 0.63;
      const grip = (hb ? 1.1 : hardTurn ? st.grip * 0.47 : st.grip) * gripMul;
      vl *= Math.exp(-grip * dt);
    }

    this.vx = fx_ * vf + sx * vl;
    this.vz = fz_ * vf + sz * vl;

    this.position.x += this.vx * dt;
    this.position.z += this.vz * dt;

    if (!this.free) this.collideWalls(dt);
    this.vertical(dt);
    if (!this.free) this.padCheck();

    fx_ = Math.sin(this.heading); fz_ = Math.cos(this.heading);
    sx = Math.cos(this.heading); sz = -Math.sin(this.heading);
    this.forwardSpeed = this.vx * fx_ + this.vz * fz_;
    this.lateralSpeed = this.vx * sx + this.vz * sz;

    if (!this.free) {
      // --- lap progress (unwrapped) ---
      const q2 = track.query(this.position.x, this.position.z, this.hint, this.tq);
      this.hint = q2.idx;
      let ds = q2.s - this.prevS;
      if (ds < -track.length / 2) ds += track.length;
      else if (ds > track.length / 2) ds -= track.length;
      this.progress += ds;
      this.prevS = q2.s;
      this.updateDrift(dt, q2.s);
    }

    // --- FX ---
    if (fx) {
      if (this.drifting) {
        this.skidAccum += this.speed * dt;
        if (this.skidAccum > 0.7) {
          this.skidAccum = 0;
          for (const side of [-0.85, 0.85]) {
            fx.skid(this.position.x - fx_ * 1.35 + sx * side, this.position.z - fz_ * 1.35 + sz * side, Math.atan2(this.vx, this.vz));
          }
        }
        fx.spark(this.position.x - fx_ * 1.5, this.position.z - fz_ * 1.5, this.vx, this.vz, 1);
      } else if (this.wallContact > 0 && this.speed > 8) {
        fx.spark(this.position.x, this.position.z, this.vx, this.vz, 2);
      } else if (this.offroad && this.speed > 10) {
        fx.spark(this.position.x - fx_ * 1.5, this.position.z - fz_ * 1.5, this.vx, this.vz, 1);
      }
      if (this.damage > 0.45 && fx.smoke && Math.random() < this.damage * 0.5) fx.smoke(this.position.x + fx_ * 1.3, 1.0, this.position.z + fz_ * 1.3);
      if (wantsNitro || boosting) fx.flame(this.position.x - fx_ * 2.3, this.position.y + 0.55, this.position.z - fz_ * 2.3, -fx_ * 6, -fz_ * 6);
    }
    this.syncModel(dt, ctl);
  }

  private updateDrift(dt: number, s: number): void {
    const wasDrifting = this.drifting;
    const slipping = !this.airborne && Math.abs(this.lateralSpeed) > 3.2 && this.speed > 8;
    if (slipping) {
      this.drifting = true;
      this.driftGrace = 0.28;
    } else if (this.drifting) {
      this.driftGrace -= dt;
      if (this.driftGrace <= 0) this.drifting = false;
    }
    const L = this.track.length;
    const f = s / L;
    const inZone = this.track.driftZones.some(([a, b]) => f >= a && f <= b);
    const zoneMul = inZone ? 2 : 1;
    if (this.drifting && slipping) {
      this.driftTime += dt;
      const pts = this.speed * Math.min(1.6, Math.abs(this.lateralSpeed) / 6) * dt * 0.9 * zoneMul;
      this.driftPoints += pts;
      this.nitro = Math.min(1, this.nitro + dt * 0.16 * this.stats.nitroRate * this.mods.driftNitroMul * zoneMul);
      if (this.offroad) this.driftDirty = true;
    }
    if (this.drifting) this.driftTier = this.driftTime >= 2.5 ? 3 : this.driftTime >= 1.5 ? 2 : this.driftTime >= 0.8 ? 1 : 0;
    if (!this.drifting) this.chainT = Math.max(0, this.chainT - dt);
    if (!this.drifting && this.chainT <= 0) this.chain = 0;
    if (wasDrifting && !this.drifting) {
      const clean = !this.driftDirty && this.driftTime >= 1.1;
      if (this.driftTime >= 0.5) {
        if (this.driftDirty) this.chain = 0;
        else { this.chain = this.chainT > 0 ? this.chain + 1 : 1; this.chainT = 1.7; }
        const mult = this.chainMultiplier;
        const pts = Math.round(this.driftPoints * (clean ? 1.5 : 1) * mult);
        this.driftScore += pts;
        this.events.onDriftScore?.(pts, mult);
        if (!this.driftDirty && this.driftTier > 0) {
          // mini turbo: longer drifts pay out a stronger burst
          this.boostTimer = Math.max(this.boostTimer, [0, 0.7, 1.2, 1.8][this.driftTier]);
          this.nitro = Math.min(1, this.nitro + 0.05 * this.driftTier);
          this.events.onMiniTurbo?.(this.driftTier);
        }
        if (clean) {
          this.perfectDrifts++;
          this.nitro = Math.min(1, this.nitro + 0.18);
          this.events.onPerfectDrift?.(pts);
        }
      }
      this.driftTime = 0; this.driftPoints = 0; this.driftDirty = false; this.driftTier = 0;
    }
  }

  /** Keeps the car between the walls; scraping them costs speed (less with chassis upgrades). */
  private collideWalls(dt: number): void {
    const track = this.track;
    const q = track.query(this.position.x, this.position.z, this.hint, this.tq);
    this.hint = q.idx;
    const wallLat = track.halfWidth + track.shoulder;
    const over = Math.abs(q.lat) - wallLat;
    this.wallContact = Math.max(0, this.wallContact - dt);
    if (over <= 0) return;
    if (track.alleys.length) {
      const al = track.alleyAt(this.position.x, this.position.z, 0.6);
      if (al) {
        // cut-through alley: no main wall, but the alley's own side walls
        const a = al.alley, ov = Math.abs(al.v) - a.hh;
        if (ov > 0) {
          const sg = al.v > 0 ? 1 : -1;
          this.position.x -= a.px * sg * ov; this.position.z -= a.pz * sg * ov;
          const vn = this.vx * a.px * sg + this.vz * a.pz * sg;
          if (vn > 0) {
            this.vx -= (1 + WALL_BOUNCE) * vn * a.px * sg; this.vz -= (1 + WALL_BOUNCE) * vn * a.pz * sg;
            if (vn > 3) {
              const pen = (1 - this.stats.wallKeep) * Math.min(1, vn / 14);
              this.hurt(vn * 0.0065);
              this.vx *= 1 - pen; this.vz *= 1 - pen;
              if (this.wallContact <= 0) { this.wallHits++; this.events.onWall?.(vn); }
              this.driftDirty = true;
            }
            this.wallContact = 0.25;
          }
          const drag = Math.exp(-1.3 * dt);
          this.vx *= drag; this.vz *= drag;
        }
        return;
      }
    }
    const sign = q.lat > 0 ? 1 : -1;
    const nx = track.nx(q.idx) * sign, nz = track.nz(q.idx) * sign; // points outward
    this.position.x -= nx * over;
    this.position.z -= nz * over;
    const vn = this.vx * nx + this.vz * nz; // outward speed
    if (vn > 0) {
      const impact = vn;
      this.vx -= (1 + WALL_BOUNCE) * vn * nx;
      this.vz -= (1 + WALL_BOUNCE) * vn * nz;
      if (impact > 3) {
        const pen = (1 - this.stats.wallKeep) * Math.min(1, impact / 14);
        this.hurt(impact * 0.0065);
        this.vx *= 1 - pen; this.vz *= 1 - pen;
        if (this.wallContact <= 0) {
          this.wallHits++;
          this.events.onWall?.(impact);
        }
        this.driftDirty = true;
      }
      this.wallContact = 0.25;
    }
    // scraping drag
    const drag = Math.exp(-1.3 * dt);
    this.vx *= drag; this.vz *= drag;
  }

  private padCheck(): void {
    if (this.airborne || this.padCooldown > 0) return;
    for (const p of this.features.pads) {
      const rx = this.position.x - p.x, rz = this.position.z - p.z;
      const along = rx * p.dx + rz * p.dz;
      const lat = -rx * p.dz + rz * p.dx;
      if (Math.abs(lat) < p.w / 2 && Math.abs(along) < p.l / 2) {
        this.boostTimer = 1.6;
        this.padCooldown = 1.0;
        const fx_ = Math.sin(this.heading), fz_ = Math.cos(this.heading);
        const vf = this.vx * fx_ + this.vz * fz_;
        const add = Math.max(0, this.stats.maxSpeed * 1.1 - vf) * 0.35 + 3;
        this.vx += fx_ * add; this.vz += fz_ * add;
        this.events.onPad?.();
        return;
      }
    }
  }

  /** Ramps: height field + ballistic flight. */
  private vertical(dt: number): void {
    let ground = 0;
    let slope = 0;
    for (const r of this.features.ramps) {
      const rx = this.position.x - r.x;
      const rz = this.position.z - r.z;
      const along = rx * r.dx + rz * r.dz;
      const lat = Math.abs(-rx * r.dz + rz * r.dx);
      if (lat < r.w / 2 && along > -r.l / 2 && along < r.l / 2) {
        const t = (along + r.l / 2) / r.l;
        ground = Math.max(ground, r.h * t);
        slope = r.h / r.l;
      }
    }
    const y = this.position.y;
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= 0) {
        const landSpeed = -this.vy;
        this.position.y = 0;
        this.vy = 0;
        this.airborne = false;
        const dist = Math.hypot(this.position.x - this.airStartX, this.position.z - this.airStartZ);
        this.jumps++;
        this.events.onLand?.(dist);
        if (landSpeed > 10) this.hurt((landSpeed - 10) * 0.004);
        const slow = Math.min(0.28, landSpeed * 0.02) * (1 - this.stats.landSoak);
        this.vx *= 1 - slow; this.vz *= 1 - slow;
      }
    } else if (ground > 0 || y > 0.001) {
      if (ground > 0) {
        this.lastRampVy = slope * (this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading));
        this.position.y = ground;
      } else if (y > 0.3 && this.lastRampVy > 1) {
        this.airborne = true;
        this.vy = this.lastRampVy;
        this.airStartX = this.position.x;
        this.airStartZ = this.position.z;
      } else {
        this.position.y = 0;
      }
    }
  }

  private syncModel(dt: number, ctl?: ControlState): void {
    const m = this.model;
    if (!m) return;
    m.root.position.set(this.position.x, this.position.y + 0.08, this.position.z);
    m.root.rotation.y = this.heading;

    const accel = dt > 0 ? (this.forwardSpeed - this.prevFwd) / dt : 0;
    this.prevFwd = this.forwardSpeed;
    const targetRoll = THREE.MathUtils.clamp(-this.lateralSpeed * 0.012, -0.12, 0.12);
    let targetPitch = THREE.MathUtils.clamp(-accel * 0.002, -0.06, 0.06);
    if (this.airborne) targetPitch = THREE.MathUtils.clamp(-this.vy * 0.03, -0.35, 0.35);
    else if (this.position.y > 0.05) targetPitch = -0.3;
    const k = 1 - Math.exp(-dt * 8);
    this.roll += (targetRoll - this.roll) * k;
    this.pitch += (targetPitch - this.pitch) * k;
    m.body.rotation.set(this.pitch, 0, this.roll + this.extraRoll);

    const steer = ctl ? -ctl.steer * 0.5 : 0;
    this.steerVis += (steer - this.steerVis) * (1 - Math.exp(-dt * 14));
    this.wheelSpin += (this.forwardSpeed * dt) / m.wheelRadius;
    for (const p of m.frontPivots) p.rotation.y = this.steerVis;
    for (const w of m.wheelMeshes) w.rotation.x = this.wheelSpin;
    const braking = ctl ? ctl.throttle < 0 && this.forwardSpeed > 0.5 : false;
    this.clock += dt;
    m.tailMat.emissiveIntensity = this.hazard ? (Math.sin(this.clock * 9) > 0 ? 3.6 : 0.15) : braking ? 3.2 : 1.1;
  }
}
