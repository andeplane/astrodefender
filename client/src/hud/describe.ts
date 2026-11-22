import type { Cost, LevelDef, Resource, Site, StructureDef } from '@engine';
import { compact, reserveName, resourceName } from '../labels';

const RESOURCES: Resource[] = ['minerals', 'science', 'exotics'];

/** One line of the numbers that matter for a structure, read from its effective definition. */
export function statLine(def: StructureDef): string {
  const parts: string[] = [];
  const { generator, weapon, lab, battery, field } = def;
  if (generator) {
    const when = generator.source === 'constant' ? '' : generator.source === 'solar' ? ' in sun' : ' by day';
    parts.push(`+${compact(generator.output)} power${when}`);
    if (generator.fuel)
      parts.push(`burns ${reserveName(generator.fuel.reserve).toLowerCase()} ${generator.fuel.rate}/s`);
  }
  if (weapon) {
    parts.push(weapon.type === 'beam' ? `${weapon.dps} dps ${weapon.damage}` : `${weapon.hit}/hit ${weapon.damage}`);
    parts.push(`range ${weapon.range}`);
    if (weapon.type === 'launcher' && weapon.ammo > 0) parts.push(`${weapon.ammo} minerals/shot`);
  }
  if (field) parts.push(`slows ${Math.round(field.slow * 100)}%`, `radius ${field.radius}`);
  if (lab) parts.push(`+${lab.science} science/s`);
  if (battery && battery.capacity > 0) parts.push(`stores ${compact(battery.capacity)}`);
  const draw = (weapon?.draw ?? 0) + (field?.draw ?? 0) + (lab?.draw ?? 0);
  if (draw > 0) parts.push(`draws ${draw}`);
  return parts.join(' · ');
}

export function costText(cost: Cost): string {
  const parts = RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0).map(
    (resource) => `${compact(cost[resource] ?? 0)} ${resourceName(resource)}`,
  );
  return parts.length > 0 ? parts.join(' + ') : 'free';
}

/** The surface features a slot has, such as water. */
export function featuresOf(level: LevelDef, site: Site): string[] {
  if (site.kind !== 'surface') return [];
  const features = level.world.surfaceFeatures ?? {};
  return Object.keys(features).filter((feature) => features[feature].includes(site.slot));
}

/** Mirrors the engine's own check: a structure that demands a feature needs a surface slot with it. */
export function fitsSite(level: LevelDef, def: StructureDef, site: Site): boolean {
  if (!def.sites.includes(site.kind)) return false;
  return !def.feature || featuresOf(level, site).includes(def.feature);
}

export function siteTitle(level: LevelDef, site: Site): string {
  if (site.kind === 'shell') return `Orbit ${site.shell + 1} · slot ${site.slot + 1}`;
  const features = featuresOf(level, site);
  const suffix = features.length > 0 ? ` · ${features.join(', ')}` : '';
  return `Surface slot ${site.slot + 1}${suffix}`;
}

export function siteKey(site: Site | null): string {
  if (!site) return '';
  return site.kind === 'surface' ? `s${site.slot}` : `o${site.shell}.${site.slot}`;
}
