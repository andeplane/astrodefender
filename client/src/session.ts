import { Game, type Command, type CommandResult, type Content, type GameEvent, type LevelDef } from '@engine';
import type { CreateSession, Session, Speed } from './contract';

/** Real time worth of ticks one `advance` may run, so a tab coming back from the background does not stall. */
const MAX_CATCH_UP_MS = 250;

class GameSession implements Session {
  readonly content: Content;
  readonly level: LevelDef;
  speed: Speed = 1;
  private current: Game;
  private currentSeed: number;
  /** Simulated ms not yet run as a whole tick. */
  private pending = 0;

  constructor(content: Content, level: LevelDef, seed: number) {
    this.content = content;
    this.level = level;
    this.currentSeed = seed;
    this.current = new Game(content, level, seed);
  }

  get game(): Game {
    return this.current;
  }

  get seed(): number {
    return this.currentSeed;
  }

  private get tickMs(): number {
    return this.level.world.dt * 1000;
  }

  get alpha(): number {
    return Math.min(1, this.pending / this.tickMs);
  }

  advance(ms: number): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.current.state.status !== 'playing') {
      this.pending = 0;
      return events;
    }
    this.pending += Math.max(0, ms) * this.speed;
    const tickMs = this.tickMs;
    const limit = Math.max(1, Math.floor((MAX_CATCH_UP_MS * this.speed) / tickMs));
    let ran = 0;
    while (this.pending >= tickMs && ran < limit && this.current.state.status === 'playing') {
      events.push(...this.current.tick());
      this.pending -= tickMs;
      ran++;
    }
    // Time beyond the cap or after the game ended is dropped, not owed.
    if (this.current.state.status !== 'playing') this.pending = 0;
    else if (this.pending >= tickMs) this.pending %= tickMs;
    return events;
  }

  send(command: Command): CommandResult {
    return this.current.apply(command);
  }

  restart(seed?: number): void {
    // Derived from the previous seed so the module stays deterministic; main picks the first one.
    this.currentSeed = seed ?? (this.currentSeed + 1) % 2 ** 31;
    this.current = new Game(this.content, this.level, this.currentSeed);
    this.pending = 0;
  }
}

export const createSession: CreateSession = ({ content, level, seed }) => new GameSession(content, level, seed);
