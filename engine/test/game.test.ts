import { describe, expect, it } from 'vitest';
import { Game, baseContent, baseWorld, distance, fromPolar, nextRandom, segmentHitsCircle } from '../src/index';
import { errorOf, level, must, newGame, ofType, place, run, shell, surface } from './helpers';

describe('math', () => {
  it('gives the same random sequence for the same seed', () => {
    const a = nextRandom(42);
    const b = nextRandom(42);
    expect(a).toEqual(b);
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(1);
    expect(nextRandom(a.state).value).not.toBe(a.value);
  });

  it('detects a segment crossing the planet', () => {
    expect(segmentHitsCircle({ x: -200, y: 0 }, { x: 200, y: 0 }, 100)).toBe(true);
    expect(segmentHitsCircle({ x: -200, y: 150 }, { x: 200, y: 150 }, 100)).toBe(false);
    expect(segmentHitsCircle({ x: 150, y: 0 }, { x: 150, y: 0 }, 100)).toBe(false);
  });
});

describe('sites', () => {
  it('turns surface slots with the planet and shell slots at orbital speed', () => {
    const game = newGame();
    expect(game.sitePosition(surface(0), 0)).toEqual({ x: 100, y: 0 });
    const later = game.sitePosition(surface(0), 10);
    expect(Math.atan2(later.y, later.x)).toBeCloseTo(baseWorld.planetSpin * 10);
    const orbit = game.sitePosition(shell(0, 0), 10);
    expect(Math.hypot(orbit.x, orbit.y)).toBeCloseTo(160);
    expect(Math.atan2(orbit.y, orbit.x)).toBeCloseTo(game.orbitalSpeed(160) * 10);
  });

  it('orbits faster closer in', () => {
    const game = newGame();
    expect(game.orbitalSpeed(100)).toBeCloseTo(baseWorld.kepler);
    expect(game.orbitalSpeed(160)).toBeGreaterThan(game.orbitalSpeed(310));
  });

  it('lists free sites and finds what is built on one', () => {
    const game = newGame();
    expect(game.freeSites('surface')).toHaveLength(8);
    expect(game.freeSites('shell')).toHaveLength(18);
    must(game, { type: 'build', structure: 'laser', site: shell(1, 2) });
    must(game, { type: 'build', structure: 'laser', site: surface(2) });
    expect(game.freeSites('shell')).toHaveLength(17);
    expect(game.freeSites('surface')).toHaveLength(7);
    expect(game.structureAt(shell(1, 2))?.def).toBe('laser');
    expect(game.structureAt(shell(0, 2))).toBeUndefined();
  });
});

describe('commands', () => {
  it('builds, charges the cost, and refunds part of it on sale', () => {
    const game = newGame({ start: { minerals: 100, population: 100, techs: [] } });
    must(game, { type: 'build', structure: 'laser', site: surface(0) });
    expect(game.state.minerals).toBe(40);
    must(game, { type: 'sell', id: game.state.structures[0].id });
    expect(game.state.minerals).toBe(70);
    expect(game.state.structures).toHaveLength(0);
  });

  it('rejects invalid builds with a reason', () => {
    const game = newGame({
      start: { minerals: 100, population: 100, techs: [], structures: ['laser', 'coalPlant'] },
    });
    expect(errorOf(game, { type: 'build', structure: 'nope', site: surface(0) })).toBe('unknown-structure');
    expect(errorOf(game, { type: 'build', structure: 'solarFarm', site: surface(0) })).toBe('locked');
    expect(errorOf(game, { type: 'build', structure: 'coalPlant', site: shell(0, 0) })).toBe('invalid-site');
    expect(errorOf(game, { type: 'build', structure: 'laser', site: surface(8) })).toBe('invalid-site');
    expect(errorOf(game, { type: 'build', structure: 'laser', site: surface(-1) })).toBe('invalid-site');
    expect(errorOf(game, { type: 'build', structure: 'laser', site: shell(9, 0) })).toBe('invalid-site');
    must(game, { type: 'build', structure: 'laser', site: surface(0) });
    expect(errorOf(game, { type: 'build', structure: 'coalPlant', site: surface(0) })).toBe('site-occupied');
    expect(errorOf(game, { type: 'build', structure: 'laser', site: surface(1) })).toBe('cannot-afford');
    expect(errorOf(game, { type: 'sell', id: 999 })).toBe('unknown-id');
    expect(errorOf(game, { type: 'setEnabled', id: 999, enabled: false })).toBe('unknown-id');
  });

  it('refuses commands once the game is over', () => {
    const game = newGame();
    game.state.status = 'lost';
    expect(errorOf(game, { type: 'startWave' })).toBe('game-over');
    expect(game.tick()).toEqual([]);
  });
});

