import type { Cost, Effect, TechDef } from '../types';

/**
 * The core tech tree, as data. Nothing in the engine names a tech: every card here is a cost,
 * its prerequisites and a list of engine effects (`unlock`, `modify`, `slots`, `reserve`), so the
 * tree can be reshaped in this file alone. The structures the cards refer to live in
 * `content.ts`.
 *
 * A card with `todo` waits on a mechanic the engine does not have yet. With no effects it does
 * nothing when taken, so levels keep it out of their pool until the mechanic exists.
 */
export type Line = 'energy' | 'weapons' | 'economy' | 'sight' | 'orbit' | 'compute';
export type Era = 'ground' | 'firstOrbit' | 'orbitalIndustry' | 'exoticPhysics';

export interface TechCard extends TechDef {
  name: string;
  line: Line;
  era: Era;
  /** What the card says it does. */
  text: string;
  /** The part of the card the engine cannot do yet. */
  todo?: string;
}

interface CardOptions {
  requires?: string[];
  exclusive?: string;
  repeat?: { growth: number };
  effects?: Effect[];
  todo?: string;
}

const cards: TechCard[] = [];

function card(id: string, name: string, line: Line, era: Era, cost: Cost, text: string, options: CardOptions): void {
  cards.push({ id, name, line, era, cost, text, effects: [], ...options });
}

const unlock = (structure: string): Effect => ({ type: 'unlock', structure });
const set = (structure: string, stat: string, value: number | boolean | string): Effect => ({
  type: 'modify',
  structure,
  stat,
  op: 'set',
  value,
});
const add = (structure: string, stat: string, value: number): Effect => ({
  type: 'modify',
  structure,
  stat,
  op: 'add',
  value,
});
const mul = (structure: string, stat: string, value: number): Effect => ({
  type: 'modify',
  structure,
  stat,
  op: 'mul',
  value,
});
const slots = (shell: number, count: number): Effect => ({ type: 'slots', shell, count });

// Era 1: Ground

card(
  'coal2',
  'Throttled Boilers',
  'energy',
  'ground',
  { science: 30 },
  'Coal plants follow demand and burn only what the grid uses.',
  {
    effects: [set('coalPlant', 'generator.throttled', true)],
    todo: 'A few seconds of ramp-up, so spikes brown out without batteries.',
  },
);
card(
  'oil1',
  'Oil Wells',
  'energy',
  'ground',
  { science: 30 },
  'Oil plants give twice a coal plant’s power and burn the small oil reserve.',
  {
    effects: [unlock('oilPlant')],
  },
);
card(
  'water1',
  'Hydro Dams',
  'energy',
  'ground',
  { science: 25 },
  'Dams give free constant power, but only on the level’s water slots.',
  {
    effects: [unlock('dam')],
  },
);
card(
  'solar1',
  'Photovoltaics',
  'energy',
  'ground',
  { science: 20 },
  'Solar farms give free power that peaks at noon and is zero at night.',
  {
    effects: [unlock('solarFarm')],
  },
);
card(
  'rocketry',
  'Rocketry',
  'weapons',
  'ground',
  { science: 40 },
  'Rocket batteries: a long-range explosive weapon. Each shot costs Materials.',
  {
    effects: [unlock('rocketBattery')],
  },
);
card(
  'salvage',
  'Debris Recovery',
  'economy',
  'ground',
  { science: 30 },
  'Fragments that burn up over a salvage yard pay Materials instead of being lost.',
  {
    todo: 'Salvage yards: a structure that collects what burns up in its part of the sky.',
  },
);
card(
  'optics',
  'Telescopes',
  'sight',
  'ground',
  { science: 25 },
  'Observatories preview the next wave and give weapons in the two neighbouring slots more range.',
  {
    todo: 'Wave preview and bonuses to neighbouring slots.',
  },
);
card(
  'flakShells',
  'Flak Shells',
  'weapons',
  'ground',
  { science: 35 },
  'Cannon shots burst in an area and shatter bodies into more, smaller fragments.',
  {
    exclusive: 'B',
    todo: 'Area damage and a fragment count set by the weapon.',
  },
);
card(
  'railgun',
  'Railgun',
  'weapons',
  'ground',
  { science: 35 },
  'Adds the railgun: a long-range surface gun with heavy knockback that charges from the grid.',
  {
    exclusive: 'B',
    effects: [unlock('railgun')],
  },
);
card(
  'coal3',
  'Co-Firing',
  'energy',
  'ground',
  { science: 45 },
  'When the coal reserve is gone, coal plants keep running at half power by burning Materials.',
  {
    requires: ['coal2'],
    todo: 'A fallback fuel for generators.',
  },
);
card(
  'oil2',
  'Afterburners',
  'energy',
  'ground',
  { science: 45 },
  'Tap an oil plant to double its output for a few seconds at triple burn.',
  {
    requires: ['oil1'],
    todo: 'A timed overdrive command on a structure.',
  },
);
card('water2', 'Pumped Storage', 'energy', 'ground', { science: 45 }, 'Each dam also works as a very large battery.', {
  requires: ['water1'],
  effects: [add('dam', 'battery.capacity', 1500)],
});
card(
  'solar2',
  'Tracking Panels',
  'energy',
  'ground',
  { science: 40 },
  'Solar farms give full power from sunrise to sunset instead of peaking at noon.',
  {
    requires: ['solar1'],
    effects: [set('solarFarm', 'generator.source', 'daylight')],
  },
);
card(
  'prospecting',
  'Prospecting',
  'economy',
  'ground',
  { science: 40 },
  'Reveals a hidden deposit of coal, oil or uranium. A mine on that slot adds it to the reserve.',
  {
    todo: 'Hidden deposit slots and a mine that adds to a reserve when built.',
  },
);
card(
  'beamSplitter',
  'Piercing Beam',
  'weapons',
  'ground',
  { science: 40 },
  'A laser beam passes through its target and hits everything behind it in a line.',
  {
    exclusive: 'A',
    todo: 'Beams that hit every body along their line.',
  },
);
card(
  'pulseCompression',
  'Pulse Laser',
  'weapons',
  'ground',
  { science: 40 },
  'Lasers store energy and fire short bursts that crack iron and knock bodies back.',
  {
    exclusive: 'A',
    todo: 'Burst fire for beams, with knockback and spiked draw.',
  },
);
card(
  'oil3',
  'Peaker Automation',
  'energy',
  'ground',
  { science: 60 },
  'Oil plants start by themselves the moment the grid would brown out, and stop when it recovers.',
  {
    requires: ['oil2'],
    todo: 'Generators that only run when the grid is short.',
  },
);
card(
  'water3',
  'Ice Catchment',
  'energy',
  'ground',
  { science: 60 },
  'Ice that burns up in the sky above a dam doubles its output for the rest of the wave.',
  {
    requires: ['water2'],
    todo: 'Burn-ups over a slot boosting the structure on it.',
  },
);
card(
  'nuclear1',
  'Fission',
  'energy',
  'ground',
  { science: 90, minerals: 40 },
  'Fission plants give huge constant power and burn the uranium reserve.',
  {
    effects: [unlock('fissionPlant')],
    todo: 'A full wave of start-up time.',
  },
);

