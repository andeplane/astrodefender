import type {
  Command,
  CommandResult,
  Content,
  Game,
  GameEvent,
  GameState,
  LevelDef,
  Site,
  Vec,
  WorldDef,
} from '@engine';

/**
 * The seams between the client's parts. The session runs the engine, the renderer draws it on a
 * canvas, the HUD is the DOM on top, and they only meet through these types. Nothing here knows
 * about a particular structure or tech: the client reads everything from the engine's content.
 */

/** 0 is paused. */
export type Speed = 0 | 1 | 2 | 4;

/** Owns the running game and turns real time into whole engine ticks. */
export interface Session {
  readonly content: Content;
  readonly level: LevelDef;
  /** The current game. `restart` replaces it, so read it fresh every frame. */
  readonly game: Game;
  readonly seed: number;
  speed: Speed;
  /** Share of a tick left over after the last `advance`, 0 to 1, for smoothing motion. */
  readonly alpha: number;
  /** Runs the ticks that `ms` of real time are worth at the current speed; returns their events. */
  advance(ms: number): GameEvent[];
  send(command: Command): CommandResult;
  /** Starts the level again, with a new seed unless one is given. */
  restart(seed?: number): void;
  /**
   * Continues a saved game. `seed` is what the saved game was started with, so a later `restart`
   * derives the same next seed. Throws if the state cannot be restored; the current game is then kept.
   */
  load(state: GameState, seed: number): void;
}

/** What the player is pointing at. Shared by input, renderer and HUD. */
export interface UiState {
  /** The slot the player tapped, empty or built on. */
  selected: Site | null;
  /** A structure id whose range should be shown at the selected slot, while browsing the build menu. */
  preview: string | null;
}

export interface UiStore {
  readonly state: UiState;
  set(patch: Partial<UiState>): void;
  subscribe(listener: (state: UiState) => void): () => void;
}

/** Maps world units (planet at the origin, sun along +x) to CSS pixels of the canvas. */
export interface Camera {
  readonly width: number;
  readonly height: number;
  /** Pixels per world unit. */
  readonly scale: number;
  /**
   * `top` and `bottom` are pixels the HUD always covers; the play field is scaled to fit between them.
   * `sheet` is what an open panel covers from the bottom: the planet moves up clear of it, at the same scale.
   */
  resize(width: number, height: number, insets?: Insets): void;
  toScreen(world: Vec): Vec;
  toWorld(screen: Vec): Vec;
}

export interface Insets {
  top: number;
  bottom: number;
  /** Pixels covered from the bottom edge while a panel is open; never less than `bottom`. */
  sheet?: number;
}

export interface Frame {
  game: Game;
  level: LevelDef;
  ui: UiState;
  camera: Camera;
  /** Events of the ticks run since the last frame; the renderer turns them into effects. */
  events: GameEvent[];
  /** Real time in ms, for animation that is not part of the simulation. */
  now: number;
  alpha: number;
}

export interface Renderer {
  draw(frame: Frame): void;
}

export interface Hud {
  /** Called once per frame; must be cheap when nothing changed. */
  update(game: Game, events: GameEvent[]): void;
  /** Pixels the HUD covers at the top and bottom of the screen. */
  insets(): Insets;
}

export type CreateSession = (options: { content: Content; level: LevelDef; seed: number }) => Session;
export type CreateUiStore = () => UiStore;
export type CreateCamera = (world: WorldDef) => Camera;
/** The slot nearest to a screen point, within `reach` pixels, or null. Closed orbital slots are skipped. */
export type PickSite = (game: Game, level: LevelDef, camera: Camera, point: Vec, reach: number) => Site | null;
/** Takes the 2D context; the renderer never touches the DOM otherwise. */
export type CreateRenderer = (ctx: CanvasRenderingContext2D) => Renderer;
export type CreateHud = (root: HTMLElement, session: Session, ui: UiStore) => Hud;
