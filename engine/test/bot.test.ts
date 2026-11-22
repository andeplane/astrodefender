import { describe, expect, it } from 'vitest';
import { Game, baseContent, baseWorld, firstLevel, greedyPolicy, idlePolicy, runGame } from '../src/index';
import { RESERVES, level, must, newGame, surface } from './helpers';

const MAX_TICKS = 80_000;
const researcher = () => greedyPolicy(['laser', 'railgun', 'rocketBattery', 'cannon'], 1);

describe('determinism', () => {
  it('plays the same game twice from the same seed and commands', () => {
    const a = new Game(baseContent, firstLevel, 11);
    const b = new Game(baseContent, firstLevel, 11);
    runGame(a, greedyPolicy(['laser', 'cannon', 'railgun']), 3000);
    runGame(b, greedyPolicy(['laser', 'cannon', 'railgun']), 3000);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));

    const other = new Game(baseContent, firstLevel, 12);
    runGame(other, greedyPolicy(['laser', 'cannon', 'railgun']), 3000);
    expect(JSON.stringify(other.state)).not.toBe(JSON.stringify(a.state));
  });

  it('continues identically from a saved state, without touching the save', () => {
    const policy = greedyPolicy(['laser', 'cannon', 'railgun']);
    const straight = new Game(baseContent, firstLevel, 5);
    runGame(straight, policy, 2000);
    const save = JSON.parse(JSON.stringify(straight.state)) as typeof straight.state;
    const frozen = JSON.stringify(save);

    const resumed = Game.restore(baseContent, firstLevel, save);
    runGame(straight, policy, 4000);
    runGame(resumed, policy, 4000);
    expect(JSON.stringify(resumed.state)).toBe(JSON.stringify(straight.state));
    expect(JSON.stringify(save)).toBe(frozen);
  });
});

describe('first level', () => {
  it('is lost by a player who does nothing', () => {
    const result = runGame(new Game(baseContent, firstLevel, 1), idlePolicy, MAX_TICKS);
    expect(result.status).toBe('lost');
    expect(result.stats.impacts).toBeGreaterThan(0);
  });

  it('is won by the baseline player who researches, on every seed tried', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const game = new Game(baseContent, firstLevel, seed);
      const result = runGame(game, researcher(), MAX_TICKS);
      expect(result.status).toBe('won');
      expect(result.stats.destroyed).toBeGreaterThan(20);
      expect(result.ticks).toBeLessThan(MAX_TICKS);
      expect(game.state.techs.length).toBeGreaterThan(5);
    }
  });

  it('rewards research: the opening weapons alone do worse', () => {
    const population = (policy: () => ReturnType<typeof greedyPolicy>): number => {
      let total = 0;
      for (let seed = 1; seed <= 4; seed++) {
        total += runGame(new Game(baseContent, firstLevel, seed), policy(), MAX_TICKS).population;
      }
      return total;
    };
    const researched = population(researcher);
    expect(researched).toBeGreaterThan(population(() => greedyPolicy(['cannon'])) + 40);
    expect(researched).toBeGreaterThan(population(() => greedyPolicy(['laser', 'cannon'])) + 40);
  });
});

describe('greedy player', () => {
  it('researches when it can afford to and builds power before weapons', () => {
    const game = newGame({
      start: { minerals: 10_000, population: 100, techs: [], structures: ['laser'], reserves: { coal: 100 } },
    });
    game.state.science = 30;
    const policy = greedyPolicy(['laser']);
    expect(policy(game)).toEqual([{ type: 'research', tech: 'photovoltaics' }]);
    game.state.science = 0;
    game.state.unlocked.push('coalPlant', 'fusionPlant');
    const [first] = policy(game);
    // Fusion is the better plant on paper, but there is nothing to burn in it.
    expect(first).toMatchObject({ type: 'build', structure: 'coalPlant' });
    game.apply(first);
    expect(policy(game)[0]).toMatchObject({ type: 'build', structure: 'laser' });
  });

  it('builds the labs it was asked for once it has a weapon', () => {
    const game = newGame();
    const policy = greedyPolicy(['laser'], 1);
    const built: string[] = [];
    for (let i = 0; i < 6; i++) {
      for (const command of policy(game)) {
        must(game, command);
        if (command.type === 'build') built.push(command.structure);
      }
    }
    expect(built.indexOf('lab')).toBeGreaterThan(built.indexOf('laser'));
    expect(built.filter((id) => id === 'lab')).toHaveLength(1);
  });

  it('acts only every twentieth tick and waits when it cannot afford anything', () => {
    const game = newGame();
    game.tick();
    expect(greedyPolicy(['laser'])(game)).toEqual([]);

    const broke = newGame({ start: { minerals: 0, population: 100, techs: [] } });
    expect(greedyPolicy(['laser'])(broke)).toEqual([]);
  });

  it('stalls when it needs power and the surface is full', () => {
    const game = new Game(baseContent, level(), 1);
    const policy = greedyPolicy(['laser']);
    for (let i = 0; i < 60; i++) for (const command of policy(game)) game.apply(command);
    expect(game.freeSites('surface')).toHaveLength(0);
    expect(game.freeSites('shell').length).toBeLessThan(18);
    expect(policy(game)).toEqual([]);
  });

  it('skips weapons it has not unlocked, and waits when it has none', () => {
    const start = {
      minerals: 1000,
      population: 100,
      techs: [],
      structures: ['coalPlant', 'laser'],
      reserves: RESERVES,
    };
    const game = newGame({ start });
    must(game, { type: 'build', structure: 'coalPlant', site: surface(0) });
    expect(greedyPolicy(['railgun', 'laser'])(game)[0]).toMatchObject({ type: 'build', structure: 'laser' });
    expect(greedyPolicy(['railgun'])(game)).toEqual([]);
  });

  it('only builds a structure where its feature is', () => {
    const world = { ...baseWorld, surfaceFeatures: { water: [5] } };
    const start = { minerals: 1000, population: 100, techs: [], structures: ['dam', 'laser'] };
    const game = newGame({ world, start });
    expect(greedyPolicy(['laser'])(game)).toEqual([{ type: 'build', structure: 'dam', site: surface(5) }]);
    const dry = newGame({ start });
    expect(greedyPolicy(['laser'])(dry)).toEqual([]);
  });

  it('takes the cards the level deals', () => {
    const game = new Game(baseContent, firstLevel, 3);
    expect(game.state.offer).toHaveLength(3);
    game.state.science = 1000;
    const [command] = greedyPolicy(['laser'])(game);
    expect(command).toEqual({ type: 'research', tech: game.state.offer[0] });
  });
});
