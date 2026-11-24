import type { CarController, ControlState } from '../vehicle/CarController';

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export type DriveStyle = 'clean' | 'aggressive' | 'blocker';

/** What a driver does about a car in its way. */
export type AvoidMode = 'swerve' | 'brake' | 'none';

/** Spline-following driver: looks ahead along the track, brakes for curvature, uses nitro on straights. */
export class AIDriver {
  /** Preferred lateral lane (metres, + = left). */
  lane: number;
  /** Corner speed capability multiplier. */
  cornering = 1;
  avoid: AvoidMode = 'none';
  /** Drive against the lap direction (oncoming traffic). */
  reverse = false;
  /** External speed limit (m/s), e.g. a train crossing ahead. */
  hazardLimit = Infinity;
  style: DriveStyle = 'clean';
  /** The human player (rivals with attitude react to it). */
  target: CarController | null = null;
  private laneNow: number | null = null;
  /** Cars to look out for (set by the owner each step). */
  others: readonly CarController[] = [];
  private nitroOn = false;
  private stuckT = 0;
  private offset = 0;
  /** 0..1: how blocked the road ahead currently is (for traffic honk / debug). */
  blocked = 0;
  readonly ctl: ControlState = { throttle: 0, steer: 0, handbrake: false, nitro: false };

  constructor(public skill = 1, lane = 0) {
    this.lane = lane;
  }

  update(car: CarController, dt: number, targetScale = 1): ControlState {
    const track = car.track;
    const q = car.tq;
    const speed = car.speed;

    // --- look for cars in the way (in this car's own frame) ---
    let limit = Infinity;
    let want = 0;
    this.blocked = 0;
    if (this.avoid !== 'none') {
      const sh = Math.sin(car.heading), ch = Math.cos(car.heading);
      const range = 14 + speed * 0.75;
      for (const o of this.others) {
        if (o === car) continue;
        if (this.style === 'aggressive' && o === this.target) continue; // aggressive drivers do not dodge the player
        const dx = o.position.x - car.position.x, dz = o.position.z - car.position.z;
        const f = dx * sh + dz * ch;
        if (f < 1 || f > range) continue;
        const l = dx * ch - dz * sh; // + = left
        if (Math.abs(l) > 3.0) continue;
        this.blocked = Math.max(this.blocked, 1 - f / range);
        const ov = o.vx * sh + o.vz * ch; // its speed along my heading (negative when oncoming)
        limit = Math.min(limit, Math.max(ov, 6) + Math.max(0, f - 7) * 0.9);
        if (this.avoid === 'swerve') want = l > 0 ? -3.6 : 3.6;
      }
    }
    // attitude: aggressive drivers chase the player's line, blockers mirror it in front
    let laneWant = this.lane;
    if (this.target && this.style !== 'clean') {
      const t = this.target;
      const sh = Math.sin(car.heading), ch = Math.cos(car.heading);
      const dx = t.position.x - car.position.x, dz = t.position.z - car.position.z;
      const f = dx * sh + dz * ch, l = dx * ch - dz * sh;
      if (this.style === 'aggressive' && f > -6 && f < 16 && Math.abs(l) < 7 && t.speed > 12) laneWant = t.tq.lat;
      else if (this.style === 'blocker' && f < -3 && f > -30 && Math.abs(l) < 9) laneWant = t.tq.lat;
    }
    this.laneNow = this.laneNow === null ? laneWant : this.laneNow + (laneWant - this.laneNow) * Math.min(1, dt * 2.6);
    this.offset += (want - this.offset) * Math.min(1, dt * (want !== 0 ? 4.5 : 1.6));

    const look = 7 + speed * 0.36;
    const dirSign = this.reverse ? -1 : 1;
    const tp = track.pointAt(q.s + dirSign * look, this.laneAt(car));
    const desired = Math.atan2(tp.x - car.position.x, tp.z - car.position.z);
    const err = wrapAngle(desired - car.heading);
    const steer = Math.max(-1, Math.min(1, -err * 2.6));

    // corner speed from curvature ahead
    const kap = this.reverse ? track.curvatureBehind(q.idx, 28 + speed * 1.3) : track.curvatureAhead(q.idx, 28 + speed * 1.3);
    // lateral grip shrinks with speed (steering authority and slip), so fast corners are taken slower than slow ones
    const aLat = (v: number) => Math.max(13, 25 - 0.3 * Math.max(0, v - 17)) * this.cornering * this.skill;
    const v1 = kap > 1e-4 ? Math.sqrt(aLat(0) / kap) : 999;
    const vCorner = kap > 1e-4 ? Math.sqrt(aLat(v1) / kap) : 999;
    const target = Math.min(car.stats.maxSpeed * this.skill * targetScale, vCorner, limit, this.hazardLimit);
    const throttle = Math.max(-1, Math.min(1, (target - speed) / 3.5));

    // nitro on straights
    if (!this.nitroOn && car.nitro > 0.55 && kap < 1 / 220 && speed > 22 && this.blocked === 0) this.nitroOn = true;
    if (this.nitroOn && (car.nitro < 0.06 || kap > 1 / 150 || this.blocked > 0)) this.nitroOn = false;

    // stuck recovery
    if (speed < 2.5 && !car.locked && limit === Infinity && this.hazardLimit === Infinity) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 2.2) { car.respawn(); this.stuckT = 0; }

    const c = this.ctl;
    c.steer = steer;
    c.throttle = throttle;
    c.handbrake = false;
    c.nitro = this.nitroOn && throttle > 0.5;
    return c;
  }

  private laneAt(car: CarController): number {
    const hw = car.track.halfWidth - 2.6;
    return Math.max(-hw, Math.min(hw, (this.laneNow ?? this.lane) + this.offset));
  }
}
