/**
 * Placeholder look, shared by the canvas and the HUD so a laser is the same colour in both.
 * Unknown ids fall back to `fallback`, so new content shows up without a client change.
 */
export interface Swatch {
  color: string;
  /** One or two characters drawn on the structure and its build button. */
  glyph: string;
}

export const fallback: Swatch = { color: '#9aa4b2', glyph: '?' };

export const structureSwatches: Record<string, Swatch> = {
  coalPlant: { color: '#8d7b68', glyph: 'C' },
  oilPlant: { color: '#b08d57', glyph: 'O' },
  dam: { color: '#4aa3df', glyph: 'D' },
  solarFarm: { color: '#f2c94c', glyph: 'S' },
  fissionPlant: { color: '#7bd88f', glyph: 'N' },
  orbitalReactor: { color: '#58c4a3', glyph: 'R' },
  fusionPlant: { color: '#c08bff', glyph: 'F' },
  orbitalSolar: { color: '#ffd76a', glyph: 'S' },
  battery: { color: '#6fcf97', glyph: 'B' },
  lab: { color: '#56ccf2', glyph: 'L' },
  laser: { color: '#ff5d5d', glyph: 'La' },
  cannon: { color: '#e0e0e0', glyph: 'Ca' },
  rocketBattery: { color: '#ff9f43', glyph: 'Ro' },
  railgun: { color: '#7aa2ff', glyph: 'Ra' },
  relativityField: { color: '#b388ff', glyph: 'T' },
};

export const asteroidColors: Record<string, string> = {
  rock: '#a08c7a',
  iron: '#8b95a5',
  ice: '#a8e0f0',
};

export const damageColors: Record<string, string> = {
  thermal: '#ff5d5d',
  kinetic: '#e0e0e0',
  explosive: '#ff9f43',
};

export const palette = {
  space: '#05070d',
  planetDay: '#2f6f9f',
  planetNight: '#0d2233',
  atmosphere: 'rgba(120, 190, 255, 0.10)',
  shell: 'rgba(255, 255, 255, 0.10)',
  slot: 'rgba(255, 255, 255, 0.35)',
  slotClosed: 'rgba(255, 255, 255, 0.08)',
  water: '#4aa3df',
  selection: '#ffffff',
  range: 'rgba(255, 255, 255, 0.18)',
  text: '#e8edf5',
  muted: '#8a94a6',
  good: '#6fcf97',
  warn: '#f2c94c',
  bad: '#ff5d5d',
  panel: 'rgba(12, 16, 26, 0.88)',
  /** Land on the planet, so its spin shows. */
  land: '#3f8a5a',
  /** Hue of the atmosphere glow; the renderer sets the alpha. */
  sky: '#78beff',
  /** Bodies heating up deep in the atmosphere. */
  heat: '#ff8a3d',
  /** Minerals floating up from a kill. */
  minerals: '#f2c94c',
};

export function swatch(structure: string): Swatch {
  return structureSwatches[structure] ?? fallback;
}

/** Rim colour of a research card's button, by its line in the tech tree. */
export const techLineColors: Record<string, string> = {
  energy: '#f2c94c',
  weapons: '#ff5d5d',
  economy: '#6fcf97',
  sight: '#56ccf2',
  orbit: '#7aa2ff',
  compute: '#c08bff',
};

export function techLineColor(line: string): string {
  return techLineColors[line] ?? fallback.color;
}

/** The command card's own buttons, the ones that are not a structure or a card. */
export const commandSwatches = {
  back: { color: '#9aa4b2', glyph: '✕' },
  research: { color: '#56ccf2', glyph: '⚗' },
  callWave: { color: '#ff9f43', glyph: '☄' },
  sell: { color: '#f2c94c', glyph: '$' },
  turnOff: { color: '#ff5d5d', glyph: 'Off' },
  turnOn: { color: '#6fcf97', glyph: 'On' },
  idle: { color: '#8a94a6', glyph: '◎' },
  emptySlot: { color: '#8a94a6', glyph: '+' },
} satisfies Record<string, Swatch>;
