import { Game, baseContent, baseWorld, firstLevel, type LevelDef } from '@engine';
import { describe, expect, it } from 'vitest';
import { createCamera, pickSite } from '../src/camera';

const radius = baseWorld.spawnRadius * 1.05;

describe('camera', () => {
  it('fits the spawn circle into the width on a portrait screen, centred between the insets', () => {
    const camera = createCamera(baseWorld);
    camera.resize(400, 800, { top: 60, bottom: 140 });
    expect(camera.width).toBe(400);
    expect(camera.height).toBe(800);
    expect(camera.scale).toBeCloseTo(400 / (2 * radius));
    expect(camera.toScreen({ x: 0, y: 0 })).toEqual({ x: 200, y: 60 + 600 / 2 });
  });

  it('slides the planet up clear of an open panel without rescaling', () => {
    const camera = createCamera(baseWorld);
    camera.resize(400, 800, { top: 60, bottom: 140, sheet: 440 });
    expect(camera.scale).toBeCloseTo(400 / (2 * radius));
    expect(camera.toScreen({ x: 0, y: 0 })).toEqual({ x: 200, y: 60 + 300 / 2 });
    camera.resize(400, 800, { top: 60, bottom: 140, sheet: 100 });
    expect(camera.toScreen({ x: 0, y: 0 })).toEqual({ x: 200, y: 60 + 600 / 2 });
  });

  it('fits into the height left between the insets on a landscape screen', () => {
    const camera = createCamera(baseWorld);
    camera.resize(1200, 700, { top: 50, bottom: 50 });
    expect(camera.scale).toBeCloseTo(600 / (2 * radius));
    camera.resize(1200, 700);
    expect(camera.scale).toBeCloseTo(700 / (2 * radius));
    expect(camera.toScreen({ x: 0, y: 0 })).toEqual({ x: 600, y: 350 });
  });

  it('puts world +y up on screen and round-trips', () => {
    const camera = createCamera(baseWorld);
    camera.resize(500, 500);
    const up = camera.toScreen({ x: 0, y: 100 });
    expect(up.y).toBeLessThan(250);
    const right = camera.toScreen({ x: 100, y: 0 });
    expect(right.x).toBeGreaterThan(250);
    const world = camera.toWorld(camera.toScreen({ x: 123, y: -45 }));
    expect(world.x).toBeCloseTo(123);
    expect(world.y).toBeCloseTo(-45);
  });

  it('stays finite before layout or when the HUD covers everything', () => {
    const camera = createCamera(baseWorld);
    expect(camera.scale).toBe(1);
    camera.resize(300, 100, { top: 80, bottom: 80 });
    expect(camera.scale).toBeGreaterThan(0);
    expect(Number.isFinite(camera.toWorld({ x: 10, y: 10 }).x)).toBe(true);
  });
});

describe('pickSite', () => {
  const setup = (level: LevelDef = firstLevel) => {
    const game = new Game(baseContent, level, 1);
    const camera = createCamera(level.world);
    camera.resize(800, 800);
    return { game, camera };
  };

  it('picks the nearest surface slot within reach', () => {
    const { game, camera } = setup();
    const point = camera.toScreen(game.sitePosition({ kind: 'surface', slot: 3 }));
    expect(pickSite(game, firstLevel, camera, { x: point.x + 4, y: point.y - 3 }, 20)).toEqual({
      kind: 'surface',
      slot: 3,
    });
  });

  it('returns null when nothing is within reach', () => {
    const { game, camera } = setup();
    expect(pickSite(game, firstLevel, camera, { x: 0, y: 0 }, 20)).toBeNull();
  });

  it('follows the planet as it turns', () => {
    const { game, camera } = setup();
    game.state.tick = 400;
    const point = camera.toScreen(game.sitePosition({ kind: 'surface', slot: 0 }));
    expect(pickSite(game, firstLevel, camera, point, 5)).toEqual({ kind: 'surface', slot: 0 });
  });

  it('picks open shell slots', () => {
    const level: LevelDef = { ...firstLevel, world: baseWorld };
    const { game, camera } = setup(level);
    const site = { kind: 'shell', shell: 1, slot: 4 } as const;
    expect(pickSite(game, level, camera, camera.toScreen(game.sitePosition(site)), 10)).toEqual(site);
  });

  it('skips closed shells unless something already stands there', () => {
    const { game, camera } = setup();
    const site = { kind: 'shell', shell: 0, slot: 1 } as const;
    const point = camera.toScreen(game.sitePosition(site));
    expect(pickSite(game, firstLevel, camera, point, 10)).toBeNull();
    game.state.structures.push({ id: 99, def: 'battery', site, enabled: true, charge: 0 });
    expect(pickSite(game, firstLevel, camera, point, 10)).toEqual(site);
  });
});
