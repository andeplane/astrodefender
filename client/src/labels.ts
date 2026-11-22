import type { CommandError, Resource } from '@engine';

/**
 * Words the player reads. The engine only knows ids, so names and one-line descriptions live here;
 * an id this table does not know still shows up, turned from camelCase into words.
 */
interface Label {
  name: string;
  description: string;
}

const structureLabels: Record<string, Label> = {
  coalPlant: { name: 'Coal plant', description: 'Steady power while the coal reserve lasts.' },
  oilPlant: { name: 'Oil plant', description: 'Twice the power of coal, burns the small oil reserve.' },
  dam: { name: 'Dam', description: 'Free constant power, only on a water slot.' },
  solarFarm: { name: 'Solar farm', description: 'Free power while the sun is up over its slot.' },
  fissionPlant: { name: 'Fission plant', description: 'Huge constant power, burns uranium.' },
  orbitalReactor: { name: 'Orbital reactor', description: 'Fission in orbit at half power, burns uranium.' },
  fusionPlant: { name: 'Fusion plant', description: 'Enormous power, burns fuel won from ice.' },
  orbitalSolar: { name: 'Orbital solar', description: 'Sunlight in orbit, dark only in the planet’s shadow.' },
  battery: { name: 'Battery', description: 'Stores spare power for when demand spikes.' },
  lab: { name: 'Lab', description: 'Turns power into science for research.' },
  laser: { name: 'Laser', description: 'Burns bodies away with no fragments; draws power while firing.' },
  cannon: { name: 'Cannon', description: 'Kinetic shots that shatter bodies and knock them back out.' },
  rocketBattery: { name: 'Rocket battery', description: 'Long-range explosive rockets that cost minerals.' },
  railgun: { name: 'Railgun', description: 'Heavy kinetic slugs with a big knockback.' },
  relativityField: { name: 'Relativity field', description: 'Slows every body inside it.' },
};

const reserveNames: Record<string, string> = {
  coal: 'Coal',
  oil: 'Oil',
  uranium: 'Uranium',
  fusionFuel: 'Fusion fuel',
};

const resourceNames: Record<Resource, string> = {
  minerals: 'minerals',
  science: 'science',
  exotics: 'exotics',
};

const errorTexts: Record<CommandError, string> = {
  'game-over': 'The game is over.',
  'unknown-structure': 'That structure does not exist.',
  'unknown-tech': 'That research does not exist.',
  'unknown-id': 'That structure is gone.',
  locked: 'Not researched yet.',
  'already-researched': 'Already researched.',
  excluded: 'A rival research was already taken.',
  'not-offered': 'That card is not on the table.',
  'no-capacity': 'No open slots left in this shell.',
  'cannot-afford': 'Not enough to pay for that.',
  'invalid-site': 'It cannot be built on this slot.',
  'site-occupied': 'This slot is already built on.',
  'wave-active': 'A wave is already under way.',
};

/** `fusionFuel` → `Fusion fuel`, so new content reads as words without a client change. */
export function humanize(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function structureName(id: string): string {
  return structureLabels[id]?.name ?? humanize(id);
}

export function structureDescription(id: string): string {
  return structureLabels[id]?.description ?? '';
}

export function reserveName(id: string): string {
  return reserveNames[id] ?? humanize(id);
}

export function resourceName(resource: Resource): string {
  return resourceNames[resource];
}

export function errorText(error: CommandError): string {
  return errorTexts[error];
}

/** 950, 1.2k, 12k, 3.4M: short enough for a chip on a phone. */
export function compact(value: number): string {
  const sign = value < 0 ? '-' : '';
  const size = Math.abs(value);
  if (size < 1000) return sign + String(Math.floor(size));
  const [scaled, unit] = size < 1e6 ? [size / 1e3, 'k'] : [size / 1e6, 'M'];
  // One decimal while it still fits, dropped from 10 up and when it is .0.
  const text = scaled < 10 ? (Math.floor(scaled * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(scaled));
  return sign + text + unit;
}

/** Seconds as m:ss, rounded up so a countdown never shows 0:00 while time is left. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}
