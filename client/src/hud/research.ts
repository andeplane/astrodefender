import { coreTechs, type Cost, type Game, type TechDef } from '@engine';
import { humanize } from '../labels';
import type { HudContext, Part } from './context';
import { costText } from './describe';
import { button, classSetter, disabledSetter, el, hiddenSetter } from './dom';

/** A card's face. Content outside the core tree still shows, under its id. */
export function cardFace(id: string): { name: string; line: string; text: string } {
  const card = coreTechs[id];
  if (!card) return { name: humanize(id), line: '', text: '' };
  return { name: card.name, line: humanize(card.line), text: card.text };
}

/** The cards the player may pick from now: the dealt hand, or the whole open pool. */
export function cardsOnTable(game: Game): TechDef[] {
  return game.level.research?.choices ? game.state.offer.map((id) => game.content.techs[id]) : game.researchable();
}

export interface Research {
  /** The button in the control row, with a badge when a card is affordable. */
  toggle: Part;
  panel: Part;
  close(): void;
}

export function createResearch(context: HudContext): Research {
  const { ui } = context;
  let open = false;

  const toggleButton = button('hud-btn hud-research-btn', 'Research', () => setOpen(!open));
  const badge = el('span', 'hud-badge');
  badge.setAttribute('aria-label', 'A card is affordable');
  badge.hidden = true;
  toggleButton.append(badge);
  toggleButton.setAttribute('aria-expanded', 'false');
  const hideBadge = hiddenSetter(badge);
  const pressed = classSetter(toggleButton, 'is-active');

  const panel = el('section', 'hud-sheet hud-sheet--research');
  panel.setAttribute('aria-label', 'Research');
  panel.hidden = true;
  const head = el('header', 'hud-sheet__head');
  const closeButton = button('hud-btn hud-btn--ghost hud-sheet__close', '✕', () => setOpen(false));
  closeButton.setAttribute('aria-label', 'Close research');
  head.append(el('h2', 'hud-sheet__title', 'Research'), closeButton);
  const list = el('ul', 'hud-cards');
  panel.append(head, list);
  const hidePanel = hiddenSetter(panel);

  function setOpen(value: boolean): void {
    open = value;
    toggleButton.setAttribute('aria-expanded', String(open));
    // The slot sheet and the research panel share the bottom of the screen: one at a time.
    if (open && ui.state.selected) ui.set({ selected: null, preview: null });
  }
  ui.subscribe((state) => {
    if (state.selected && open) setOpen(false);
  });

  let key: string | null = null;
  let lastGame: Game | null = null;
  let cards: { cost: Cost; update: (affordable: boolean) => void }[] = [];

  function rebuild(game: Game, techs: TechDef[]): void {
    list.replaceChildren();
    if (techs.length === 0) list.append(el('li', 'hud-empty', 'No research left to take.'));
    cards = techs.map((tech) => {
      const face = cardFace(tech.id);
      const cost = game.techCost(tech);
      const item = el('li', 'hud-card');
      item.dataset.tech = tech.id;
      const top = el('div', 'hud-card__top');
      top.append(el('span', 'hud-card__name', face.name), el('span', 'hud-card__line', face.line));
      item.append(top, el('p', 'hud-card__text', face.text));
      if (tech.exclusive) item.append(el('p', 'hud-card__note', 'Either/or: taking it locks its rival cards.'));
      const take = button('hud-btn hud-btn--primary hud-card__take', `Research · ${costText(cost)}`, () => {
        context.send({ type: 'research', tech: tech.id });
      });
      item.append(take);
      list.append(item);
      const disable = disabledSetter(take);
      const short = classSetter(item, 'is-unaffordable');
      return {
        cost,
        update(affordable) {
          disable(!affordable);
          short(!affordable);
        },
      };
    });
  }

  return {
    toggle: {
      element: toggleButton,
      update(game) {
        const techs = cardsOnTable(game);
        const next = `${techs.map((tech) => tech.id).join(',')}|${game.state.techs.length}`;
        if (next !== key || game !== lastGame) {
          key = next;
          lastGame = game;
          rebuild(game, techs);
        }
        const affordable = cards.map((card) => game.canAfford(card.cost));
        cards.forEach((card, index) => card.update(affordable[index]));
        hideBadge(!affordable.includes(true));
        pressed(open);
      },
    },
    panel: {
      element: panel,
      update() {
        hidePanel(!open);
      },
    },
    close: () => setOpen(false),
  };
}
