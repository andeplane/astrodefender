import type { Modifier, StructureDef } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Why a modifier cannot apply to a definition, or undefined when it can. The field must already
 * exist with the same type, so a misspelt path is an error instead of a silent no-op.
 */
export function modifierProblem(def: StructureDef, modifier: Modifier): string | undefined {
  let at: unknown = def;
  for (const key of modifier.stat.split('.')) {
    at = isRecord(at) ? at[key] : undefined;
  }
  if (at === undefined || isRecord(at)) return `${def.id} has no field ${modifier.stat}`;
  if (typeof at !== typeof modifier.value) return `${def.id}.${modifier.stat} is not a ${typeof modifier.value}`;
  if (modifier.op !== 'set' && typeof at !== 'number') return `${def.id}.${modifier.stat} cannot ${modifier.op}`;
  return undefined;
}

/** A copy of the definition with the modifier applied. Throws on a modifier that does not fit. */
export function applyModifier(def: StructureDef, modifier: Modifier): StructureDef {
  const problem = modifierProblem(def, modifier);
  if (problem) throw new Error(problem);
  const copy = structuredClone(def);
  const keys = modifier.stat.split('.');
  const last = keys[keys.length - 1];
  let at: unknown = copy;
  for (const key of keys.slice(0, -1)) {
    if (isRecord(at)) at = at[key];
  }
  if (isRecord(at)) {
    const current = at[last];
    if (typeof current === 'number' && typeof modifier.value === 'number' && modifier.op !== 'set') {
      at[last] = modifier.op === 'add' ? current + modifier.value : current * modifier.value;
    } else {
      at[last] = modifier.value;
    }
  }
  return copy;
}
