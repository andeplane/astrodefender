import type { Content, LevelDef, WorldDef } from './types';

/**
 * First-pass content. Every number here is a starting point to be tuned with the bot in
 * `bot.ts`; the tech list is a placeholder until the tech tree is designed.
 */
export const baseContent: Content = {
  asteroids: {
    rock: {
      id: 'rock',
      toughness: 10,
      resist: { thermal: 1, kinetic: 1, explosive: 1 },
      dragCoef: 6,
      ablation: 0.4,
      yield: 1,
      impact: 1,
      fragments: { count: 3, massFraction: 0.6 },
    },
    iron: {
      id: 'iron',
      toughness: 16,
      resist: { thermal: 0.4, kinetic: 1.2, explosive: 1 },
      dragCoef: 3,
      ablation: 0.1,
      yield: 2,
      impact: 1.5,
      fragments: { count: 2, massFraction: 0.5 },
    },
    ice: {
      id: 'ice',
      toughness: 6,
      resist: { thermal: 1.6, kinetic: 1, explosive: 1 },
      dragCoef: 8,
      ablation: 1.2,
      yield: 0.5,
      impact: 0.8,
      fragments: { count: 4, massFraction: 0.7 },
    },
  },
  structures: {
    coalPlant: { id: 'coalPlant', cost: 40, sites: ['surface'], generator: { output: 20, source: 'constant' } },
    solarFarm: {
      id: 'solarFarm',
      cost: 50,
      sites: ['surface'],
      requires: ['photovoltaics'],
      generator: { output: 60, source: 'solar' },
    },
    fissionPlant: {
      id: 'fissionPlant',
      cost: 200,
      sites: ['surface'],
      requires: ['fission'],
      generator: { output: 120, source: 'constant' },
    },
    orbitalSolar: {
      id: 'orbitalSolar',
      cost: 120,
      sites: ['shell'],
      requires: ['spaceSolar'],
      generator: { output: 50, source: 'solar' },
    },
    battery: { id: 'battery', cost: 30, sites: ['surface', 'shell'], battery: { capacity: 600 } },
    laser: {
      id: 'laser',
      cost: 60,
      sites: ['surface', 'shell'],
      weapon: { type: 'beam', range: 160, dps: 12, damage: 'thermal', draw: 15 },
    },
    railgun: {
      id: 'railgun',
      cost: 80,
      sites: ['surface', 'shell'],
      weapon: {
        type: 'launcher',
        range: 260,
        hit: 60,
        damage: 'kinetic',
        draw: 12,
        energyPerShot: 60,
        speed: 120,
        knockback: 15,
      },
    },
    relativityField: {
      id: 'relativityField',
      cost: 150,
      sites: ['shell'],
      requires: ['relativity'],
      field: { radius: 90, slow: 0.6, draw: 30 },
    },
    lab: { id: 'lab', cost: 70, sites: ['surface'], lab: { science: 1, draw: 10 } },
  },
  techs: {
    photovoltaics: { id: 'photovoltaics', cost: 20 },
    fission: { id: 'fission', cost: 80, requires: ['photovoltaics'] },
    spaceSolar: { id: 'spaceSolar', cost: 60, requires: ['photovoltaics'] },
    relativity: { id: 'relativity', cost: 100 },
  },
};

export const baseWorld: WorldDef = {
  dt: 0.05,
  planetRadius: 100,
  planetSpin: 0.05,
  kepler: 0.5,
  atmosphereHeight: 30,
  inflow: 2,
  surfaceSlots: 8,
  shells: [
    { radius: 160, slots: 4 },
    { radius: 230, slots: 6 },
    { radius: 310, slots: 8 },
  ],
  spawnRadius: 420,
  refMass: 10,
  burnMass: 0.5,
  minFragmentMass: 1,
  vaporYield: 0.5,
  highOrbitYield: 0.5,
};

export const firstLevel: LevelDef = {
  world: baseWorld,
  start: { minerals: 220, population: 100, techs: [] },
  waveDelay: 20,
  earlyCallBonus: 1,
  refund: 0.5,
  waves: [
    { reward: 60, spawns: [{ at: 0, kind: 'rock', mass: 6, count: 4, interval: 8 }] },
    {
      reward: 80,
      spawns: [
        { at: 0, kind: 'rock', mass: 10, count: 4, interval: 7 },
        { at: 10, kind: 'ice', mass: 12, count: 2, interval: 10 },
      ],
    },
    {
      reward: 100,
      spawns: [
        { at: 0, kind: 'iron', mass: 8, count: 3, interval: 10 },
        { at: 5, kind: 'rock', mass: 12, count: 4, interval: 6, direction: -1 },
      ],
    },
    {
      reward: 120,
      spawns: [
        { at: 0, kind: 'ice', mass: 20, count: 3, interval: 6 },
        { at: 8, kind: 'iron', mass: 12, count: 4, interval: 8 },
      ],
    },
    {
      reward: 200,
      spawns: [
        { at: 0, kind: 'rock', mass: 40 },
        { at: 6, kind: 'iron', mass: 16, count: 4, interval: 6, direction: -1 },
        { at: 12, kind: 'rock', mass: 10, count: 6, interval: 3 },
      ],
    },
  ],
};