describe('energy', () => {
  it('runs consumers at the share of demand that generation covers', () => {
    const game = newGame();
    must(game, { type: 'build', structure: 'lab', site: surface(0) });
    run(game, 20);
    expect(game.state.power).toMatchObject({ generation: 0, demand: 10, factor: 0 });
    expect(game.state.science).toBe(0);
    expect(game.state.stats.energyUnserved).toBeCloseTo(10);

    must(game, { type: 'build', structure: 'lab', site: surface(1) });
    must(game, { type: 'build', structure: 'coalPlant', site: surface(2) });
    run(game, 20);
    expect(game.state.power.factor).toBe(1);
    expect(game.state.science).toBeCloseTo(2);

    must(game, { type: 'build', structure: 'lab', site: surface(3) });
    game.tick();
    expect(game.state.power.factor).toBeCloseTo(20 / 30);
  });

  it('stores surplus in batteries and drains them to cover a shortfall', () => {
    const game = newGame();
    must(game, { type: 'build', structure: 'coalPlant', site: surface(0) });
    must(game, { type: 'build', structure: 'battery', site: surface(1) });
    run(game, 20);
    expect(game.state.power.stored).toBeCloseTo(20);
    expect(game.state.power.capacity).toBe(600);

    must(game, { type: 'setEnabled', id: game.state.structures[0].id, enabled: false });
    must(game, { type: 'build', structure: 'lab', site: surface(2) });
    run(game, 20);
    expect(game.state.power.factor).toBe(1);
    expect(game.state.power.stored).toBeCloseTo(10);
    run(game, 40);
    expect(game.state.power.stored).toBe(0);
    expect(game.state.power.factor).toBe(0);
  });

  it('caps storage at capacity and loses the charge when the battery is sold', () => {
    const game = newGame();
    must(game, { type: 'build', structure: 'coalPlant', site: surface(0) });
    must(game, { type: 'build', structure: 'battery', site: surface(1) });
    run(game, 20 * 40);
    expect(game.state.power.stored).toBe(600);
    must(game, { type: 'sell', id: game.state.structures[1].id });
    game.tick();
    expect(game.state.power.stored).toBe(0);
  });

  it('makes surface solar follow daylight', () => {
    const game = newGame();
    must(game, { type: 'build', structure: 'solarFarm', site: surface(0) });
    must(game, { type: 'build', structure: 'solarFarm', site: surface(4) });
    game.tick();
    // Slot 0 faces the sun at noon, slot 4 is at midnight.
    expect(game.state.power.generation).toBeCloseTo(60);
    expect(game.sunlight(surface(4))).toBe(0);
    expect(game.sunlight(surface(1))).toBeCloseTo(Math.SQRT1_2);
  });

  it('shades orbital solar only inside the shadow of the planet', () => {
    const game = newGame();
    expect(game.sunlight(shell(0, 0), 0)).toBe(1);
    expect(game.sunlight(shell(0, 1), 0)).toBe(1);
    expect(game.sunlight(shell(0, 2), 0)).toBe(0);
  });
});

