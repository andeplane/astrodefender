import { TAU, type Game, type Site, type Vec, fromPolar } from '@engine';
import type { Camera, CreateRenderer, Frame, Renderer } from '../contract';
import { asteroidColors, damageColors, palette, swatch } from '../theme';
import type { Ctx } from './ctx';
import { Effects, type Shot, type TimedEffect, age, progress } from './effects';
import { asteroidRadius, healthShare, slotRadius, stars, structureRadius, withAlpha } from './look';
import { beams, rangeToDraw, structureLook } from './scene';

const STARS = 160;
/** Patches of land on the planet, as (angle, distance from centre, size) in planet radii. */
const LAND: readonly [number, number, number][] = [
  [0.3, 0.55, 0.38],
  [1.6, 0.7, 0.28],
  [2.5, 0.35, 0.3],
  [3.7, 0.62, 0.42],
  [5.1, 0.5, 0.25],
];
/** Precomputed glow colours, so a hundred bodies in the air do not build a hundred strings a frame. */
const HEAT_STEPS = 20;
const HEAT = Array.from({ length: HEAT_STEPS + 1 }, (_, i) => withAlpha(palette.heat, (0.55 * i) / HEAT_STEPS));
const NIGHT = withAlpha(palette.planetNight, 0.9);
const DAWN = withAlpha(palette.planetNight, 0);
/** A wide faint stroke under a thin bright one, as (line width, alpha). */
const BEAM_LAYERS: readonly [number, number][] = [
  [5, 0.25],
  [1.75, 1],
];
const FEATURE_COLORS: Record<string, string> = { water: palette.water };

