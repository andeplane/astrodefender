import {
  Game,
  baseContent,
  firstLevel,
  type Command,
  type CommandResult,
  type GameEvent,
  type GameState,
  type LevelDef,
} from '@engine';
import type { Session, Speed, UiState, UiStore } from '../../src/contract';

/** A real engine game behind the contract's Session, recording what the HUD sends. */
export class FakeSession implements Session {
  readonly content = baseContent;
  readonly level: LevelDef;
  game: Game;
  seed = 1;
  speed: Speed = 1;
  alpha = 0;
  sent: Command[] = [];
  restarts = 0;

  constructor(level: LevelDef = firstLevel) {
    this.level = level;
    this.game = new Game(this.content, level, this.seed);
  }

  /** Runs whole ticks; `ms` is ignored, so tests count ticks instead. */
  advance(ticks: number): GameEvent[] {
    const events: GameEvent[] = [];
    for (let i = 0; i < ticks && this.game.state.status === 'playing'; i++) events.push(...this.game.tick());
    return events;
  }

  send(command: Command): CommandResult {
    this.sent.push(command);
    return this.game.apply(command);
  }

  restart(seed?: number): void {
    this.restarts++;
    this.seed = seed ?? this.seed + 1;
    this.game = new Game(this.content, this.level, this.seed);
  }

  load(state: GameState, seed: number): void {
    this.game = Game.restore(this.content, this.level, state);
    this.seed = seed;
  }
}

export class FakeUi implements UiStore {
  state: UiState = { selected: null, preview: null };
  private listeners = new Set<(state: UiState) => void>();

  set(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  subscribe(listener: (state: UiState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
