import { Game, type GameEvent, type Site } from '@engine';
import { describe, expect, it } from 'vitest';
import type { Frame, UiState } from '../../src/contract';
import { createRenderer, renderer } from '../../src/render/renderer';
import { asteroidColors, damageColors, palette, swatch } from '../../src/theme';
import { FakeCamera, RecordingCtx, newGame, tickUntil } from './fakes';

const noUi: UiState = { selected: null, preview: null };

function frame(game: Game, patch: Partial<Frame> = {}): Frame {
  return { game, level: game.level, ui: noUi, camera: new FakeCamera(), events: [], now: 0, alpha: 0, ...patch };
}

function build(game: Game, structure: string, site: Site): void {
  expect(game.apply({ type: 'build', structure, site })).toEqual({ ok: true });
}

const surface = (slot: number): Site => ({ kind: 'surface', slot });

describe('createRenderer', () => {
  it('is the contract export of the renderer', () => {
    expect(createRenderer).toBe(renderer);
  });
});

describe('draw', () => {
  it('clears the whole canvas to space and paints a fixed star field', () => {
    const ctx = new RecordingCtx();
    const camera = new FakeCamera(400, 800);
    renderer(ctx).draw(frame(newGame(), { camera }));
    const [clear, ...rest] = ctx.named('fillRect');
    expect(clear.args).toEqual([0, 0, 400, 800]);
    expect(clear.style).toBe(palette.space);
    const starRects = rest.filter((call) => call.style === palette.text);
    expect(starRects.length).toBe(160);
    for (const star of starRects) {
      expect(star.args[0]).toBeLessThan(400);
      expect(star.args[1]).toBeLessThan(800);
    }
    // Saves and restores pair up, and the alpha is back to normal at the end.
    expect(ctx.depth).toBe(0);
    expect(ctx.globalAlpha).toBe(1);

    const again = new RecordingCtx();
    renderer(again).draw(frame(newGame(), { camera }));
    expect(again.named('fillRect')).toEqual(ctx.named('fillRect'));
  });

  it('dims closed shells and draws an atmosphere that fades out', () => {
    const ctx = new RecordingCtx();
    const game = newGame();
    renderer(ctx).draw(frame(game));
    const closed = ctx.named('stroke').filter((call) => call.style === palette.slotClosed);
    expect(closed).toHaveLength(3);
    const [glow] = ctx.gradients;
    expect(glow.stops.map((stop) => stop.offset)).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(glow.stops[3].color).toMatch(/, 0\)$/);

    game.state.orbitSlots[1] = 2;
    ctx.clear();
    renderer(ctx).draw(frame(game));
    expect(ctx.named('stroke').filter((call) => call.style === palette.slotClosed)).toHaveLength(2);
  });

  it('lights the side of the planet that faces +x, wherever the camera puts it', () => {
    const ctx = new RecordingCtx();
    renderer(ctx).draw(frame(newGame()));
    const shade = ctx.gradients[1];
    const [x0, y0, x1, y1] = shade.args;
    // The gradient runs from night to day, towards the sun.
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeCloseTo(y0);
    expect(shade.stops[0].color).toMatch(/, 0.9\)$/);
    expect(shade.stops[3].color).toMatch(/, 0\)$/);
    expect(ctx.named('clip')).toHaveLength(1);
  });

  it('turns the land with the planet', () => {
    const game = newGame();
    const landArcs = (): (number | string)[][] => {
      const ctx = new RecordingCtx();
      renderer(ctx).draw(frame(game));
      const calls = ctx.calls;
      return calls
        .filter((call, i) => call.name === 'fill' && call.style === palette.land && calls[i - 1].name === 'arc')
        .map((call) => calls[calls.indexOf(call) - 1].args);
    };
    const before = landArcs();
    expect(before).toHaveLength(5);
    game.state.tick += 200;
    expect(landArcs()).not.toEqual(before);
  });

  it('marks empty slots, tinting the ones with water', () => {
    const ctx = new RecordingCtx();
    const game = newGame();
    renderer(ctx).draw(frame(game));
    const strokes = ctx.named('stroke');
    expect(strokes.filter((call) => call.style === palette.water)).toHaveLength(2);
    expect(strokes.filter((call) => call.style === palette.slot)).toHaveLength(6);

    build(game, 'laser', surface(0));
    ctx.clear();
    renderer(ctx).draw(frame(game));
    expect(ctx.named('stroke').filter((call) => call.style === palette.slot)).toHaveLength(5);
  });

  it('marks other features in a warning colour', () => {
    const ctx = new RecordingCtx();
    const game = newGame();
    const level = { ...game.level, world: { ...game.level.world, surfaceFeatures: { lava: [1] } } };
    const lava = new Game(game.content, level, 1);
    renderer(ctx).draw(frame(lava));
    expect(ctx.named('stroke').filter((call) => call.style === palette.warn)).toHaveLength(1);
  });

  it('draws open shell slots, and fades them once the shell is full', () => {
    const ctx = new RecordingCtx();
    const game = newGame();
    game.state.orbitSlots[0] = 1;
    renderer(ctx).draw(frame(game));
    expect(ctx.named('stroke').filter((call) => call.style === palette.slot)).toHaveLength(6 + 4);
    build(game, 'battery', { kind: 'shell', shell: 0, slot: 2 });
    ctx.clear();
    renderer(ctx).draw(frame(game));
    expect(ctx.named('stroke').filter((call) => call.style === palette.slot)).toHaveLength(6);
    // Three shells closed plus three empty slots in the full one.
    expect(ctx.named('stroke').filter((call) => call.style === palette.slotClosed)).toHaveLength(2 + 3);
    expect(ctx.texts()).toContain(swatch('battery').glyph);
  });

  it('draws each structure as a disc with its glyph, dimmed when off, with launcher charge', () => {
    const ctx = new RecordingCtx();
    const game = newGame();
    build(game, 'laser', surface(0));
    build(game, 'cannon', surface(1));
    build(game, 'coalPlant', surface(3));
    const [laser, cannon] = game.state.structures;
    laser.enabled = false;
    cannon.charge = 5;
    renderer(ctx).draw(frame(game));
    expect(ctx.texts()).toEqual(['La', 'Ca', 'C']);
    const glyphs = ctx.named('fillText');
    expect(glyphs[0].alpha).toBe(0.35);
    expect(glyphs[1].alpha).toBe(1);
    expect(ctx.named('fill').some((call) => call.style === swatch('laser').color)).toBe(true);
    // Half charged: an arc in the text colour; full: in the structure's own colour.
    const chargeArc = ctx.named('arc').find((call) => call.args[4] === -Math.PI / 2 + Math.PI);
    expect(chargeArc).toBeDefined();
    cannon.charge = 10;
    ctx.clear();
    renderer(ctx).draw(frame(game));
    expect(ctx.named('stroke').some((call) => call.style === swatch('cannon').color)).toBe(true);
  });

  it('skips a structure whose definition is gone', () => {
    const ctx = new RecordingCtx();
    const game = newGame();
    game.state.structures.push({ id: 99, def: 'ghost', site: surface(4), enabled: true, charge: 0 });
    renderer(ctx).draw(frame(game));
    expect(ctx.texts()).toEqual([]);
  });

  it('rings the selection and shows the range of the selected weapon or the previewed one', () => {
    const ctx = new RecordingCtx();
    const game = newGame();
    const camera = new FakeCamera();
    build(game, 'laser', surface(0));
    renderer(ctx).draw(frame(game, { camera, ui: { selected: surface(0), preview: null } }));
    const radii = ctx.named('arc').map((call) => call.args[2]);
    expect(radii).toContain(160 * camera.scale);
    expect(ctx.named('stroke').some((call) => call.style === palette.selection)).toBe(true);
    expect(ctx.named('stroke').some((call) => call.style === palette.range)).toBe(true);

    ctx.clear();
    renderer(ctx).draw(frame(game, { camera, ui: { selected: surface(1), preview: 'cannon' } }));
    expect(ctx.named('arc').map((call) => call.args[2])).toContain(150 * camera.scale);

    ctx.clear();
    renderer(ctx).draw(frame(game, { camera, ui: { selected: surface(1), preview: null } }));
    expect(ctx.named('stroke').some((call) => call.style === palette.range)).toBe(false);
    expect(ctx.named('stroke').some((call) => call.style === palette.selection)).toBe(true);
  });

  it('draws asteroids by kind and mass, with damage and heat', () => {
    const ctx = new RecordingCtx();
    const game = newGame();
    const base = { pending: 0, lastHit: null, direction: 1 as const };
    game.state.asteroids.push(
      { ...base, id: 1, kind: 'ice', mass: 10, hp: 45, r: 400, theta: 0 },
      { ...base, id: 2, kind: 'rock', mass: 10, hp: 50, r: 300, theta: 1 },
      { ...base, id: 3, kind: 'iron', mass: 10, hp: 40, r: 300, theta: 2 },
      { ...base, id: 4, kind: 'rock', mass: 10, hp: 10, r: 105, theta: 3 },
      { ...base, id: 5, kind: 'mystery', mass: 10, hp: 1, r: 300, theta: 4 },
    );
    renderer(ctx).draw(frame(game));
    const fills = ctx.named('fill').map((call) => call.style);
    expect(fills).toContain(asteroidColors.ice);
    expect(fills).toContain(asteroidColors.iron);
    expect(fills).toContain(palette.muted);
    // Only the body deep in the air glows.
    expect(fills.filter((style) => typeof style === 'string' && style.startsWith('rgba(255, 138, 61'))).toHaveLength(1);
    const strokes = ctx.named('stroke').map((call) => call.style);
    expect(strokes).toContain(palette.good);
    expect(strokes).toContain(palette.warn);
    expect(strokes).toContain(palette.bad);
  });

  it('draws laser beams while they fire, and none without power', () => {
    const ctx = new RecordingCtx();
    const game = newGame();
    build(game, 'laser', surface(0));
    game.state.asteroids.push({
      id: 7,
      kind: 'rock',
      mass: 10,
      hp: 100,
      r: 180,
      theta: 0,
      direction: 1,
      pending: 0,
      lastHit: null,
    });
    renderer(ctx).draw(frame(game, { now: 1234 }));
    const beam = ctx.named('stroke').filter((call) => call.style === damageColors.thermal);
    expect(beam).toHaveLength(2);
    expect(ctx.named('lineTo')).toHaveLength(2);
    expect(ctx.lineCap).toBe('butt');

    game.state.power.factor = 0;
    ctx.clear();
    renderer(ctx).draw(frame(game));
    expect(ctx.named('lineTo')).toHaveLength(0);
  });

  it('animates shots, bursts and numbers from a real game', () => {
    const ctx = new RecordingCtx();
    const draw = renderer(ctx);
    const game = newGame();
    build(game, 'coalPlant', surface(0));
    build(game, 'cannon', surface(1));
    build(game, 'cannon', surface(5));
    build(game, 'laser', surface(3));
    game.apply({ type: 'startWave' });
    let sawShot = false;
    let sawMinerals = false;
    let now = 0;
    tickUntil(game, (events: GameEvent[]) => {
      now += 50;
      ctx.clear();
      draw.draw(frame(game, { events, now, alpha: 0.5 }));
      sawShot ||= ctx.named('fill').some((call) => call.style === damageColors.kinetic);
      sawMinerals ||= ctx.texts().some((text) => text.startsWith('+'));
      return sawShot && sawMinerals;
    });
    expect(ctx.depth).toBe(0);
  });

  it('flashes impacts with the population lost, and fizzles burnt bodies', () => {
    const ctx = new RecordingCtx();
    const draw = renderer(ctx);
    const game = newGame();
    game.apply({ type: 'startWave' });
    let now = 0;
    let sawLoss = false;
    let sawFizzle = false;
    tickUntil(game, (events) => {
      now += 50;
      ctx.clear();
      draw.draw(frame(game, { events, now }));
      sawLoss ||= ctx
        .named('fillText')
        .some((call) => call.style === palette.bad && String(call.args[0]).startsWith('-'));
      sawFizzle ||= ctx.named('stroke').some((call) => call.style === palette.heat);
      return sawLoss && sawFizzle;
    });
  });

  it('holds still between ticks once the game is over', () => {
    const game = newGame();
    game.state.status = 'lost';
    const first = new RecordingCtx();
    const second = new RecordingCtx();
    renderer(first).draw(frame(game, { alpha: 0 }));
    renderer(second).draw(frame(game, { alpha: 0.9 }));
    expect(second.calls).toEqual(first.calls);
  });
});