describe('asteroids', () => {
  it('spiral inwards, speed up, and hit the population', () => {
    const game = newGame();
    const rock = place(game, { kind: 'rock', mass: 20, r: 300 });
    const startHp = rock.hp;
    run(game, 20);
    expect(rock.r).toBeLessThan(300);
    expect(rock.r).toBeGreaterThan(297);
    expect(rock.theta).toBeGreaterThan(0);
    const events = run(game, 20 * 200);
    const [impact] = ofType(events, 'impact');
    expect(impact.id).toBe(rock.id);
    // Some mass ablated on the way down, so the hit is smaller than the body started.
    expect(impact.population).toBeLessThan(20);
    expect(impact.population).toBeGreaterThan(5);
    expect(rock.hp).toBeLessThan(startHp);
    expect(game.state.population).toBeCloseTo(100 - impact.population);
    expect(game.state.stats.impacts).toBe(1);
  });

  it('orbit the other way when retrograde', () => {
    const game = newGame();
    const rock = place(game, { kind: 'rock', mass: 20, r: 300, direction: -1 });
    game.tick();
    expect(rock.theta).toBeLessThan(0);
  });

  it('burn up in the atmosphere when small, with no minerals', () => {
    const game = newGame();
    const pebble = place(game, { kind: 'ice', mass: 1.2, r: 200 });
    const events = run(game, 20 * 60);
    expect(ofType(events, 'burnt')).toEqual([{ type: 'burnt', id: pebble.id }]);
    expect(game.state.population).toBe(100);
    expect(game.state.stats.burnt).toBe(1);
    expect(game.state.minerals).toBe(10_000);
  });

  it('sink faster when light: a small body decays ahead of a big one', () => {
    const game = newGame();
    const small = place(game, { kind: 'iron', mass: 4, r: 180 });
    const big = place(game, { kind: 'iron', mass: 40, r: 180 });
    run(game, 100);
    expect(small.r).toBeLessThan(big.r);
  });

  it('end the game when the population is gone', () => {
    const game = newGame();
    place(game, { kind: 'iron', mass: 500, r: 101 });
    const events = run(game, 20);
    expect(ofType(events, 'ended')).toEqual([{ type: 'ended', status: 'lost' }]);
    expect(game.state.population).toBe(0);
    expect(game.state.status).toBe('lost');
  });
});

describe('lasers', () => {
  it('draw power only while firing and vaporize without fragments', () => {
    const game = newGame();
    must(game, { type: 'build', structure: 'coalPlant', site: surface(4) });
    must(game, { type: 'build', structure: 'laser', site: surface(0) });
    game.tick();
    expect(game.state.power.demand).toBe(0);

    const rock = place(game, { kind: 'rock', mass: 6, r: 220, direction: 1 });
    rock.theta = 0.05;
    game.tick();
    expect(game.state.power.demand).toBe(15);
    expect(rock.lastHit).toBe('thermal');
    const events = run(game, 20 * 8);
    const [destroyed] = ofType(events, 'destroyed');
    expect(destroyed).toMatchObject({ id: rock.id, fragments: 0 });
    expect(game.state.asteroids).toHaveLength(0);
    // Vaporized high up: well under the full 6 minerals.
    expect(destroyed.minerals).toBeGreaterThan(0);
    expect(destroyed.minerals).toBeLessThan(3);
    expect(game.state.stats.mineralsEarned).toBeCloseTo(destroyed.minerals);
  });

  it('cannot see below the horizon or past their range', () => {
    const game = newGame();
    must(game, { type: 'build', structure: 'coalPlant', site: surface(4) });
    must(game, { type: 'build', structure: 'laser', site: surface(0) });
    const behind = place(game, { kind: 'rock', mass: 6, r: 130 });
    behind.theta = Math.PI;
    const far = place(game, { kind: 'rock', mass: 6, r: 400 });
    game.tick();
    expect(behind.lastHit).toBeNull();
    expect(far.lastHit).toBeNull();
    expect(distance(game.sitePosition(surface(0)), fromPolar(far.r, far.theta))).toBeGreaterThan(160);
  });

  it('shoot the body closest to the planet, and do less to iron', () => {
    const game = newGame();
    must(game, { type: 'build', structure: 'coalPlant', site: surface(4) });
    must(game, { type: 'build', structure: 'laser', site: surface(0) });
    const high = place(game, { kind: 'rock', mass: 6, r: 240 });
    const low = place(game, { kind: 'iron', mass: 6, r: 200 });
    const hp = low.hp;
    game.tick();
    expect(high.lastHit).toBeNull();
    expect(low.lastHit).toBe('thermal');
    // 12 dps for one tick at 0.4 resistance, on top of negligible ablation.
    expect(hp - low.hp).toBeCloseTo(12 * 0.05 * 0.4, 1);
  });

  it('do nothing when switched off or unpowered', () => {
    const game = newGame();
    must(game, { type: 'build', structure: 'laser', site: surface(0) });
    const rock = place(game, { kind: 'rock', mass: 6, r: 200 });
    const hp = rock.hp;
    game.tick();
    expect(game.state.power.factor).toBe(0);
    expect(rock.hp).toBeCloseTo(hp, 1);
    must(game, { type: 'setEnabled', id: game.state.structures[0].id, enabled: false });
    game.tick();
    expect(game.state.power.demand).toBe(0);
  });
});

