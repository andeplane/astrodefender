import { type Game, type GameEvent, type Vec, distance, fromPolar } from '@engine';
import { asteroidColors, damageColors, palette } from '../theme';
import { formatAmount } from './look';

/** How long each timed effect lasts, in real milliseconds. */
export const LIFETIME = { burst: 500, fizzle: 400, flash: 600, text: 1200 } as const;

export type TimedEffect =
  | { kind: 'burst'; at: Vec; born: number; color: string; mass: number }
  | { kind: 'fizzle'; at: Vec; born: number }
  | { kind: 'flash'; at: Vec; born: number }
  | { kind: 'text'; at: Vec; born: number; text: string; color: string };

/** A launcher shot in flight. It runs on game ticks, so it stops when the game is paused. */
export interface Shot {
  kind: 'shot';
  from: Vec;
  /** Where the target is, kept up to date while it lives. */
  to: Vec;
  target: number;
  color: string;
  /** The tick the shot lands on, and how many ticks the whole flight takes. */
  endTick: number;
  flight: number;
}

export type Effect = TimedEffect | Shot;

interface Known {
  x: number;
  y: number;
  kind: string;
  mass: number;
  seen: number;
}

/** Share of a timed effect's life that has passed, 0 to 1. */
export function age(effect: TimedEffect, now: number): number {
  return Math.min(1, Math.max(0, (now - effect.born) / LIFETIME[effect.kind]));
}

/** Share of a shot's flight done at a (fractional) tick, 0 to 1. */
export function progress(shot: Shot, tick: number): number {
  return Math.min(1, Math.max(0, 1 - (shot.endTick - tick) / shot.flight));
}

/**
 * Turns events into short-lived effects. Events name asteroids that may already be gone, so it
 * remembers where every body was on the previous frame.
 */
export class Effects {
  readonly list: Effect[] = [];
  private readonly known = new Map<number, Known>();
  private game: Game | null = null;
  private lastTick = 0;
  private generation = 0;

  /** `time` is the game time the frame is drawn at; `now` is real time in ms. */
  update(game: Game, events: GameEvent[], now: number, time: number): void {
    const tick = game.state.tick;
    // A restart brings a new game (or rewinds the clock): nothing from the old one applies.
    if (game !== this.game || tick < this.lastTick) {
      this.list.length = 0;
      this.known.clear();
      this.game = game;
    }
    this.lastTick = tick;
    for (const event of events) this.ingest(game, event, now, time);
    this.remember(game);
    this.prune(now, tick);
  }

  private ingest(game: Game, event: GameEvent, now: number, time: number): void {
    switch (event.type) {
      case 'fired': {
        const structure = game.state.structures.find((s) => s.id === event.structure);
        const weapon = structure ? game.structures()[structure.def]?.weapon : undefined;
        const at = this.position(game, event.target);
        if (!structure || weapon?.type !== 'launcher' || !at) return;
        const from = game.sitePosition(structure.site, time);
        const flight = Math.max(1, Math.round(distance(from, at) / weapon.speed / game.level.world.dt));
        // The shot's own countdown, when it is still in flight; the latest one is the one just fired.
        let left = 0;
        for (const projectile of game.state.projectiles) {
          if (projectile.target === event.target) left = Math.max(left, projectile.ticksLeft);
        }
        if (left <= 0) return;
        this.list.push({
          kind: 'shot',
          from,
          to: at,
          target: event.target,
          color: damageColors[weapon.damage] ?? palette.text,
          endTick: game.state.tick + left,
          flight: Math.max(flight, left),
        });
        return;
      }
      case 'destroyed': {
        const known = this.known.get(event.id);
        if (!known) return;
        const at = { x: known.x, y: known.y };
        this.list.push({
          kind: 'burst',
          at,
          born: now,
          color: asteroidColors[known.kind] ?? palette.text,
          mass: known.mass,
        });
        if (event.minerals >= 0.05) {
          this.list.push({
            kind: 'text',
            at,
            born: now,
            text: `+${formatAmount(event.minerals)}`,
            color: palette.minerals,
          });
        }
        return;
      }
      case 'burnt': {
        const known = this.known.get(event.id);
        if (known) this.list.push({ kind: 'fizzle', at: { x: known.x, y: known.y }, born: now });
        return;
      }
      case 'impact': {
        const known = this.known.get(event.id);
        if (!known) return;
        // The flash sits on the ground under the body, whatever height it was last seen at.
        const length = Math.hypot(known.x, known.y) || 1;
        const radius = game.level.world.planetRadius;
        const at = { x: (known.x / length) * radius, y: (known.y / length) * radius };
        this.list.push({ kind: 'flash', at, born: now });
        this.list.push({ kind: 'text', at, born: now, text: `-${formatAmount(event.population)}`, color: palette.bad });
        return;
      }
      default:
        return;
    }
  }

  private position(game: Game, id: number): Vec | undefined {
    const asteroid = game.state.asteroids.find((a) => a.id === id);
    if (asteroid) return fromPolar(asteroid.r, asteroid.theta);
    const known = this.known.get(id);
    return known ? { x: known.x, y: known.y } : undefined;
  }

  /** Updates entries in place rather than rebuilding the map, so a busy frame allocates little. */
  private remember(game: Game): void {
    const seen = ++this.generation;
    for (const asteroid of game.state.asteroids) {
      const x = asteroid.r * Math.cos(asteroid.theta);
      const y = asteroid.r * Math.sin(asteroid.theta);
      const known = this.known.get(asteroid.id);
      if (known) {
        known.x = x;
        known.y = y;
        known.mass = asteroid.mass;
        known.seen = seen;
      } else {
        this.known.set(asteroid.id, { x, y, kind: asteroid.kind, mass: asteroid.mass, seen });
      }
    }
    for (const [id, known] of this.known) if (known.seen !== seen) this.known.delete(id);
  }

  /** Drops finished effects in place and points live shots at where their target is now. */
  private prune(now: number, tick: number): void {
    let kept = 0;
    for (const effect of this.list) {
      if (effect.kind === 'shot') {
        if (tick >= effect.endTick) continue;
        const known = this.known.get(effect.target);
        if (known) {
          effect.to.x = known.x;
          effect.to.y = known.y;
        }
      } else if (now - effect.born >= LIFETIME[effect.kind]) {
        continue;
      }
      this.list[kept++] = effect;
    }
    this.list.length = kept;
  }
}
