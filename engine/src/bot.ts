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

function spreadSite(sites: Site[], built: number): Site | undefined {
  return sites.length > 0 ? sites[(built * 3) % sites.length] : undefined;
}

/**
 * A simple baseline player: research whatever is affordable, keep firm generation ahead of
 * peak demand, and otherwise cycle through `weapons`. It is a yardstick for balance, not a
 * strong player: a level it cannot beat is too hard for a first-time human.
 */
export function greedyPolicy(weapons: string[]): Policy {
  return (game) => {
    if (game.state.tick % 20 !== 0) return [];
    const { content, state } = game;
    for (const tech of Object.values(content.techs)) {
      const open = (tech.requires ?? []).every((id) => state.techs.includes(id));
      if (!state.techs.includes(tech.id) && open && state.science >= tech.cost) {
        return [{ type: 'research', tech: tech.id }];
      }
    }

    let supply = 0;
    let demand = 0;
    for (const structure of state.structures) {
      const def = content.structures[structure.def];
      supply += firmOutput(def);
      demand += peakDraw(def);
    }
    const weaponsBuilt = state.structures.filter((s) => content.structures[s.def].weapon).length;
    const next = content.structures[weapons[weaponsBuilt % weapons.length]];

    let wanted: StructureDef | undefined = next;
    if (supply < demand + peakDraw(next)) {
      wanted = Object.values(content.structures)
        .filter((def) => def.generator && game.canBuild(def))
        .sort((a, b) => firmOutput(b) / b.cost - firmOutput(a) / a.cost)[0];
    }
    if (!wanted || !game.canBuild(wanted)) return [];
    for (const kind of wanted.sites) {
      const site = spreadSite(game.freeSites(kind), state.structures.length);
      if (site) return [{ type: 'build', structure: wanted.id, site }];
    }
    return [];
  };
}
