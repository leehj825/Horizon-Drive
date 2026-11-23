import type { ControlState } from '../vehicle/CarController';

export type VirtualButton = 'left' | 'right' | 'brake' | 'drift' | 'nitro';

/** Keyboard + gamepad + on-screen buttons -> ControlState. Steering is smoothed for analog feel. */
export class Input {
  private keys = new Set<string>();
  private virtual: Record<VirtualButton, boolean> = { left: false, right: false, brake: false, drift: false, nitro: false };
  private steer = 0;
  touch = false;
  /** Steering response multiplier (settings). */
  sensitivity = 1;
  private pressed = new Set<string>();
  readonly state: ControlState = { throttle: 0, steer: 0, handbrake: false, nitro: false };

  constructor() {
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); for (const k of Object.keys(this.virtual)) this.virtual[k as VirtualButton] = false; });
  }

  setVirtual(b: VirtualButton, down: boolean): void { this.virtual[b] = down; }

  /** True once per key press (menus, pause, reset). */
  consume(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  private down(...codes: string[]): boolean { return codes.some((c) => this.keys.has(c)); }

  poll(dt: number): ControlState {
    const pad = (navigator.getGamepads?.() ?? []).find((g) => g && g.connected) ?? null;
    let throttle = 0;
    if (this.down('KeyW', 'ArrowUp')) throttle += 1;
    if (this.down('KeyS', 'ArrowDown')) throttle -= 1;
    let target = 0;
    if (this.down('KeyA', 'ArrowLeft') || this.virtual.left) target -= 1;
    if (this.down('KeyD', 'ArrowRight') || this.virtual.right) target += 1;
    let handbrake = this.down('Space') || this.virtual.drift;
    let nitro = this.down('ShiftLeft', 'ShiftRight', 'KeyN') || this.virtual.nitro;
    if (this.touch) {
      throttle = this.virtual.brake ? -1 : 1; // auto-accelerate on touch
    }
    if (pad) {
      const ax = Math.abs(pad.axes[0]) > 0.12 ? pad.axes[0] : 0;
      if (ax) target = ax;
      const rt = pad.buttons[7]?.value ?? 0, lt = pad.buttons[6]?.value ?? 0;
      if (rt > 0.05 || lt > 0.05) throttle = rt - lt;
      if (pad.buttons[0]?.pressed || pad.buttons[1]?.pressed) handbrake = true;
      if (pad.buttons[2]?.pressed || pad.buttons[5]?.pressed) nitro = true;
    }
    // smooth keyboard steering: quick to turn in, quicker to centre
    const rate = (target === 0 ? 9 : Math.sign(target) === Math.sign(this.steer) || this.steer === 0 ? 5.5 : 11) * this.sensitivity;
    const d = target - this.steer;
    this.steer += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    const s = this.state;
    s.throttle = throttle; s.steer = this.steer; s.handbrake = handbrake; s.nitro = nitro;
    return s;
  }
}
