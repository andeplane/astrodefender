import type { Site } from '@engine';
import type { CreateUiStore, UiState } from './contract';

export function sameSite(a: Site | null, b: Site | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind || a.slot !== b.slot) return false;
  return a.kind === 'surface' || (b.kind === 'shell' && a.shell === b.shell);
}

export const createUiStore: CreateUiStore = () => {
  let state: UiState = { selected: null, preview: null };
  const listeners = new Set<(state: UiState) => void>();
  return {
    get state() {
      return state;
    },
    set(patch) {
      const next: UiState = { ...state, ...patch };
      // Sites are compared by value: input builds a fresh object on every tap.
      if (sameSite(next.selected, state.selected) && next.preview === state.preview) return;
      state = next;
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