// Era 2: First Orbit

card(
  'thickAtmosphere',
  'Atmosphere Processor',
  'weapons',
  'firstOrbit',
  { science: 100, minerals: 50 },
  'Raises the atmosphere while switched on. Debris burns up higher; surface lasers lose range.',
  {
    exclusive: 'D',
    todo: 'Structures that change the world while powered.',
  },
);
card(
  'magnetosphere',
  'Magnetosphere',
  'weapons',
  'firstOrbit',
  { science: 100, minerals: 60 },
  'Pulls all bodies toward the two poles while switched on; iron most of all.',
  {
    exclusive: 'D',
    todo: 'Structures that change the world while powered.',
  },
);
card(
  'firstLaunch',
  'First Launch',
  'orbit',
  'firstOrbit',
  { science: 80, minerals: 40 },
  'One orbital slot in the lowest shell.',
  {
    effects: [slots(0, 1)],
    todo: 'Telescope satellites, a launch cost on orbital builds, and a separate orbital grid.',
  },
);
card(
  'computing',
  'Mainframes',
  'compute',
  'firstOrbit',
  { science: 120, minerals: 20 },
  'Ground data centres give compute for programs chosen before each wave. First program: Target Sharing.',
  {
    todo: 'Compute as a capacity, and programs.',
  },
);
card(
  'nuclear2',
  'Orbital Reactor',
  'energy',
  'firstOrbit',
  { science: 110, minerals: 40 },
  'Fission plants can be built in orbit at half power. They burn the same uranium reserve.',
  {
    requires: ['nuclear1', 'firstLaunch'],
    effects: [unlock('orbitalReactor')],
  },
);
card(
  'solar3',
  'Space Solar',
  'energy',
  'firstOrbit',
  { science: 70, minerals: 30 },
  'Orbital solar arrays give large power, except in the planet’s shadow.',
  {
    requires: ['solar2', 'firstLaunch'],
    effects: [unlock('orbitalSolar')],
  },
);
card(
  'orbitalMining',
  'Mining Tugs',
  'economy',
  'firstOrbit',
  { science: 100, minerals: 30 },
  'Tug satellites capture small fragments whole, for full Materials.',
  {
    requires: ['salvage', 'firstLaunch'],
    todo: 'Capturing bodies instead of destroying them.',
  },
);
card(
  'launchPad',
  'Launch Pad',
  'orbit',
  'firstOrbit',
  { science: 80, minerals: 40 },
  'One more orbital slot each time. The cost rises every time it is taken.',
  {
    requires: ['firstLaunch'],
    repeat: { growth: 1.5 },
    effects: [slots(0, 1)],
  },
);
card(
  'mirrors',
  'Relay Mirrors',
  'weapons',
  'firstOrbit',
  { science: 50, minerals: 10 },
  'A mirror satellite redirects one surface laser at anything it can see, at half strength.',
  {
    requires: ['firstLaunch'],
    todo: 'Beams relayed through another structure.',
  },
);
card(
  'interceptors',
  'Interceptors',
  'weapons',
  'firstOrbit',
  { science: 70, minerals: 30 },
  'Rocket batteries fire fast, cheap missiles with a smaller warhead.',
  {
    requires: ['rocketry'],
    exclusive: 'C',
    effects: [
      mul('rocketBattery', 'weapon.speed', 2),
      mul('rocketBattery', 'weapon.energyPerShot', 0.4),
      mul('rocketBattery', 'weapon.ammo', 0.4),
      mul('rocketBattery', 'weapon.hit', 0.5),
    ],
  },
);
card(
  'nuclearWarheads',
  'Nuclear Warheads',
  'weapons',
  'firstOrbit',
  { science: 70, minerals: 30 },
  'Each rocket battery can fire one nuke per wave, by hand. Each costs Materials and uranium.',
  {
    requires: ['rocketry'],
    exclusive: 'C',
    todo: 'Hand-fired shots with an area blast and a cost in a reserve.',
  },
);
card(
  'beamedPower',
  'Power Beam',
  'energy',
  'firstOrbit',
  { science: 100, minerals: 30 },
  'A ground station and a receiver satellite join the surface and orbital grids. Either end can be destroyed.',
  {
    requires: ['firstLaunch'],
    todo: 'Two grids and a link between them.',
  },
);

