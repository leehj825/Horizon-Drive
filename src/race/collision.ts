import type { CarController } from '../vehicle/CarController';

const R = 1.75;

/**
 * Car-vs-car contact (two circles per car along the body). Pushes the cars apart, trades momentum, kicks the
 * headings of both for a spin on hard hits, and applies the Shockwave Bumper. Returns the closing speed (m/s) of
 * the hit, or 0 when the cars are not touching.
 */
export function resolveCars(a: CarController, b: CarController): number {
  if (a.airborne || b.airborne) return 0;
  const dx0 = b.position.x - a.position.x, dz0 = b.position.z - a.position.z;
  if (dx0 * dx0 + dz0 * dz0 > 36) return 0;
  let strongest = 0;
  const sa = Math.sin(a.heading), ca = Math.cos(a.heading), sb = Math.sin(b.heading), cb = Math.cos(b.heading);
  for (const oa of [-1.1, 1.1]) for (const ob of [-1.1, 1.1]) {
    const ax = a.position.x + sa * oa, az = a.position.z + ca * oa;
    const bx = b.position.x + sb * ob, bz = b.position.z + cb * ob;
    let dx = bx - ax, dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d >= R || d < 1e-4) continue;
    dx /= d; dz /= d;
    const push = (R - d) * 0.5;
    a.position.x -= dx * push; a.position.z -= dz * push;
    b.position.x += dx * push; b.position.z += dz * push;
    const rv = (b.vx - a.vx) * dx + (b.vz - a.vz) * dz; // negative = closing
    if (rv < 0) {
      const imp = -rv * 0.65;
      a.vx -= dx * imp; a.vz -= dz * imp;
      b.vx += dx * imp; b.vz += dz * imp;
      if (-rv > strongest) {
        strongest = -rv;
        if (-rv > 5) {
          const kick = Math.min(0.5, -rv * 0.02);
          // contact position in each car's frame decides which way it is knocked around
          const fa = (bx - a.position.x) * sa + (bz - a.position.z) * ca, la = (bx - a.position.x) * ca - (bz - a.position.z) * sa;
          const fb = (ax - b.position.x) * sb + (az - b.position.z) * cb, lb = (ax - b.position.x) * cb - (az - b.position.z) * sb;
          a.heading += -Math.sign(fa || 1) * Math.sign(la || 1) * kick;
          b.heading += -Math.sign(fb || 1) * Math.sign(lb || 1) * kick;
        }
      }
    }
    if (a.mods.bumper) { b.vx += dx * 0.67; b.vz += dz * 0.67; }
    if (b.mods.bumper) { a.vx -= dx * 0.67; a.vz -= dz * 0.67; }
  }
  if (strongest > 6) { a.stunT = Math.max(a.stunT, Math.min(1.4, strongest * 0.06)); b.stunT = Math.max(b.stunT, Math.min(1.4, strongest * 0.06)); }
  return strongest;
}
