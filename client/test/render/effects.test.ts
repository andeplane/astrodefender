import type { Asteroid, Game, Projectile } from '@engine';
import { describe, expect, it } from 'vitest';
import { Effects, LIFETIME, type Shot, type TimedEffect, age, progress } from '../../src/render/effects';
import { asteroidColors, damageColors, palette } from '../../src/theme';
import { newGame, tickUntil } from './fakes';

function rock(game: Game, r: number, theta: number, kind = 'rock'): Asteroid {
  const asteroid: Asteroid = {
    id: game.state.nextId++,
    kind,
    mass: 8,
    hp: 80,
    r,
    theta,
    direction: 1,
    pending: 0,
    lastHit: null,
  };
  game.state.asteroids.push(asteroid);
  return asteroid;
}

function shell(target: number, ticksLeft: number): Projectile {
  return { target, ticksLeft, hit: 1, damage: 'kinetic', knockback: 0 };
}

/** Remembers the body on one frame, then drops it from the state as the engine would. */
function seenThenGone(game: Game, effects: Effects, asteroid: Asteroid): void {
  effects.update(game, [], 0, 0);
  game.state.asteroids = game.state.asteroids.filter((a) => a.id !== asteroid.id);
}

describe('timing helpers', () => {
  it('ages timed effects from 0 to 1 over their lifetime', () => {
    const burst: TimedEffect = { kind: 'burst', at: { x: 0, y: 0 }, born: 1000, color: '#fff', mass: 1 };
    expect(age(burst, 900)).toBe(0);
    expect(age(burst, 1000 + LIFETIME.burst / 2)).toBe(0.5);
    expect(age(burst, 99999)).toBe(1);
  });

  it('measures shot progress in ticks', () => {
    const shot: Shot = {
      kind: 'shot',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      target: 1,
      color: '#fff',
      endTick: 20,
      flight: 10,
    };
    expect(progress(shot, 5)).toBe(0);
    expect(progress(shot, 15)).toBe(0.5);
    expect(progress(shot, 25)).toBe(1);
  });
});

