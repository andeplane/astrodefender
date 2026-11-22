import type { Command, Game, GameEvent } from '@engine';
import type { CreateHud, Hud, Session, UiStore } from '../contract';
import { compact, errorText } from '../labels';
import { palette } from '../theme';
import type { HudContext, Tone } from './context';
import { createCallWave, createSpeedControl } from './controls';
import { el } from './dom';
import { createEndScreen } from './end';
import { createResearch } from './research';
import { createSlotSheet } from './sheet';
import { createToasts } from './toasts';
import { createTopBar } from './topbar';

export interface Box {
  top: number;
  bottom: number;
  height: number;
}

export interface HudOptions {
  /** Real time in ms, for toasts. */
  now?: () => number;
  /** Where an element sits on screen; injectable because a DOM without layout reports zeros. */
  measure?: (node: HTMLElement) => Box;
  viewportHeight?: () => number;
}

const measureRect = (node: HTMLElement): Box => node.getBoundingClientRect();

export function createHudWith(root: HTMLElement, session: Session, ui: UiStore, options: HudOptions = {}): Hud {
  const now = options.now ?? (() => performance.now());
  const measure = options.measure ?? measureRect;
  const viewportHeight = options.viewportHeight ?? (() => window.innerHeight);

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

  const sheet = createSlotSheet(context);
  const research = createResearch(context);
  const speed = createSpeedControl(context);
  const callWave = createCallWave(context);
  const controls = el('div', 'hud-controls');
  controls.append(speed.element, research.toggle.element, callWave.element);
  const bottom = el('div', 'hud-bottom');
  bottom.append(sheet.element, research.panel.element, controls);

  const end = createEndScreen(context, () => research.close());
  container.append(top, bottom, end.element);
  root.append(container);

  const parts = [bar, sheet, research.toggle, research.panel, speed, callWave, end];

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

  return {
    update(game: Game, events: GameEvent[]) {
      report(events);
      for (const part of parts) part.update(game);
      toasts.update();
    },
    insets() {
      const barBox = measure(bar.element);
      const controlsBox = measure(controls);
      return {
        top: barBox.height > 0 ? Math.max(0, barBox.bottom) : 0,
        bottom: controlsBox.height > 0 ? Math.max(0, viewportHeight() - controlsBox.top) : 0,
      };
    },
  };
}

export const createHud: CreateHud = (root, session, ui) => createHudWith(root, session, ui);