// Era 3: Orbital Industry

card(
  'gravimetry',
  'Gravimetry',
  'sight',
  'orbitalIndustry',
  { science: 150, minerals: 30 },
  'Gravimeter satellites show dark bodies. Dark bodies and alien wrecks now pay Exotics.',
  {
    requires: ['firstLaunch'],
    todo: 'Dark bodies, and Exotics as income.',
  },
);
card(
  'nuclear3',
  'Fusion',
  'energy',
  'orbitalIndustry',
  { science: 200, minerals: 80 },
  'Fusion plants give very large constant power and burn fuel won by destroying ice.',
  {
    requires: ['nuclear1'],
    effects: [unlock('fusionPlant')],
    todo: 'Only ice destroyed above the atmosphere should count.',
  },
);
card(
  'highOrbit',
  'Transfer Stage',
  'orbit',
  'orbitalIndustry',
  { science: 150, minerals: 60 },
  'Opens the second shell: slow slots with a wide view.',
  {
    requires: ['launchPad'],
    effects: [slots(1, 2)],
  },
);
card(
  'orbitalDataCentres',
  'Orbital Data Centres',
  'compute',
  'orbitalIndustry',
  { science: 130, minerals: 40 },
  'Twice the compute of the ground one, on orbital power.',
  {
    requires: ['computing', 'firstLaunch'],
    todo: 'Compute as a capacity, and programs.',
  },
);
card(
  'fireControl',
  'Yield Timing',
  'compute',
  'orbitalIndustry',
  { science: 100 },
  'Program. Weapons hold fire until a body is as low as is still safe, for more Materials.',
  {
    requires: ['computing'],
    todo: 'Compute as a capacity, and programs.',
  },
);
card(
  'simulationLabs',
  'Simulation Labs',
  'compute',
  'orbitalIndustry',
  { science: 110 },
  'Program. Compute you assign to it becomes science for that wave.',
  {
    requires: ['computing'],
    todo: 'Compute as a capacity, and programs.',
  },
);
card(
  'spaceElevator',
  'Space Elevator',
  'orbit',
  'orbitalIndustry',
  { science: 220, minerals: 150 },
  'A surface structure. While it stands, launch cost is halved and the third shell is open.',
  {
    requires: ['highOrbit'],
    todo: 'Effects that last only while a structure stands.',
  },
);

// Era 4: Exotic Physics

card(
  'relativityField',
  'Relativity Field',
  'weapons',
  'exoticPhysics',
  { science: 250, exotics: 20 },
  'Time runs slower for bodies inside the field generator’s zone.',
  {
    requires: ['gravimetry'],
    exclusive: 'E',
    effects: [unlock('relativityField')],
    todo: 'Burning Exotics while switched on.',
  },
);
card(
  'wormholes',
  'Wormhole Gate',
  'weapons',
  'exoticPhysics',
  { science: 250, exotics: 20 },
  'On command, sends one body into the sun. Each jump costs Exotics and a large burst of power.',
  {
    requires: ['gravimetry'],
    exclusive: 'E',
    todo: 'Hand-fired removal of one body.',
  },
);
card(
  'moonCapture',
  'Moonlet Capture',
  'weapons',
  'exoticPhysics',
  { science: 280, exotics: 30 },
  'A tractor parks one big body in an orbital slot as a moonlet that pays Materials and blocks impacts.',
  {
    requires: ['orbitalMining', 'gravimetry'],
    todo: 'Capturing bodies instead of destroying them.',
  },
);

export const coreTechs: Record<string, TechCard> = Object.fromEntries(cards.map((tech) => [tech.id, tech]));

/** The cards that already do something in the engine. */
export const playableTechs: string[] = cards.filter((tech) => tech.effects.length > 0).map((tech) => tech.id);
