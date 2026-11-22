import {
  type Game,
  type Site,
  type Structure,
  type StructureDef,
  type Vec,
  fromPolar,
  segmentHitsCircle,
} from '@engine';
import type { UiState } from '../contract';

/** Same grazing allowance as the engine's line of sight, so a drawn beam matches the one it fires. */
const HORIZON = 0.98;

export interface Beam {
  structure: Structure;
  from: Vec;
  to: Vec;
  def: StructureDef;
}

/**
 * The beams firing right now. The engine sends no event for a beam, only for launcher shots, so
 * this repeats its targeting: the lowest body in range that the planet does not hide.
 */
export function beams(game: Game, time: number): Beam[] {
  const found: Beam[] = [];
  const defs = game.structures();
  const blocker = game.level.world.planetRadius * HORIZON;
  for (const structure of game.state.structures) {
    const def = defs[structure.def];
    if (!structure.enabled || def?.weapon?.type !== 'beam') continue;
    const from = game.sitePosition(structure.site, time);
    let best: Vec | undefined;
    let bestR = Infinity;
    for (const asteroid of game.state.asteroids) {
      if (asteroid.hp <= 0 || asteroid.r >= bestR) continue;
      const at = fromPolar(asteroid.r, asteroid.theta);
      if (Math.hypot(at.x - from.x, at.y - from.y) > def.weapon.range || segmentHitsCircle(from, at, blocker)) continue;
      best = at;
      bestR = asteroid.r;
    }
    if (best) found.push({ structure, from, to: best, def });
  }
  return found;
}

/** The range circle worth showing: the selected structure's, or the one being considered for an empty slot. */
export function rangeToDraw(game: Game, ui: UiState): { site: Site; radius: number } | null {
  const site = ui.selected;
  if (!site) return null;
  const built = game.structureAt(site);
  const id = built ? built.def : ui.preview;
  const def = id ? game.structures()[id] : undefined;
  const radius = def?.weapon?.range ?? def?.field?.radius;
  return radius ? { site, radius } : null;
}

export interface StructureLook {
  /** 1 is running normally; lower is switched off, starved of power, out of fuel or in the dark. */
  alpha: number;
  /** Share of a launcher's next shot charged, or null for anything that does not charge. */
  charge: number | null;
}

const OFF = 0.35;
const LOW = 0.45;

export function structureLook(game: Game, structure: Structure, def: StructureDef, time: number): StructureLook {
  const weapon = def.weapon;
  const charge = weapon?.type === 'launcher' ? Math.min(1, structure.charge / weapon.energyPerShot) : null;
  if (!structure.enabled) return { alpha: OFF, charge };
  let share = 1;
  if (weapon || def.field || def.lab) share = game.state.power.factor;
  const generator = def.generator;
  if (generator?.fuel && (game.state.reserves[generator.fuel.reserve] ?? 0) <= 0) share = 0;
  if (generator && generator.source !== 'constant') {
    const sun = game.sunlight(structure.site, time);
    share = Math.min(share, generator.source === 'daylight' && sun > 0 ? 1 : sun);
  }
  return { alpha: share >= 1 ? 1 : LOW + (1 - LOW) * share, charge };
}
