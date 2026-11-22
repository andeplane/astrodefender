import { describe, expect, it } from 'vitest';
import { Game, baseContent, firstLevel, greedyPolicy, idlePolicy, runGame } from '../src/index';
import { level, newGame } from './helpers';

const MAX_TICKS = 40_000;

describe('determinism', () => {
  it('plays the same game twice from the same seed and commands', () => {
    const a = new Game(baseContent, firstLevel, 11);
    const b = new Game(baseContent, firstLevel, 11);
    runGame(a, greedyPolicy(['laser', 'railgun']), 3000);
    runGame(b, greedyPolicy(['laser', 'railgun']), 3000);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));

    const other = new Game(baseContent, firstLevel, 12);
    runGame(other, greedyPolicy(['laser', 'railgun']), 3000);
    expect(JSON.stringify(other.state)).not.toBe(JSON.stringify(a.state));
  });

  it('continues identically from a saved state, without touching the save', () => {
    const policy = greedyPolicy(['laser', 'railgun']);
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

  it('is won by the baseline player on every seed tried', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const result = runGame(new Game(baseContent, firstLevel, seed), greedyPolicy(['laser', 'railgun']), MAX_TICKS);
      expect(result.status).toBe('won');
      expect(result.stats.destroyed).toBeGreaterThan(20);
      expect(result.ticks).toBeLessThan(MAX_TICKS);
    }
  });
});

describe('greedy player', () => {
  it('researches when it can afford to and builds power before weapons', () => {
    const game = newGame();
    game.state.science = 30;
    const policy = greedyPolicy(['laser']);
    expect(policy(game)).toEqual([{ type: 'research', tech: 'photovoltaics' }]);
    game.state.techs.push('photovoltaics');
    game.state.science = 0;
    const [first] = policy(game);
    expect(first).toMatchObject({ type: 'build', structure: 'coalPlant' });
    game.apply(first);
    expect(policy(game)[0]).toMatchObject({ type: 'build', structure: 'laser' });
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
});
