import { type Asteroid, type Game, fromPolar } from '@engine';
import { describe, expect, it } from 'vitest';
import { beams, rangeToDraw, structureLook } from '../../src/render/scene';
import { newGame } from './fakes';

function rock(game: Game, r: number, theta: number, hp = 100): Asteroid {
  const asteroid: Asteroid = {
    id: game.state.nextId++,
    kind: 'rock',
    mass: 10,
    hp,
    r,
    theta,
    direction: 1,
    pending: 0,
    lastHit: null,
  };
  game.state.asteroids.push(asteroid);
  return asteroid;
}

function build(game: Game, structure: string, slot: number): void {
  const result = game.apply({ type: 'build', structure, site: { kind: 'surface', slot } });
  expect(result).toEqual({ ok: true });
}

describe('beams', () => {
  it('aims each enabled laser at the lowest body in range that the planet does not hide', () => {
    const game = newGame();
    build(game, 'laser', 0); // at angle 0, on +x
    rock(game, 200, 0.1);
    const lowest = rock(game, 150, -0.1);
    rock(game, 130, 1.2); // lower and in range, but the planet is in the way
    rock(game, 120, 0.05, 0); // already dead
    const found = beams(game, 0);
    expect(found).toHaveLength(1);
    const at = fromPolar(lowest.r, lowest.theta);
    expect(found[0].to.x).toBeCloseTo(at.x);
    expect(found[0].to.y).toBeCloseTo(at.y);
    expect(found[0].from).toEqual(game.sitePosition({ kind: 'surface', slot: 0 }, 0));
  });

  it('fires at nothing out of range, and not at all when switched off or not a beam', () => {
    const game = newGame();
    build(game, 'laser', 0);
    build(game, 'cannon', 1);
    rock(game, 400, 0);
    expect(beams(game, 0)).toEqual([]);
    rock(game, 180, 0);
    game.state.structures[0].enabled = false;
    expect(beams(game, 0)).toEqual([]);
  });
});

describe('rangeToDraw', () => {
  it('shows nothing without a selection or for something with no range', () => {
    const game = newGame();
    build(game, 'coalPlant', 0);
    expect(rangeToDraw(game, { selected: null, preview: 'laser' })).toBeNull();
    expect(rangeToDraw(game, { selected: { kind: 'surface', slot: 0 }, preview: null })).toBeNull();
    expect(rangeToDraw(game, { selected: { kind: 'surface', slot: 1 }, preview: null })).toBeNull();
    expect(rangeToDraw(game, { selected: { kind: 'surface', slot: 1 }, preview: 'nope' })).toBeNull();
  });

  it("shows a built weapon's range, ignoring the preview", () => {
    const game = newGame();
    build(game, 'cannon', 0);
    const site = { kind: 'surface', slot: 0 } as const;
    expect(rangeToDraw(game, { selected: site, preview: 'laser' })).toEqual({ site, radius: 150 });
  });

  it('shows the previewed structure at an empty slot, including fields', () => {
    const game = newGame();
    const site = { kind: 'shell', shell: 0, slot: 1 } as const;
    expect(rangeToDraw(game, { selected: site, preview: 'laser' })).toEqual({ site, radius: 160 });
    expect(rangeToDraw(game, { selected: site, preview: 'relativityField' })).toEqual({ site, radius: 90 });
  });
});

describe('structureLook', () => {
  it('reports launcher charge and nothing for others', () => {
    const game = newGame();
    build(game, 'cannon', 0);
    build(game, 'coalPlant', 1);
    const [cannon, plant] = game.state.structures;
    const defs = game.structures();
    cannon.charge = 5;
    expect(structureLook(game, cannon, defs.cannon, 0)).toEqual({ alpha: 1, charge: 0.5 });
    cannon.charge = 50;
    expect(structureLook(game, cannon, defs.cannon, 0).charge).toBe(1);
    expect(structureLook(game, plant, defs.coalPlant, 0)).toEqual({ alpha: 1, charge: null });
  });

  it('dims what is switched off, short of power or out of fuel', () => {
    const game = newGame();
    build(game, 'laser', 0);
    build(game, 'coalPlant', 1);
    const [laser, plant] = game.state.structures;
    const defs = game.structures();
    laser.enabled = false;
    expect(structureLook(game, laser, defs.laser, 0).alpha).toBe(0.35);
    laser.enabled = true;
    game.state.power.factor = 0.5;
    const starved = structureLook(game, laser, defs.laser, 0).alpha;
    expect(starved).toBeGreaterThan(0.45);
    expect(starved).toBeLessThan(1);
    // A generator does not care about the power factor, only its fuel.
    expect(structureLook(game, plant, defs.coalPlant, 0).alpha).toBe(1);
    game.state.reserves.coal = 0;
    expect(structureLook(game, plant, defs.coalPlant, 0).alpha).toBe(0.45);
    delete game.state.reserves.coal;
    expect(structureLook(game, plant, defs.coalPlant, 0).alpha).toBe(0.45);
  });

  it('dims solar by the light it gets', () => {
    const game = newGame();
    game.state.unlocked.push('solarFarm', 'orbitalSolar');
    build(game, 'solarFarm', 0); // facing the sun at time 0
    build(game, 'solarFarm', 4); // facing away
    game.state.orbitSlots[0] = 4;
    expect(
      game.apply({ type: 'build', structure: 'orbitalSolar', site: { kind: 'shell', shell: 0, slot: 2 } }),
    ).toEqual({
      ok: true,
    });
    const [day, night, orbit] = game.state.structures;
    const defs = game.structures();
    expect(structureLook(game, day, defs.solarFarm, 0).alpha).toBe(1);
    expect(structureLook(game, night, defs.solarFarm, 0).alpha).toBe(0.45);
    expect(structureLook(game, orbit, defs.orbitalSolar, 0).alpha).toBe(0.45);
    // Daylight-sourced generators are all or nothing.
    const daylight = { ...defs.solarFarm, generator: { output: 1, source: 'daylight' as const, throttled: false } };
    game.state.structures[0].site = { kind: 'surface', slot: 1 };
    expect(structureLook(game, day, daylight, 0).alpha).toBe(1);
    expect(structureLook(game, night, daylight, 0).alpha).toBe(0.45);
  });
});