describe('Effects', () => {
  it('bursts and floats the minerals where a destroyed body was last seen', () => {
    const game = newGame();
    const effects = new Effects();
    const body = rock(game, 200, 0);
    seenThenGone(game, effects, body);
    effects.update(game, [{ type: 'destroyed', id: body.id, minerals: 4.25, fragments: 0 }], 10, 0);
    expect(effects.list).toEqual([
      { kind: 'burst', at: { x: 200, y: 0 }, born: 10, color: asteroidColors.rock, mass: 8 },
      { kind: 'text', at: { x: 200, y: 0 }, born: 10, text: '+4.3', color: palette.minerals },
    ]);
  });

  it('skips a payout too small to read and colours unknown kinds plainly', () => {
    const game = newGame();
    const effects = new Effects();
    const body = rock(game, 200, 0, 'mystery');
    seenThenGone(game, effects, body);
    effects.update(game, [{ type: 'destroyed', id: body.id, minerals: 0.01, fragments: 0 }], 0, 0);
    expect(effects.list).toHaveLength(1);
    expect(effects.list[0]).toMatchObject({ kind: 'burst', color: palette.text });
  });

  it('fizzles burnt bodies and flashes impacts on the ground under the body', () => {
    const game = newGame();
    const effects = new Effects();
    const burnt = rock(game, 130, 0);
    const hit = rock(game, 101, Math.PI / 2);
    effects.update(game, [], 0, 0);
    game.state.asteroids = [];
    effects.update(
      game,
      [
        { type: 'burnt', id: burnt.id },
        { type: 'impact', id: hit.id, population: 12.4 },
      ],
      0,
      0,
    );
    const [fizzle, flash, text] = effects.list;
    expect(fizzle).toMatchObject({ kind: 'fizzle', at: { x: 130, y: 0 } });
    expect(flash.kind).toBe('flash');
    if (flash.kind !== 'flash' || text.kind !== 'text') throw new Error('wrong effects');
    expect(flash.at.x).toBeCloseTo(0);
    expect(flash.at.y).toBeCloseTo(100);
    expect(text.text).toBe('-12');
    expect(text.color).toBe(palette.bad);
  });

  it('puts an impact at the planet even for a body last seen at the centre', () => {
    const game = newGame();
    const effects = new Effects();
    const body = rock(game, 0, 0);
    seenThenGone(game, effects, body);
    effects.update(game, [{ type: 'impact', id: body.id, population: 1 }], 0, 0);
    expect(effects.list[0]).toMatchObject({ kind: 'flash', at: { x: 0, y: 0 } });
  });

  it('ignores events about bodies it never saw, and events it has no effect for', () => {
    const game = newGame();
    const effects = new Effects();
    effects.update(
      game,
      [
        { type: 'destroyed', id: 99, minerals: 3, fragments: 0 },
        { type: 'burnt', id: 99 },
        { type: 'impact', id: 99, population: 3 },
        { type: 'fired', structure: 99, target: 99 },
        { type: 'spawned', id: 99, kind: 'rock' },
        { type: 'waveStarted', wave: 0, bonus: 0 },
      ],
      0,
      0,
    );
    expect(effects.list).toEqual([]);
  });

  it('drops timed effects once their lifetime is over', () => {
    const game = newGame();
    const effects = new Effects();
    const body = rock(game, 200, 0);
    seenThenGone(game, effects, body);
    effects.update(game, [{ type: 'burnt', id: body.id }], 0, 0);
    effects.update(game, [], LIFETIME.fizzle - 1, 0);
    expect(effects.list).toHaveLength(1);
    effects.update(game, [], LIFETIME.fizzle, 0);
    expect(effects.list).toHaveLength(0);
  });

  it('flies a launcher shot from the structure to its target and lands it on the right tick', () => {
    const game = newGame();
    const effects = new Effects();
    expect(game.apply({ type: 'build', structure: 'cannon', site: { kind: 'surface', slot: 0 } })).toEqual({
      ok: true,
    });
    const cannon = game.state.structures[0];
    const body = rock(game, 190, 0);
    game.state.projectiles.push(shell(body.id, 3), shell(body.id, 8));
    effects.update(game, [{ type: 'fired', structure: cannon.id, target: body.id }], 0, 0);
    expect(effects.list).toHaveLength(1);
    const shot = effects.list[0];
    if (shot.kind !== 'shot') throw new Error('expected a shot');
    expect(shot.from).toEqual(game.sitePosition(cannon.site, 0));
    expect(shot.to.x).toBeCloseTo(190);
    expect(shot.color).toBe(damageColors.kinetic);
    // 90 units at speed 90 is one second, 20 ticks; it lands 8 ticks from now.
    expect(shot.flight).toBe(20);
    expect(shot.endTick).toBe(game.state.tick + 8);

    // The shot follows its target while the target lives, and keeps its last place once it is gone.
    body.theta = Math.PI / 2;
    effects.update(game, [], 0, 0);
    expect(shot.to.x).toBeCloseTo(0);
    expect(shot.to.y).toBeCloseTo(190);
    game.state.asteroids = [];
    game.state.tick += 7;
    effects.update(game, [], 0, 0);
    expect(effects.list).toHaveLength(1);
    expect(shot.to.y).toBeCloseTo(190);
    game.state.tick += 1;
    effects.update(game, [], 0, 0);
    expect(effects.list).toHaveLength(0);
  });

  it('aims at a remembered target and skips shots that already landed or are not launchers', () => {
    const game = newGame();
    const effects = new Effects();
    game.apply({ type: 'build', structure: 'cannon', site: { kind: 'surface', slot: 0 } });
    game.apply({ type: 'build', structure: 'laser', site: { kind: 'surface', slot: 1 } });
    const [cannon, laser] = game.state.structures;
    const body = rock(game, 190, 0);
    seenThenGone(game, effects, body);
    // Landed within the same batch of ticks: nothing left to draw.
    effects.update(game, [{ type: 'fired', structure: cannon.id, target: body.id }], 0, 0);
    expect(effects.list).toHaveLength(0);
    const other = rock(game, 190, 1);
    game.state.projectiles.push(shell(other.id, 4));
    effects.update(game, [{ type: 'fired', structure: laser.id, target: other.id }], 0, 0);
    expect(effects.list).toHaveLength(0);
    seenThenGone(game, effects, other);
    effects.update(game, [{ type: 'fired', structure: cannon.id, target: other.id }], 0, 0);
    expect(effects.list).toHaveLength(1);
  });

  it('forgets everything when the game is replaced or its clock goes back', () => {
    const game = newGame();
    const effects = new Effects();
    const body = rock(game, 200, 0);
    seenThenGone(game, effects, body);
    effects.update(game, [{ type: 'burnt', id: body.id }], 0, 0);
    expect(effects.list).toHaveLength(1);
    const next = newGame(2);
    effects.update(next, [{ type: 'burnt', id: body.id }], 0, 0);
    expect(effects.list).toHaveLength(0);

    const again = rock(next, 200, 0);
    next.state.tick = 50;
    seenThenGone(next, effects, again);
    next.state.tick = 10;
    effects.update(next, [{ type: 'burnt', id: again.id }], 0, 0);
    expect(effects.list).toHaveLength(0);
  });

  it('turns a real game into shots and bursts', () => {
    const game = newGame();
    const effects = new Effects();
    game.apply({ type: 'build', structure: 'coalPlant', site: { kind: 'surface', slot: 0 } });
    game.apply({ type: 'build', structure: 'cannon', site: { kind: 'surface', slot: 1 } });
    game.apply({ type: 'build', structure: 'cannon', site: { kind: 'surface', slot: 5 } });
    game.apply({ type: 'startWave' });
    const kinds = new Set<string>();
    tickUntil(game, (events) => {
      effects.update(game, events, game.state.tick * 50, game.time);
      for (const effect of effects.list) kinds.add(effect.kind);
      return kinds.has('shot') && kinds.has('burst');
    });
    expect(kinds).toContain('text');
  });
});