describe('railguns', () => {
  function charged(): Game {
    const game = newGame();
    must(game, { type: 'build', structure: 'coalPlant', site: surface(4) });
    must(game, { type: 'build', structure: 'railgun', site: surface(0) });
    run(game, 20 * 5 + 1);
    expect(game.state.structures[1].charge).toBeGreaterThanOrEqual(60);
    expect(game.state.power.demand).toBe(0);
    return game;
  }

  it('charge from the grid, fire a projectile, and break a rock into fragments', () => {
    const game = charged();
    const rock = place(game, { kind: 'rock', mass: 5.9, r: 220 });
    const fired = game.tick();
    expect(ofType(fired, 'fired')).toHaveLength(1);
    expect(game.state.structures[1].charge).toBeLessThan(1);
    expect(game.state.projectiles).toHaveLength(1);
    expect(rock.pending).toBe(60);
    const mass = rock.mass;

    const events = run(game, 40);
    const [destroyed] = ofType(events, 'destroyed');
    expect(destroyed).toMatchObject({ id: rock.id, fragments: 3 });
    expect(game.state.asteroids).toHaveLength(3);
    const total = game.state.asteroids.reduce((sum, a) => sum + a.mass, 0);
    expect(total).toBeCloseTo(mass * 0.6, 0);
    expect(game.state.asteroids.every((a) => a.kind === 'rock' && a.direction === 1)).toBe(true);
  });

  it('knock a surviving body back out, lighter bodies further', () => {
    const game = charged();
    const iron = place(game, { kind: 'iron', mass: 20, r: 220 });
    run(game, 40);
    expect(iron.lastHit).toBe('kinetic');
    expect(iron.pending).toBeCloseTo(0);
    // 15 knockback halved for twice the reference mass, minus about two seconds of decay.
    expect(iron.r).toBeGreaterThan(222);
    expect(iron.r).toBeLessThan(227.5);
  });

  it('never knock a body past the spawn radius', () => {
    const game = charged();
    const iron = place(game, { kind: 'iron', mass: 30, r: 330 });
    iron.theta = 0;
    game.state.projectiles.push({ target: iron.id, hit: 1, damage: 'kinetic', knockback: 5000, ticksLeft: 1 });
    game.tick();
    expect(iron.r).toBeLessThanOrEqual(420);
    expect(iron.r).toBeGreaterThan(400);
  });

  it('do not fire at a body that shots in flight will already kill', () => {
    const game = charged();
    const rock = place(game, { kind: 'rock', mass: 5, r: 220 });
    rock.pending = rock.hp;
    expect(ofType(game.tick(), 'fired')).toHaveLength(0);
  });

  it('waste a projectile whose target is already gone', () => {
    const game = charged();
    game.state.projectiles.push({ target: 12345, hit: 60, damage: 'kinetic', knockback: 15, ticksLeft: 1 });
    game.tick();
    expect(game.state.projectiles).toHaveLength(0);
  });

  it('turn fragments too small to matter into dust', () => {
    const game = newGame();
    const rock = place(game, { kind: 'rock', mass: 3, r: 250 });
    rock.hp = 0;
    rock.lastHit = 'kinetic';
    const [destroyed] = ofType(game.tick(), 'destroyed');
    expect(destroyed.fragments).toBe(0);
    expect(game.state.asteroids).toHaveLength(0);
  });

  it('pay more for a kill low down than for one high up', () => {
    const low = newGame();
    const high = newGame();
    for (const [game, r] of [
      [low, 110],
      [high, 400],
    ] as const) {
      const iron = place(game, { kind: 'iron', mass: 1.5, r });
      iron.hp = 0;
      iron.lastHit = 'explosive';
      game.tick();
    }
    expect(low.state.stats.mineralsEarned).toBeGreaterThan(high.state.stats.mineralsEarned * 1.5);
  });
});

