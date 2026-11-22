import type { Command, Game } from '@engine';
import type { Session, UiStore } from '../contract';

export type Tone = 'info' | 'good' | 'bad';

/** What every part of the HUD shares: the session, the selection, and one way to send and report. */
export interface HudContext {
  readonly session: Session;
  readonly ui: UiStore;
  /** Sends a command and toasts the error when it fails. True when it went through. */
  send(command: Command): boolean;
  toast(text: string, tone?: Tone): void;
}

/** A piece of the HUD: built once, updated every frame. */
export interface Part {
  readonly element: HTMLElement;
  update(game: Game): void;
}
