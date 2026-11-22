import type { Game } from '@engine';
import { compact } from '../labels';
import type { HudContext, Part } from './context';
import { button, el, hiddenSetter } from './dom';

/** The result of a finished game and a way to play again. */
export function createEndScreen(context: HudContext, onRestart: () => void): Part {
  const element = el('div', 'hud-end');
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  const card = el('div', 'hud-end__card');
  element.append(card);
  const hide = hiddenSetter(element);
  let shown: Game | null = null;

  function fill(game: Game): void {
    const { state, level } = game;
    const won = state.status === 'won';
    card.replaceChildren();
    card.classList.toggle('is-won', won);
    card.append(
      el('h2', 'hud-end__title', won ? 'Planet saved' : 'Planet lost'),
      el(
        'p',
        'hud-end__sub',
        won
          ? `All ${level.waves.length} waves held off.`
          : `Fell in wave ${Math.min(state.wave.index + 1, level.waves.length)} of ${level.waves.length}.`,
      ),
    );
    const stats = el('dl', 'hud-end__stats');
    const rows: [string, string][] = [
      ['Population left', `${Math.ceil(state.population)} / ${level.start.population}`],
      ['Asteroids destroyed', String(state.stats.destroyed)],
      ['Burnt up', String(state.stats.burnt)],
      ['Impacts', String(state.stats.impacts)],
      ['Minerals earned', compact(state.stats.mineralsEarned)],
      ['Research taken', String(state.techs.length)],
    ];
    for (const [label, value] of rows) stats.append(el('dt', '', label), el('dd', '', value));
    card.append(
      stats,
      button('hud-btn hud-btn--primary hud-end__again', 'Play again', () => {
        context.session.restart();
        context.ui.set({ selected: null, preview: null });
        onRestart();
      }),
    );
  }

  return {
    element,
    update(game) {
      const over = game.state.status !== 'playing';
      hide(!over);
      if (over && shown !== game) {
        shown = game;
        fill(game);
      }
      if (!over) shown = null;
    },
  };
}