function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The renderer for any context that has the drawing calls it needs; see `Ctx`. */
export function renderer(ctx: Ctx): Renderer {
  const effects = new Effects();

  function circle(at: Vec, radius: number): void {
    ctx.beginPath();
    ctx.arc(at.x, at.y, Math.max(0, radius), 0, TAU);
  }

  function background(camera: Camera): void {
    ctx.fillStyle = palette.space;
    ctx.fillRect(0, 0, camera.width, camera.height);
    ctx.fillStyle = palette.text;
    for (const star of stars(STARS)) {
      ctx.globalAlpha = star.alpha;
      ctx.fillRect(star.x * camera.width, star.y * camera.height, star.size * 2, star.size * 2);
    }
    ctx.globalAlpha = 1;
  }

  function rings(game: Game, camera: Camera, centre: Vec): void {
    const world = game.level.world;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = palette.shell;
    circle(centre, world.spawnRadius * camera.scale);
    ctx.stroke();
    ctx.setLineDash([]);
    world.shells.forEach((shell, index) => {
      ctx.strokeStyle = game.state.orbitSlots[index] > 0 ? palette.shell : palette.slotClosed;
      circle(centre, shell.radius * camera.scale);
      ctx.stroke();
    });
    // The glow thins like the air does: density falls by e every scale height.
    const inner = world.planetRadius * camera.scale;
    const outer = (world.planetRadius + 3 * world.atmosphereHeight) * camera.scale;
    const glow = ctx.createRadialGradient(centre.x, centre.y, inner, centre.x, centre.y, outer);
    for (let i = 0; i <= 3; i++) glow.addColorStop(i / 3, withAlpha(palette.sky, i === 3 ? 0 : 0.35 * Math.exp(-i)));
    ctx.fillStyle = glow;
    circle(centre, outer);
    ctx.fill();
  }

  function planet(game: Game, camera: Camera, centre: Vec, time: number): void {
    const world = game.level.world;
    const radius = world.planetRadius * camera.scale;
    ctx.save();
    circle(centre, radius);
    ctx.fillStyle = palette.planetDay;
    ctx.fill();
    ctx.clip();
    // Land turns with the planet, so the spin is visible.
    ctx.fillStyle = palette.land;
    for (const [angle, distance, size] of LAND) {
      const at = camera.toScreen(fromPolar(world.planetRadius * distance, angle + world.planetSpin * time));
      circle(at, world.planetRadius * size * camera.scale);
      ctx.fill();
    }
    // Night on the side away from the sun, which sits along world +x wherever the camera puts it.
    const sun = camera.toScreen({ x: world.planetRadius, y: 0 });
    const dx = sun.x - centre.x;
    const dy = sun.y - centre.y;
    const shade = ctx.createLinearGradient(centre.x - dx, centre.y - dy, sun.x, sun.y);
    shade.addColorStop(0, NIGHT);
    shade.addColorStop(0.44, NIGHT);
    shade.addColorStop(0.56, DAWN);
    shade.addColorStop(1, DAWN);
    ctx.fillStyle = shade;
    ctx.fillRect(centre.x - radius, centre.y - radius, radius * 2, radius * 2);
    ctx.restore();
    ctx.strokeStyle = withAlpha(palette.sky, 0.45);
    ctx.lineWidth = 1;
    circle(centre, radius);
    ctx.stroke();
  }

  function slotMarker(at: Vec, radius: number, color: string, open: boolean): void {
    circle(at, radius);
    ctx.fillStyle = palette.space;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = open ? color : palette.slotClosed;
    ctx.stroke();
  }

  function slots(game: Game, camera: Camera, time: number): void {
    const world = game.level.world;
    const radius = slotRadius(camera.scale);
    const features = world.surfaceFeatures ?? {};
    for (let slot = 0; slot < world.surfaceSlots; slot++) {
      const site: Site = { kind: 'surface', slot };
      if (game.structureAt(site)) continue;
      let color = palette.slot;
      for (const feature in features) {
        if (features[feature].includes(slot)) color = FEATURE_COLORS[feature] ?? palette.warn;
      }
      slotMarker(camera.toScreen(game.sitePosition(site, time)), radius, color, true);
    }
    world.shells.forEach((shell, index) => {
      const open = game.state.orbitSlots[index];
      if (open <= 0) return;
      let built = 0;
      for (const s of game.state.structures) if (s.site.kind === 'shell' && s.site.shell === index) built++;
      for (let slot = 0; slot < shell.slots; slot++) {
        const site: Site = { kind: 'shell', shell: index, slot };
        if (game.structureAt(site)) continue;
        // A shell holding as many as its open slots allow takes no more, so its empty slots fade.
        slotMarker(camera.toScreen(game.sitePosition(site, time)), radius, palette.slot, built < open);
      }
    });
  }

  function structures(game: Game, camera: Camera, time: number): void {
    const defs = game.structures();
    const radius = structureRadius(camera.scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const structure of game.state.structures) {
      const def = defs[structure.def];
      if (!def) continue;
      const look = structureLook(game, structure, def, time);
      const { color, glyph } = swatch(structure.def);
      const at = camera.toScreen(game.sitePosition(structure.site, time));
      ctx.globalAlpha = look.alpha;
      circle(at, radius);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = palette.space;
      ctx.stroke();
      ctx.fillStyle = palette.space;
      ctx.font = `bold ${Math.round(radius * (glyph.length > 1 ? 0.9 : 1.15))}px system-ui, sans-serif`;
      ctx.fillText(glyph, at.x, at.y + 0.5);
      if (look.charge !== null && look.charge > 0) {
        ctx.beginPath();
        ctx.arc(at.x, at.y, radius + 2.5, -Math.PI / 2, -Math.PI / 2 + look.charge * TAU);
        ctx.strokeStyle = look.charge >= 1 ? color : palette.text;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function selection(frame: Frame, time: number): void {
    const { game, camera, ui } = frame;
    if (!ui.selected) return;
    const range = rangeToDraw(game, ui);
    if (range) {
      const at = camera.toScreen(game.sitePosition(range.site, time));
      circle(at, range.radius * camera.scale);
      ctx.fillStyle = withAlpha(palette.selection, 0.04);
      ctx.fill();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = palette.range;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    circle(camera.toScreen(game.sitePosition(ui.selected, time)), structureRadius(camera.scale) + 4);
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function asteroids(game: Game, camera: Camera): void {
    const kinds = game.content.asteroids;
    for (const asteroid of game.state.asteroids) {
      const at = camera.toScreen(fromPolar(asteroid.r, asteroid.theta));
      const radius = asteroidRadius(asteroid.mass, camera.scale);
      const density = game.density(asteroid.r);
      const heat = Math.round(Math.min(1, density) * HEAT_STEPS);
      if (heat > 0) {
        circle(at, radius * (1.6 + 1.4 * Math.min(1, density)));
        ctx.fillStyle = HEAT[heat];
        ctx.fill();
      }
      circle(at, radius);
      ctx.fillStyle = asteroidColors[asteroid.kind] ?? palette.muted;
      ctx.fill();
      const kind = kinds[asteroid.kind];
      const health = kind ? healthShare(asteroid.hp, asteroid.mass, kind.toughness) : 1;
      if (health < 0.99) {
        ctx.beginPath();
        ctx.arc(at.x, at.y, radius + 2, -Math.PI / 2, -Math.PI / 2 + health * TAU);
        ctx.strokeStyle = health > 0.6 ? palette.good : health > 0.3 ? palette.warn : palette.bad;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  function lasers(game: Game, camera: Camera, time: number, now: number): void {
    const power = game.state.power.factor;
    if (power <= 0) return;
    ctx.lineCap = 'round';
    for (const beam of beams(game, time)) {
      const from = camera.toScreen(beam.from);
      const to = camera.toScreen(beam.to);
      const damage = beam.def.weapon?.damage;
      ctx.strokeStyle = (damage && damageColors[damage]) || palette.bad;
      // A slight flicker reads as a live beam rather than a drawn line.
      const strength = power * (0.75 + 0.25 * Math.sin(now / 35 + beam.structure.id));
      for (const [width, alpha] of BEAM_LAYERS) {
        ctx.globalAlpha = strength * alpha;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  function shot(effect: Shot, camera: Camera, tick: number): void {
    const done = progress(effect, tick);
    const head = camera.toScreen(lerp(effect.from, effect.to, done));
    const tail = camera.toScreen(lerp(effect.from, effect.to, Math.max(0, done - 0.12)));
    ctx.strokeStyle = effect.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    circle(head, 2.5);
    ctx.fillStyle = effect.color;
    ctx.fill();
  }

  function timed(effect: TimedEffect, camera: Camera, now: number): void {
    const t = age(effect, now);
    const at = camera.toScreen(effect.at);
    ctx.globalAlpha = 1 - t;
    switch (effect.kind) {
      case 'burst': {
        const size = asteroidRadius(effect.mass, camera.scale);
        circle(at, size * (1 - t));
        ctx.fillStyle = palette.text;
        ctx.fill();
        circle(at, size + t * 16);
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case 'fizzle':
        circle(at, 2 + t * 6);
        ctx.strokeStyle = palette.heat;
        ctx.lineWidth = 1;
        ctx.stroke();
        break;
      case 'flash':
        circle(at, 5 + t * 14);
        ctx.fillStyle = withAlpha(palette.bad, 0.7);
        ctx.fill();
        break;
      case 'text':
        ctx.globalAlpha = 1 - t * t;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = effect.color;
        ctx.fillText(effect.text, at.x, at.y - 10 - t * 22);
        break;
    }
    ctx.globalAlpha = 1;
  }

  return {
    draw(frame: Frame): void {
      const { game, camera, now } = frame;
      // Rotating things are drawn between ticks, so the planet and shells turn smoothly.
      const alpha = game.state.status === 'playing' ? frame.alpha : 0;
      const time = game.time + alpha * game.level.world.dt;
      effects.update(game, frame.events, now, time);
      const centre = camera.toScreen({ x: 0, y: 0 });
      background(camera);
      rings(game, camera, centre);
      planet(game, camera, centre, time);
      slots(game, camera, time);
      structures(game, camera, time);
      selection(frame, time);
      asteroids(game, camera);
      lasers(game, camera, time, now);
      const tick = game.state.tick + alpha;
      for (const effect of effects.list) {
        if (effect.kind === 'shot') shot(effect, camera, tick);
        else timed(effect, camera, now);
      }
    },
  };
}

export const createRenderer: CreateRenderer = renderer;
