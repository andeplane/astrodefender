import { coreTechs } from './tree/core';
import type { Content, LevelDef, WorldDef } from './types';

/**
 * First-pass content. Every number here is a starting point to be tuned with the bot in
 * `bot.ts`. The techs come from `tree/core.ts`; what they unlock and change is defined here.
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
      fuel: { reserve: 'fusionFuel', perMass: 1 },
    },
  },
  structures: {
    coalPlant: {
      id: 'coalPlant',
      cost: 40,
      sites: ['surface'],
      generator: { output: 20, source: 'constant', fuel: { reserve: 'coal', rate: 1 }, throttled: false },
    },
    oilPlant: {
      id: 'oilPlant',
      cost: 60,
      sites: ['surface'],
      generator: { output: 40, source: 'constant', fuel: { reserve: 'oil', rate: 2 }, throttled: false },
    },
    dam: {
      id: 'dam',
      cost: 80,
      sites: ['surface'],
      feature: 'water',
      generator: { output: 30, source: 'constant', throttled: false },
      battery: { capacity: 0 },
    },
    solarFarm: {
      id: 'solarFarm',
      cost: 50,
      sites: ['surface'],
      generator: { output: 60, source: 'solar', throttled: false },
    },
    fissionPlant: {
      id: 'fissionPlant',
      cost: 200,
      sites: ['surface'],
      generator: { output: 120, source: 'constant', fuel: { reserve: 'uranium', rate: 1 }, throttled: false },
    },
    orbitalReactor: {
      id: 'orbitalReactor',
      cost: 200,
      sites: ['shell'],
      generator: { output: 60, source: 'constant', fuel: { reserve: 'uranium', rate: 1 }, throttled: false },
    },
    fusionPlant: {
      id: 'fusionPlant',
      cost: 400,
      sites: ['surface'],
      generator: { output: 300, source: 'constant', fuel: { reserve: 'fusionFuel', rate: 1 }, throttled: false },
    },
    orbitalSolar: {
      id: 'orbitalSolar',
      cost: 120,
      sites: ['shell'],
      generator: { output: 50, source: 'solar', throttled: false },
    },
    battery: { id: 'battery', cost: 30, sites: ['surface', 'shell'], battery: { capacity: 600 } },
    laser: {
      id: 'laser',
      cost: 60,
      sites: ['surface', 'shell'],
      weapon: { type: 'beam', range: 160, dps: 12, damage: 'thermal', draw: 15 },
    },
    cannon: {
      id: 'cannon',
      cost: 50,
      sites: ['surface', 'shell'],
      weapon: {
        type: 'launcher',
        range: 150,
        hit: 16,
        damage: 'kinetic',
        draw: 5,
        energyPerShot: 10,
        ammo: 0,
        speed: 90,
        knockback: 4,
      },
    },
    rocketBattery: {
      id: 'rocketBattery',
      cost: 90,
      sites: ['surface'],
      weapon: {
        type: 'launcher',
        range: 320,
        hit: 120,
        damage: 'explosive',
        draw: 5,
        energyPerShot: 25,
        ammo: 5,
        speed: 70,
        knockback: 0,
      },
    },
    railgun: {
      id: 'railgun',
      cost: 80,
      sites: ['surface'],
      weapon: {
        type: 'launcher',
        range: 260,
        hit: 60,
        damage: 'kinetic',
        draw: 12,
        energyPerShot: 60,
        ammo: 0,
        speed: 120,
        knockback: 15,
      },
    },
    relativityField: {
      id: 'relativityField',
      cost: 150,
      sites: ['shell'],
      field: { radius: 90, slow: 0.6, draw: 30 },
    },
    lab: { id: 'lab', cost: 70, sites: ['surface'], lab: { science: 1, draw: 10 } },
  },
  techs: coreTechs,
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

/** A ground level: two water slots, orbit closed, and a hand of three cards from the early techs. */
export const firstLevel: LevelDef = {
  world: {
    ...baseWorld,
    surfaceFeatures: { water: [2, 6] },
    shells: baseWorld.shells.map((shell) => ({ ...shell, open: 0 })),
  },
  start: {
    minerals: 220,
    population: 100,
    techs: [],
    structures: ['coalPlant', 'laser', 'cannon', 'lab', 'battery'],
    reserves: { coal: 6000, oil: 1500 },
  },
  research: {
    pool: ['coal2', 'oil1', 'water1', 'solar1', 'rocketry', 'railgun', 'water2', 'solar2', 'interceptors'],
    choices: 3,
  },
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
    // From here the opening weapons are not enough for every slot: the level asks for research.
    {
      reward: 220,
      spawns: [
        { at: 0, kind: 'iron', mass: 14, count: 5, interval: 5 },
        { at: 10, kind: 'ice', mass: 17, count: 4, interval: 4, direction: -1 },
      ],
    },
    {
      reward: 260,
      spawns: [
        { at: 0, kind: 'rock', mass: 42, count: 2, interval: 12 },
        { at: 6, kind: 'iron', mass: 17, count: 5, interval: 5, direction: -1 },
        { at: 20, kind: 'rock', mass: 8, count: 8, interval: 2 },
      ],
    },
    {
      reward: 400,
      spawns: [
        { at: 0, kind: 'iron', mass: 63 },
        { at: 4, kind: 'rock', mass: 21, count: 5, interval: 5, direction: -1 },
        { at: 12, kind: 'ice', mass: 21, count: 5, interval: 4 },
        { at: 24, kind: 'iron', mass: 14, count: 6, interval: 3 },
      ],
    },
  ],
};
