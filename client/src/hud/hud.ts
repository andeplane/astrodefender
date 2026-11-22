import type { Command, Game, GameEvent } from '@engine';
import { createCamera } from '../camera';
import type { CreateHud, Hud, Insets, Session, UiStore } from '../contract';
import { compact, errorText } from '../labels';
import { palette } from '../theme';
import { createCommandCard } from './card';
import type { HudContext, Tone } from './context';
import { createSpeedControl } from './controls';
import { el } from './dom';
import { createEndScreen } from './end';
import { createToasts } from './toasts';
import { createTopBar } from './topbar';

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
}

export interface HudOptions {
  /** Real time in ms, for toasts. */
  now?: () => number;
  /** Where an element sits on screen; injectable because a DOM without layout reports zeros. */
  measure?: (node: HTMLElement) => Box;
  viewportHeight?: () => number;
  viewportWidth?: () => number;
  /** Where the command card's hotkeys are listened for; defaults to the root's window. */
  keys?: EventTarget;
}

const measureRect = (node: HTMLElement): Box => node.getBoundingClientRect();

/** Room kept between the outer orbit and the command card, in CSS pixels. */
const ORBIT_CLEARANCE = 24;

/** Keys typed into a field are text, not commands. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function createHudWith(root: HTMLElement, session: Session, ui: UiStore, options: HudOptions = {}): Hud {
  const now = options.now ?? (() => performance.now());
  const measure = options.measure ?? measureRect;
  const viewportHeight = options.viewportHeight ?? (() => window.innerHeight);
  const viewportWidth = options.viewportWidth ?? (() => window.innerWidth);
  const keys = options.keys ?? root.ownerDocument.defaultView ?? root;

  const container = el('div', 'hud');
  // The colours come from the shared theme, so the panels match the canvas.
  for (const [name, value] of Object.entries(palette)) container.style.setProperty(`--hud-${name}`, value);

  const toasts = createToasts(now);
  const context: HudContext = {
    session,
    ui,
    send(command: Command) {
      const result = session.send(command);
      if (!result.ok) toasts.show(errorText(result.error), 'bad');
      return result.ok;
    },
    toast(text: string, tone: Tone = 'info') {
      toasts.show(text, tone);
    },
  };

  const top = el('div', 'hud-top');
  const bar = createTopBar(context);
  top.append(bar.element, toasts.element);

  const speed = createSpeedControl(context);
  const card = createCommandCard(context, [speed.element]);

  const end = createEndScreen(context, () => card.reset());
  container.append(top, card.element, end.element);
  root.append(container);

  const parts = [bar, speed, card, end];

  function report(events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'waveStarted') {
        const bonus = event.bonus >= 1 ? ` · +${compact(event.bonus)} minerals` : '';
        context.toast(`Wave ${event.wave + 1} incoming${bonus}`, 'info');
      } else if (event.type === 'waveCleared') {
        context.toast(`Wave ${event.wave + 1} cleared · +${compact(event.reward)} minerals`, 'good');
      }
    }
  }

  keys.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (!container.isConnected || typing(event.target)) return;
    if (session.game.state.status !== 'playing') return;
    if (card.key(event)) event.preventDefault();
  });

  /**
   * Whether the card, docked in a corner, leaves every orbit visible when the field takes the
   * whole height. Then it covers only empty space at the edge and need not shrink the field.
   */
  function clearOfOrbits(box: Box, topInset: number): boolean {
    const world = session.level.world;
    const camera = createCamera(world);
    camera.resize(viewportWidth(), viewportHeight(), { top: topInset, bottom: 0 });
    const centre = camera.toScreen({ x: 0, y: 0 });
    const outer = Math.max(world.planetRadius, ...world.shells.map((shell) => shell.radius));
    const reach = outer * camera.scale + ORBIT_CLEARANCE;
    const dx = Math.max(box.left - centre.x, 0, centre.x - box.right);
    const dy = Math.max(box.top - centre.y, 0, centre.y - box.bottom);
    return Math.hypot(dx, dy) > reach;
  }

  return {
    update(game: Game, events: GameEvent[]) {
      report(events);
      for (const part of parts) part.update(game);
      toasts.update();
    },
    insets(): Insets {
      const barBox = measure(bar.element);
      const cardBox = measure(card.element);
      const topInset = barBox.height > 0 ? Math.max(0, barBox.bottom) : 0;
      const covered = cardBox.height > 0 ? Math.max(0, viewportHeight() - cardBox.top) : 0;
      const bottom = covered > 0 && !clearOfOrbits(cardBox, topInset) ? covered : 0;
      return { top: topInset, bottom, sheet: bottom };
    },
  };
}

export const createHud: CreateHud = (root, session, ui) => createHudWith(root, session, ui);
