import type { GameState } from '@engine';
import type { Session } from '../contract';

/** The part of the Web Storage API the save uses, so tests can hand in a typed fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'astrodefender.save.v1';
/** Bump when the engine's state changes shape; older saves are then dropped, not loaded. */
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  seed: number;
  state: GameState;
}

/** Reads and writes the one saved game. Every storage call may throw or be missing; that is never fatal. */
export interface SaveStore {
  /** The saved game, or null when there is none or it is unreadable (which also clears it). */
  load(): SaveData | null;
  /** Saves a game that is still being played; returns whether it was written. */
  save(session: Session): boolean;
  clear(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A cheap shape check: enough to reject other versions, junk and finished games, not a full validation. */
function parse(raw: string): SaveData | null {
  const data: unknown = JSON.parse(raw);
  if (!isRecord(data) || data.version !== SAVE_VERSION) return null;
  const { seed, state } = data;
  if (typeof seed !== 'number' || !Number.isFinite(seed) || !isRecord(state)) return null;
  if (typeof state.tick !== 'number' || state.status !== 'playing') return null;
  if (!Array.isArray(state.structures) || !Array.isArray(state.asteroids) || !isRecord(state.wave)) return null;
  // The checks above are what the client relies on; the rest is the engine's own plain data.
  return { version: SAVE_VERSION, seed, state: state as unknown as GameState };
}

/** `storage` null means none is available (private mode, blocked site data); everything is then a no-op. */
export function createSaveStore(storage: StorageLike | null, key = SAVE_KEY): SaveStore {
  const clear = (): void => {
    try {
      storage?.removeItem(key);
    } catch {
      // Storage unavailable: nothing to clear.
    }
  };

  return {
    load() {
      if (!storage) return null;
      let raw: string | null;
      try {
        raw = storage.getItem(key);
      } catch {
        return null;
      }
      if (raw === null) return null;
      let data: SaveData | null = null;
      try {
        data = parse(raw);
      } catch {
        data = null;
      }
      if (!data) clear();
      return data;
    },
    save(session) {
      if (!storage || session.game.state.status !== 'playing') return false;
      const data: SaveData = { version: SAVE_VERSION, seed: session.seed, state: session.game.state };
      try {
        storage.setItem(key, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    },
    clear,
  };
}

/** The page's localStorage, or null when reading it throws. */
export function browserStorage(view: { readonly localStorage: Storage } | null | undefined): StorageLike | null {
  try {
    return view?.localStorage ?? null;
  } catch {
    return null;
  }
}
