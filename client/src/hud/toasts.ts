import type { Tone } from './context';
import { el } from './dom';

/** How long a toast stays, in ms. */
export const TOAST_MS = 2600;
/** Older toasts give way so the stack never covers the planet. */
const MAX_TOASTS = 3;

export interface Toasts {
  readonly element: HTMLElement;
  show(text: string, tone: Tone): void;
  /** Drops toasts that have run their time. */
  update(): void;
}

export function createToasts(now: () => number): Toasts {
  const element = el('div', 'hud-toasts');
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  const live: { node: HTMLElement; until: number }[] = [];
  return {
    element,
    show(text, tone) {
      const node = el('div', `hud-toast hud-toast--${tone}`, text);
      element.append(node);
      live.push({ node, until: now() + TOAST_MS });
      while (live.length > MAX_TOASTS) live.shift()?.node.remove();
    },
    update() {
      const time = now();
      while (live.length > 0 && live[0].until <= time) live.shift()?.node.remove();
    },
  };
}
