import { Game, baseContent, firstLevel, type GameEvent } from '@engine';
import { describe, expect, it } from 'vitest';
import { createSession } from '../src/session';

const tickMs = firstLevel.world.dt * 1000;
const make = (seed = 7) => createSession({ content: baseContent, level: firstLevel, seed });

describe('session', () => {
  it('starts a game with the given seed, content and level', () => {
    const session = make(42);
    expect(session.seed).toBe(42);
    expect(session.content).toBe(baseContent);
    expect(session.level).toBe(firstLevel);
    expect(session.game.state.tick).toBe(0);
    expect(session.speed).toBe(1);
  });

  it('runs whole ticks and carries the remainder as alpha', () => {
    const session = make();
    session.advance(tickMs * 2.5);
    expect(session.game.state.tick).toBe(2);
    expect(session.alpha).toBeCloseTo(0.5);
    session.advance(tickMs * 0.5);
    expect(session.game.state.tick).toBe(3);
    expect(session.alpha).toBeCloseTo(0);
  });

  it('scales real time by speed and pauses at 0', () => {
    const session = make();
    session.speed = 4;
    session.advance(tickMs);
    expect(session.game.state.tick).toBe(4);
    session.speed = 0;
    session.advance(1000);
    expect(session.game.state.tick).toBe(4);
  });

  it('ignores negative time', () => {
    const session = make();
    session.advance(-1000);
    session.advance(tickMs);
    expect(session.game.state.tick).toBe(1);
  });

  it('caps catch-up to about 250 ms of real time and drops the backlog', () => {
    const session = make();
    session.advance(60_000);
    expect(session.game.state.tick).toBe(250 / tickMs);
    expect(session.alpha).toBeLessThan(1);
    session.advance(0);
    expect(session.game.state.tick).toBe(250 / tickMs);

    const fast = make();
    fast.speed = 2;
    fast.advance(60_000);
    expect(fast.game.state.tick).toBe((250 * 2) / tickMs);
  });

  it('stops ticking once the game is over', () => {
    const session = make();
    session.game.state.population = 0;
    session.game.state.status = 'lost';
    expect(session.advance(1000)).toEqual([]);
    expect(session.game.state.tick).toBe(0);
    expect(session.alpha).toBe(0);
  });

  it('stops mid-advance when a tick ends the game', () => {
    const session = make();
    const game = session.game;
    const tick = game.tick.bind(game);
    // Swapping one instance method on the test's own game, not a module or global.
    game.tick = (): GameEvent[] => {
      const events = tick();
      game.state.status = 'won';
      return [...events, { type: 'ended', status: 'won' }];
    };
    const events = session.advance(tickMs * 5);
    expect(game.state.tick).toBe(1);
    expect(events).toContainEqual({ type: 'ended', status: 'won' });
    expect(session.alpha).toBe(0);
  });

  it('forwards commands to the game', () => {
    const session = make();
    expect(session.send({ type: 'research', tech: 'nope' })).toEqual({ ok: false, error: 'unknown-tech' });
    expect(session.send({ type: 'build', structure: 'laser', site: { kind: 'surface', slot: 0 } })).toEqual({
      ok: true,
    });
    expect(session.game.state.structures).toHaveLength(1);
  });

  it('restarts with the next seed by default, or the given one', () => {
    const session = make(10);
    session.advance(tickMs * 3.5);
    const old = session.game;
    session.restart();
    expect(session.game).not.toBe(old);
    expect(session.seed).toBe(11);
    expect(session.game.state.tick).toBe(0);
    expect(session.alpha).toBe(0);
    session.restart(99);
    expect(session.seed).toBe(99);
    expect(session.game.state).toEqual(new Game(baseContent, firstLevel, 99).state);
    session.restart(2 ** 31 - 1);
    session.restart();
    expect(session.seed).toBe(0);
  });
});

describe('session integration', () => {
  it('plays the first level: builds, waits out the build phase and sees an asteroid', () => {
    const session = make(3);
    const minerals = session.game.state.minerals;
    expect(session.send({ type: 'build', structure: 'coalPlant', site: { kind: 'surface', slot: 0 } }).ok).toBe(true);
    expect(session.send({ type: 'build', structure: 'laser', site: { kind: 'surface', slot: 4 } }).ok).toBe(true);
    expect(session.game.state.minerals).toBeLessThan(minerals);

    const events: GameEvent[] = [];
    // 60 fps frames for a little longer than the wave delay.
    const frames = Math.ceil(((firstLevel.waveDelay + 1) * 1000) / 16);
    for (let i = 0; i < frames; i++) events.push(...session.advance(16));

    expect(session.game.state.tick).toBeGreaterThanOrEqual(firstLevel.waveDelay / firstLevel.world.dt);
    expect(events).toContainEqual({ type: 'waveStarted', wave: 0, bonus: 0 });
    expect(events.some((event) => event.type === 'spawned')).toBe(true);
    expect(session.game.state.wave.active).toBe(true);
    expect(session.game.state.status).toBe('playing');
  });

  it('calls a wave early with startWave', () => {
    const session = make(3);
    expect(session.send({ type: 'startWave' }).ok).toBe(true);
    const events = session.advance(tickMs);
    expect(events.some((event) => event.type === 'spawned')).toBe(true);
  });
});
