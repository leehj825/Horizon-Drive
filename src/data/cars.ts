import type { CarShape } from '../vehicle/CarMeshBuilder';
import type { VehicleStats } from './upgrades';

export type CarId = 'coupe' | 'hatch' | 'muscle' | 'hyper';
export const CAR_IDS: CarId[] = ['coupe', 'hatch', 'muscle', 'hyper'];

export interface CarDef {
  id: CarId;
  cost: number;
  shape: CarShape;
  /** Multipliers on the tuned base stats. */
  mult: { maxSpeed: number; accel: number; grip: number; nitroRate: number };
  /** Added to the fraction of speed kept after a wall hit. */
  tough: number;
}

export const CARS: Record<CarId, CarDef> = {
  coupe: { id: 'coupe', cost: 0, shape: 'coupe', mult: { maxSpeed: 1, accel: 1, grip: 1, nitroRate: 1 }, tough: 0 },
  hatch: { id: 'hatch', cost: 1400, shape: 'hatch', mult: { maxSpeed: 0.94, accel: 1.1, grip: 1.2, nitroRate: 1.05 }, tough: 0.02 },
  muscle: { id: 'muscle', cost: 2200, shape: 'muscle', mult: { maxSpeed: 1.05, accel: 1.18, grip: 0.88, nitroRate: 1 }, tough: 0.1 },
  hyper: { id: 'hyper', cost: 4200, shape: 'hyper', mult: { maxSpeed: 1.12, accel: 1.1, grip: 1.06, nitroRate: 1.15 }, tough: 0 },
};

/** [body, accent] */
export const PAINTS: [number, number][] = [
  [0xff5a36, 0x19e6ff], [0x19e6ff, 0xff3fa6], [0xffd24a, 0x1b1f2a], [0x7bff9a, 0x1b1f2a],
  [0xb45cff, 0xffe14a], [0xf2f4ff, 0xff3b6b], [0x1b1f2a, 0xffd24a], [0xff3fa6, 0x19e6ff],
];

export function applyCar(stats: VehicleStats, car: CarDef): VehicleStats {
  return {
    maxSpeed: stats.maxSpeed * car.mult.maxSpeed,
    accel: stats.accel * car.mult.accel,
    grip: stats.grip * car.mult.grip,
    nitroRate: stats.nitroRate * car.mult.nitroRate,
    wallKeep: Math.min(0.92, stats.wallKeep + car.tough),
    landSoak: stats.landSoak,
    armor: stats.armor * (1 - car.tough),
  };
}