describe('relativity field', () => {
  it('slows bodies inside it, in proportion to the power it gets', () => {
    const free = new Game(baseContent, level(), 1);
    const slowed = new Game(baseContent, level(), 1);
    const starved = new Game(baseContent, level(), 1);
    must(slowed, { type: 'build', structure: 'fissionPlant', site: surface(0) });
    must(slowed, { type: 'build', structure: 'relativityField', site: shell(0, 0) });
    must(starved, { type: 'build', structure: 'coalPlant', site: surface(0) });
    must(starved, { type: 'build', structure: 'relativityField', site: shell(0, 0) });

    const bodies = [free, slowed, starved].map((game) => place(game, { kind: 'iron', mass: 20, r: 200 }));
    for (const game of [free, slowed, starved]) game.tick();
    const [a, b, c] = bodies.map((body) => 200 - body.r);
    expect(b).toBeCloseTo(a * 0.4, 3);
    // 20 of the 30 it wants: two thirds of the effect.
    expect(c).toBeCloseTo(a * 0.6, 3);

    const outside = place(slowed, { kind: 'iron', mass: 20, r: 200 });
    outside.theta = Math.PI;
    slowed.tick();
    expect(200 - outside.r).toBeCloseTo(a, 3);
  });
});

describe('waves', () => {
  const waves = [
    { reward: 50, spawns: [{ at: 0, kind: 'ice', mass: 1, count: 2, interval: 1 }] },
    { reward: 70, spawns: [{ at: 1, kind: 'ice', mass: 1, direction: -1 as const }] },
  ];

  it('start on their own after the delay, spawn on schedule, and pay a reward when cleared', () => {
    const game = newGame({ waveDelay: 2 }, waves);
    expect(ofType(run(game, 40), 'waveStarted')).toHaveLength(0);
    const events = run(game, 30);
    expect(ofType(events, 'waveStarted')).toEqual([{ type: 'waveStarted', wave: 0, bonus: 0 }]);
    expect(ofType(events, 'spawned')).toHaveLength(2);
    expect(game.state.asteroids[0].r).toBeLessThan(420);
    expect(errorOf(game, { type: 'startWave' })).toBe('wave-active');
  });

  it('pay a bonus for calling a wave early, then win after the last wave', () => {
    const game = newGame({ waveDelay: 30 }, waves);
    run(game, 20 * 10);
    must(game, { type: 'startWave' });
    expect(game.state.minerals).toBeCloseTo(10_000 + 20);
    const events = run(game, 20 * 400);
    expect(ofType(events, 'waveCleared').map((e) => e.reward)).toEqual([50, 70]);
    expect(ofType(events, 'waveStarted')).toHaveLength(2);
    expect(ofType(events, 'ended')).toEqual([{ type: 'ended', status: 'won' }]);
    expect(game.state.status).toBe('won');
    expect(game.state.minerals).toBeCloseTo(10_000 + 20 + 50 + 70);
  });
});

