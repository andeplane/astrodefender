import { modifierProblem } from './modifiers';
import type { Content, LevelDef, TechDef } from './types';

/**
 * Checks that content and levels only refer to things that exist, so a typo in the tech tree
 * fails a test instead of doing nothing in play. Returns one line per problem.
 */
export function validate(content: Content, levels: LevelDef[] = []): string[] {
  const problems: string[] = [];
  const { structures, techs } = content;

  for (const [key, def] of Object.entries(structures)) {
    if (def.id !== key) problems.push(`structure ${key}: id is ${def.id}`);
  }

  const groups = new Map<string, number>();
  for (const [key, tech] of Object.entries(techs)) {
    const where = `tech ${key}`;
    if (tech.id !== key) problems.push(`${where}: id is ${tech.id}`);
    for (const id of tech.requires ?? []) {
      if (!techs[id]) problems.push(`${where}: requires unknown tech ${id}`);
    }
    if (dependsOn(techs, tech, key, new Set())) problems.push(`${where}: requires itself`);
    if (tech.exclusive) groups.set(tech.exclusive, (groups.get(tech.exclusive) ?? 0) + 1);
    if (tech.repeat && tech.repeat.growth < 1) problems.push(`${where}: repeat cost shrinks`);
    for (const amount of Object.values(tech.cost)) {
      if (amount < 0) problems.push(`${where}: negative cost`);
    }
    for (const effect of tech.effects) {
      if (effect.type === 'unlock' || effect.type === 'modify') {
        const def = structures[effect.structure];
        if (!def) problems.push(`${where}: unknown structure ${effect.structure}`);
        else if (effect.type === 'modify') {
          const problem = modifierProblem(def, effect);
          if (problem) problems.push(`${where}: ${problem}`);
        }
      } else if (effect.type === 'slots') {
        if (effect.shell < 0 || effect.count <= 0) problems.push(`${where}: bad slots effect`);
      } else if (effect.amount <= 0) {
        problems.push(`${where}: bad reserve effect`);
      }
    }
  }
  for (const [group, size] of groups) {
    if (size < 2) problems.push(`exclusive group ${group}: only one tech`);
  }

  levels.forEach((level, index) => {
    const where = `level ${index}`;
    for (const id of level.start.structures ?? []) {
      if (!structures[id]) problems.push(`${where}: starts with unknown structure ${id}`);
    }
    for (const id of level.start.techs) {
      if (!techs[id]) problems.push(`${where}: starts with unknown tech ${id}`);
    }
    const pool = level.research?.pool ?? [];
    const reachable = new Set([...pool, ...level.start.techs]);
    for (const id of pool) {
      const tech = techs[id];
      if (!tech) {
        problems.push(`${where}: pool has unknown tech ${id}`);
        continue;
      }
      for (const required of tech.requires ?? []) {
        if (!reachable.has(required)) problems.push(`${where}: ${id} requires ${required}, which is not in the pool`);
      }
      for (const effect of tech.effects) {
        if (effect.type === 'slots' && !level.world.shells[effect.shell]) {
          problems.push(`${where}: ${id} opens shell ${effect.shell}, which the level lacks`);
        }
      }
    }
  });
  return problems;
}

/** True when following `requires` from the tech leads to `target`. */
function dependsOn(techs: Record<string, TechDef>, tech: TechDef, target: string, seen: Set<string>): boolean {
  for (const id of tech.requires ?? []) {
    if (id === target) return true;
    const next = techs[id];
    if (!next || seen.has(id)) continue;
    seen.add(id);
    if (dependsOn(techs, next, target, seen)) return true;
  }
  return false;
}
