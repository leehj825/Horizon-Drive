import type { BiomeId } from './biomes';

export type SlotId = 'suspension' | 'booster' | 'utility';
export type EquipmentId = 'susp_street' | 'susp_offroad' | 'boost_twin' | 'boost_drift' | 'util_magnet' | 'util_bumper';

export interface EquipmentDef {
  id: EquipmentId;
  slot: SlotId;
  cost: number;
  /** Biomes (or modes) this item is recommended for. */
  recommended: (BiomeId | 'all' | 'duel' | 'circuit')[];
}

export const EQUIPMENT: Record<EquipmentId, EquipmentDef> = {
  susp_street: { id: 'susp_street', slot: 'suspension', cost: 400, recommended: ['neon_street', 'harbor_docks', 'downtown_day', 'apex_circuit', 'coast_highway'] },
  susp_offroad: { id: 'susp_offroad', slot: 'suspension', cost: 400, recommended: ['red_canyon', 'alpine_pass'] },
  boost_twin: { id: 'boost_twin', slot: 'booster', cost: 600, recommended: ['coast_highway', 'apex_circuit'] },
  boost_drift: { id: 'boost_drift', slot: 'booster', cost: 600, recommended: ['neon_street', 'harbor_docks', 'alpine_pass'] },
  util_magnet: { id: 'util_magnet', slot: 'utility', cost: 500, recommended: ['all'] },
  util_bumper: { id: 'util_bumper', slot: 'utility', cost: 500, recommended: ['duel', 'circuit'] },
};

export const SLOTS: SlotId[] = ['suspension', 'booster', 'utility'];
export const EQUIPMENT_LIST = Object.values(EQUIPMENT);

/** Gameplay modifiers produced by the equipped parts. */
export interface CarMods {
  /** Extra grip on asphalt roads (0.2 = +20%). */
  asphaltGrip: number;
  /** Ignore the dirt / snow / off-road slowdown. */
  ignoreSoft: boolean;
  nitroDurationMul: number;
  driftNitroMul: number;
  magnetRadius: number;
  bumper: boolean;
}

export type Loadout = Partial<Record<SlotId, EquipmentId | null>>;

export function modsFor(loadout: Loadout): CarMods {
  const has = (id: EquipmentId) => loadout.suspension === id || loadout.booster === id || loadout.utility === id;
  return {
    asphaltGrip: has('susp_street') ? 0.2 : 0,
    ignoreSoft: has('susp_offroad'),
    nitroDurationMul: has('boost_twin') ? 1.35 : 1,
    driftNitroMul: has('boost_drift') ? 2 : 1,
    magnetRadius: has('util_magnet') ? 20 : 3,
    bumper: has('util_bumper'),
  };
}

export const NO_MODS: CarMods = modsFor({});