describe('beam targets', () => {
  it('records what a laser fired at, and clears it once nothing is in range', () => {
    const game = newGame();
    must(game, { type: 'build', structure: 'laser', site: surface(0) });
    const rock = place(game, { kind: 'rock', mass: 20, r: 180, theta: 0 });
    game.tick();
    expect(game.state.structures[0].target).toBe(rock.id);
    game.state.asteroids = [];
    game.tick();
    expect(game.state.structures[0].target).toBeUndefined();
    expect('target' in game.state.structures[0]).toBe(false);
  });
});

describe('elliptic orbits', () => {
  const wave = [{ reward: 10, spawns: [{ at: 0, kind: 'iron', mass: 30 }] }];
  const orbits = { periapsis: [200, 200] as [number, number], apoapsis: [600, 600] as [number, number] };

  it('put a new body on the ellipse it asked for, heading in', () => {
    const game = newGame();
    const { vr, vt } = game.orbitVelocity(420, 200, 600, 1);
    expect(vr).toBeLessThan(0);
    expect(vt).toBeGreaterThan(0);
    // Same angular momentum and energy as the ellipse with those close and far points.
    const h = 420 * vt;
    const energy = (vr * vr + vt * vt) / 2 - game.mu / 420;
    expect(h).toBeCloseTo(Math.sqrt((2 * game.mu * 200 * 600) / 800), 6);
    expect(energy).toBeCloseTo(-game.mu / 800, 6);
    expect(game.orbitVelocity(420, 200, 600, -1).vt).toBeCloseTo(-vt, 9);
  });

  it('swing a body in past the planet, back out beyond where it came from, and in again', () => {
    const game = newGame({ waveDelay: 0, world: { ...baseWorld, inflow: 0, orbits } }, wave);
    const radii: number[] = [];
    for (let i = 0; i < 20 * 200; i++) {
      game.tick();
      const body = game.state.asteroids[0];
      if (body) radii.push(body.r);
    }
    const closest = Math.min(...radii);
    const furthest = Math.max(...radii);
    expect(closest).toBeGreaterThan(190);
    expect(closest).toBeLessThan(205);
    expect(furthest).toBeGreaterThan(590);
    expect(furthest).toBeLessThan(605);
    // Came back down after the far point.
    expect(radii[radii.length - 1]).toBeLessThan(furthest - 50);
  });

  it('shrink with inflow and fall in the end, instead of orbiting for ever', () => {
    const game = newGame({ waveDelay: 0, world: { ...baseWorld, inflow: 2, orbits } }, wave);
    const events = run(game, 20 * 600);
    expect(ofType(events, 'impact')).toHaveLength(1);
  });

  it('brake a body that was flung onto an open path, so it comes back', () => {
    const game = newGame({ world: { ...baseWorld, inflow: 2 } });
    const body = place(game, { kind: 'iron', mass: 30, r: 300, vr: 0, vt: 60 });
    expect((body.vt ?? 0) ** 2 / 2 - game.mu / 300).toBeGreaterThan(0);
    run(game, 20 * 30);
    expect(Math.hypot(body.vr ?? 0, body.vt ?? 0)).toBeLessThan(60);
  });

  it('keep spin when knocked back, so a lifted body swings out from there', () => {
    const game = newGame();
    const iron = place(game, { kind: 'iron', mass: 10, r: 200, vr: 0, vt: 30 });
    game.state.projectiles.push({ target: iron.id, hit: 1, damage: 'kinetic', knockback: 20, ticksLeft: 1 });
    game.tick();
    // Lifted 20 units, angular momentum kept through the push.
    expect(iron.r).toBeGreaterThan(215);
    expect(iron.r * (iron.vt ?? 0)).toBeCloseTo(200 * 30, -1);
  });

  it('send fragments on along the parent orbit', () => {
    const game = newGame();
    const rock = place(game, { kind: 'rock', mass: 30, r: 300, theta: 0.2, vr: -20, vt: 40 });
    rock.hp = 0;
    game.tick();
    expect(game.state.asteroids.length).toBeGreaterThan(1);
    for (const fragment of game.state.asteroids) {
      expect(fragment.vt).toBeGreaterThan(35);
      expect(fragment.vt).toBeLessThan(45);
    }
  });
});
