import { Game, baseContent, baseWorld } from '../src/index';
import type { Asteroid, Command, GameEvent, LevelDef, Site, WaveDef } from '../src/index';

export const surface = (slot: number): Site => ({ kind: 'surface', slot });
export const shell = (index: number, slot: number): Site => ({ kind: 'shell', shell: index, slot });

/** A level with plenty of money and a long build phase, so a test controls what happens. */
export function level(overrides: Partial<LevelDef> = {}, waves: WaveDef[] = [{ reward: 10, spawns: [] }]): LevelDef {
  return {
    world: baseWorld,
    start: { minerals: 10_000, population: 100, techs: [] },
    waveDelay: 10_000,
    earlyCallBonus: 1,
    refund: 0.5,
    waves,
    ...overrides,
  };
}

export function newGame(overrides: Partial<LevelDef> = {}, waves?: WaveDef[]): Game {
  return new Game(baseContent, level(overrides, waves), 7);
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
