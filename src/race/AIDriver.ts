import type { CarController, ControlState } from '../vehicle/CarController';

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Spline-following driver: looks ahead along the track, brakes for curvature, uses nitro on straights. */
export class AIDriver {
  /** Preferred lateral lane (metres, + = left). */
  lane: number;
  /** Corner speed capability multiplier. */
  cornering = 1;
  private nitroOn = false;
  private stuckT = 0;
  readonly ctl: ControlState = { throttle: 0, steer: 0, handbrake: false, nitro: false };

  constructor(public skill = 1, lane = 0) {
    this.lane = lane;
  }

  update(car: CarController, dt: number, targetScale = 1): ControlState {
    const track = car.track;
    const q = car.tq;
    const speed = car.speed;
    const look = 8 + speed * 0.42;
    const tp = track.pointAt(q.s + look, this.laneAt(car));
    const desired = Math.atan2(tp.x - car.position.x, tp.z - car.position.z);
    const err = wrapAngle(desired - car.heading);
    const steer = Math.max(-1, Math.min(1, -err * 2.6));

    // corner speed from curvature ahead
    const kap = track.curvatureAhead(q.idx, 28 + speed * 1.3);
    const aLat = 25 * this.cornering * this.skill;
    const vCorner = kap > 1e-4 ? Math.sqrt(aLat / kap) : 999;
    const target = Math.min(car.stats.maxSpeed * this.skill * targetScale, vCorner);
    const throttle = Math.max(-1, Math.min(1, (target - speed) / 3.5));

    // nitro on straights
    if (!this.nitroOn && car.nitro > 0.55 && kap < 1 / 220 && speed > 22) this.nitroOn = true;
    if (this.nitroOn && (car.nitro < 0.06 || kap > 1 / 150)) this.nitroOn = false;

    // stuck recovery
    if (speed < 2.5 && !car.locked) this.stuckT += dt; else this.stuckT = 0;
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
    return Math.max(-hw, Math.min(hw, this.lane));
  }
}
