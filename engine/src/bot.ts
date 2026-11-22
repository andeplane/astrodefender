import type { Game } from './game';
import type { Command, GameState, Site, StructureDef } from './types';

/** A player: looks at the game and returns the commands to issue before the next tick. */
export type Policy = (game: Game) => Command[];

export interface RunResult {
  status: GameState['status'];
  ticks: number;
  population: number;
  stats: GameState['stats'];
}

/** Play a game to the end (or to maxTicks) with a policy. This is the balance harness. */
export function runGame(game: Game, policy: Policy, maxTicks: number): RunResult {
  while (game.state.status === 'playing' && game.state.tick < maxTicks) {
    for (const command of policy(game)) game.apply(command);
    game.tick();
  }
  const { status, tick, population, stats } = game.state;
  return { status, ticks: tick, population, stats };
}

export const idlePolicy: Policy = () => [];

function peakDraw(def: StructureDef): number {
  return (def.weapon?.draw ?? 0) + (def.field?.draw ?? 0) + (def.lab?.draw ?? 0);
}

/** Solar is counted at a third of its rating, roughly what a surface farm averages over a day. */
function firmOutput(def: StructureDef): number {
  if (!def.generator) return 0;
  return def.generator.output * (def.generator.source === 'solar' ? 1 / 3 : 1);
}

/** A plant whose fuel has run out is not worth building. */
function fuelled(def: StructureDef, state: GameState): boolean {
  const fuel = def.generator?.fuel;
  return !fuel || (state.reserves[fuel.reserve] ?? 0) > 0;
}

function spreadSite(sites: Site[], built: number): Site | undefined {
  const kind = sites[0]?.kind;
  const preferred = sites.filter((site) => site.kind === kind);
  return preferred.length > 0 ? preferred[(built * 3) % preferred.length] : undefined;
}

/**
 * A simple baseline player: research the first affordable tech on offer, keep firm generation ahead of
 * peak demand, build `labs` labs after its first weapon, and otherwise cycle through `weapons`. It is a yardstick for balance, not a
 * strong player: a level it cannot beat is too hard for a first-time human.
 */
export function greedyPolicy(weapons: string[], labs = 0): Policy {
  return (game) => {
    if (game.state.tick % 20 !== 0) return [];
    const { state } = game;
    const defs = game.structures();
    for (const tech of game.researchable()) {
      if (game.canAfford(game.techCost(tech))) return [{ type: 'research', tech: tech.id }];
    }

    let supply = 0;
    let demand = 0;
    for (const structure of state.structures) {
      const def = defs[structure.def];
      supply += firmOutput(def);
      demand += peakDraw(def);
    }
    const weaponsBuilt = state.structures.filter((s) => defs[s.def].weapon).length;
    // Weapons still locked are skipped, so the same player works before and after research.
    const usable = weapons.filter((id) => state.unlocked.includes(id));
    if (usable.length === 0) return [];
    const labsBuilt = state.structures.filter((s) => defs[s.def].lab).length;
    const lab = Object.values(defs).find((def) => def.lab && state.unlocked.includes(def.id));
    // The first weapon comes before the first lab, then labs until there are enough.
    const next = lab && weaponsBuilt > 0 && labsBuilt < labs ? lab : defs[usable[weaponsBuilt % usable.length]];

    let wanted: StructureDef | undefined = next;
    if (supply < demand + peakDraw(next)) {
      wanted = Object.values(defs)
        .filter((def) => def.generator && fuelled(def, state) && game.canBuild(def) && game.sitesFor(def).length > 0)
        .sort((a, b) => firmOutput(b) / b.cost - firmOutput(a) / a.cost)[0];
    }
    if (!wanted || !game.canBuild(wanted)) return [];
    const site = spreadSite(game.sitesFor(wanted), state.structures.length);
    return site ? [{ type: 'build', structure: wanted.id, site }] : [];
  };
}
