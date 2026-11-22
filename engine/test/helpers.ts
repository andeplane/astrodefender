import { Game, baseContent, baseWorld } from '../src/index';
import type { Asteroid, Command, Content, GameEvent, LevelDef, Site, TechDef, WaveDef } from '../src/index';

export const surface = (slot: number): Site => ({ kind: 'surface', slot });
export const shell = (index: number, slot: number): Site => ({ kind: 'shell', shell: index, slot });

/**
 * A small tree for engine tests, so they exercise the research mechanics without depending on
 * what the real tree in `src/tree/core.ts` happens to contain.
 */
const techs: TechDef[] = [
  { id: 'photovoltaics', cost: { science: 20 }, effects: [{ type: 'unlock', structure: 'solarFarm' }] },
  {
    id: 'fission',
    cost: { science: 80, minerals: 40 },
    requires: ['photovoltaics'],
    effects: [{ type: 'unlock', structure: 'fissionPlant' }],
  },
  {
    id: 'tracking',
    cost: { science: 10 },
    effects: [{ type: 'modify', structure: 'solarFarm', stat: 'generator.source', op: 'set', value: 'daylight' }],
  },
  {
    id: 'boilers',
    cost: { science: 10 },
    effects: [{ type: 'modify', structure: 'coalPlant', stat: 'generator.throttled', op: 'set', value: true }],
  },
  {
    id: 'heavyRounds',
    cost: { science: 10 },
    exclusive: 'rounds',
    effects: [
      { type: 'modify', structure: 'railgun', stat: 'weapon.hit', op: 'mul', value: 2 },
      { type: 'modify', structure: 'railgun', stat: 'cost', op: 'add', value: 20 },
    ],
  },
  {
    id: 'lightRounds',
    cost: { science: 10 },
    exclusive: 'rounds',
    effects: [{ type: 'modify', structure: 'railgun', stat: 'weapon.energyPerShot', op: 'mul', value: 0.5 }],
  },
  {
    id: 'pad',
    cost: { science: 10, minerals: 4 },
    repeat: { growth: 2 },
    effects: [{ type: 'slots', shell: 0, count: 1 }],
  },
  { id: 'farShell', cost: { science: 10 }, effects: [{ type: 'slots', shell: 7, count: 1 }] },
  { id: 'drilling', cost: { science: 10 }, effects: [{ type: 'reserve', reserve: 'coal', amount: 50 }] },
];

export const testContent: Content = {
  ...baseContent,
  techs: Object.fromEntries(techs.map((tech) => [tech.id, tech])),
};

/** Enough fuel that no test runs out by accident. */
export const RESERVES = { coal: 1e6, oil: 1e6, uranium: 1e6 };

/** A level with plenty of money and a long build phase, so a test controls what happens. */
export function level(overrides: Partial<LevelDef> = {}, waves: WaveDef[] = [{ reward: 10, spawns: [] }]): LevelDef {
  return {
    world: baseWorld,
    start: { minerals: 10_000, population: 100, techs: [], reserves: RESERVES },
    waveDelay: 10_000,
    earlyCallBonus: 1,
    refund: 0.5,
    waves,
    ...overrides,
  };
}

export function newGame(overrides: Partial<LevelDef> = {}, waves?: WaveDef[]): Game {
  return new Game(testContent, level(overrides, waves), 7);
}

export function must(game: Game, command: Command): void {
  const result = game.apply(command);
  if (!result.ok) throw new Error(`${command.type} failed: ${result.error}`);
}

export function errorOf(game: Game, command: Command): string | undefined {
  const result = game.apply(command);
  return result.ok ? undefined : result.error;
}

/** Put a body straight into the world, bypassing waves. */
export function place(game: Game, body: Partial<Asteroid> & { kind: string; mass: number; r: number }): Asteroid {
  const asteroid: Asteroid = {
    id: game.state.nextId++,
    hp: body.mass * game.content.asteroids[body.kind].toughness,
    theta: 0,
    direction: 1,
    pending: 0,
    lastHit: null,
    ...body,
  };
  game.state.asteroids.push(asteroid);
  return asteroid;
}

export function run(game: Game, ticks: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.tick());
  return events;
}

export function ofType<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}
