import type { Insets, Session } from '../contract';
import { button, el } from '../hud/dom';
import { palette } from '../theme';
import type { SaveStore } from './save';

export interface MenuOptions {
  /** The menu's own layer; the title screen and the corner button go in here. */
  root: HTMLElement;
  session: Session;
  saves: SaveStore;
  /** Called after Continue or New game put a game in the session, e.g. to clear the selection. */
  onStart?: () => void;
  /** Where keys are listened for; defaults to the root's window. */
  keys?: EventTarget;
  /** How often a running game is saved, in ms of real time. */
  saveEvery?: number;
}

export interface Menu {
  /** True while the title screen is up; the frame loop must not advance the session then. */
  readonly open: boolean;
  show(): void;
  /** Resumes the game in the session. Does nothing before one was started or continued. */
  hide(): void;
  /** Called once per frame with real time in ms: saves the running game now and then. */
  update(now: number): void;
  /** Saves the running game right away, e.g. when the page is hidden. */
  flush(): void;
  /** Keeps the corner button just under what the HUD covers at the top. */
  place(insets: Insets): void;
  destroy(): void;
}

const HELP: [string, string][] = [
  ['Goal', 'TBD: keep the planet alive through every wave.'],
  ['Building', 'TBD: how to place power plants and defences.'],
  ['Research', 'TBD: how science unlocks new structures.'],
  ['Waves', 'TBD: what each wave brings and how to call one early.'],
];

/** The title screen with Continue, New game and How to play, plus a corner button to get back to it. */
export function createMenu(options: MenuOptions): Menu {
  const { root, session, saves, onStart, saveEvery = 5000 } = options;
  const keys = options.keys ?? root.ownerDocument.defaultView ?? root;

  /** Whether the session holds a game the player started or continued; until then it is a backdrop. */
  let playing = false;
  let isOpen = false;
  let lastSave = -Infinity;

  const layer = el('div', 'menu');
  for (const [name, value] of Object.entries(palette)) layer.style.setProperty(`--menu-${name}`, value);

  const corner = button('menu-corner', '☰', () => show());
  corner.setAttribute('aria-label', 'Menu');
  corner.title = 'Menu';

  const screen = el('div', 'menu-screen');
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-labelledby', 'menu-title');
  const title = el('h1', 'menu-title');
  title.id = 'menu-title';
  title.append(el('span', 'menu-title__top', 'Astro'), el('span', 'menu-title__bottom', 'Defender'));
  const tagline = el('p', 'menu-tagline', 'Hold the sky. Save the planet.');
  const continueBtn = button('menu-btn menu-btn--primary', 'Continue', () => resume());
  const newBtn = button('menu-btn', 'New game', () => start());
  const helpBtn = button('menu-btn menu-btn--quiet', 'How to play', () => openHelp());
  const buttons = el('nav', 'menu-buttons');
  buttons.setAttribute('aria-label', 'Main menu');
  buttons.append(continueBtn, newBtn, helpBtn);
  screen.append(title, tagline, buttons);

  const help = el('div', 'menu-help');
  help.hidden = true;
  const card = el('div', 'menu-help__card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'menu-help-title');
  const helpTitle = el('h2', 'menu-help__title', 'How to play');
  helpTitle.id = 'menu-help-title';
  card.append(helpTitle);
  for (const [heading, text] of HELP) {
    const section = el('section', 'menu-help__section');
    section.append(el('h3', '', heading), el('p', '', text));
    card.append(section);
  }
  const closeBtn = button('menu-btn menu-help__close', 'Close', () => closeHelp());
  card.append(closeBtn);
  help.append(card);
  help.addEventListener('click', (event) => {
    if (event.target === help) closeHelp();
  });

  layer.append(screen, help);
  root.append(corner, layer);

  const running = (): boolean => playing && session.game.state.status === 'playing';

  function refresh(): void {
    const canContinue = playing ? running() : saves.load() !== null;
    continueBtn.disabled = !canContinue;
    continueBtn.classList.toggle('menu-btn--primary', canContinue);
    newBtn.classList.toggle('menu-btn--primary', !canContinue);
    layer.classList.toggle('is-paused', playing);
    tagline.textContent = running() ? 'Paused' : 'Hold the sky. Save the planet.';
  }

  const enabled = (): HTMLButtonElement[] =>
    help.hidden ? [continueBtn, newBtn, helpBtn].filter((b) => !b.disabled) : [closeBtn];

  function focusFirst(): void {
    enabled()[0]?.focus();
  }

  function show(): void {
    if (isOpen) return;
    flush();
    isOpen = true;
    layer.hidden = false;
    corner.hidden = true;
    refresh();
    focusFirst();
  }

  function hide(): void {
    if (!isOpen || !running()) return;
    closeHelp(false);
    isOpen = false;
    layer.hidden = true;
    corner.hidden = false;
    corner.blur();
  }

  function begin(): void {
    playing = true;
    lastSave = -Infinity;
    onStart?.();
    hide();
  }

  function resume(): void {
    if (playing) {
      hide();
      return;
    }
    const data = saves.load();
    if (data) {
      try {
        session.load(data.state, data.seed);
        begin();
        return;
      } catch {
        saves.clear();
      }
    }
    refresh();
    focusFirst();
  }

  function start(): void {
    saves.clear();
    session.restart();
    begin();
  }

  function openHelp(): void {
    help.hidden = false;
    closeBtn.focus();
  }

  function closeHelp(refocus = true): void {
    if (help.hidden) return;
    help.hidden = true;
    if (refocus) helpBtn.focus();
  }

  function flush(): void {
    if (!playing) return;
    if (session.game.state.status === 'playing') saves.save(session);
    else saves.clear();
  }

  function move(step: number): void {
    const list = enabled();
    const active = root.ownerDocument.activeElement;
    const at = list.findIndex((node) => node === active);
    const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
    list[next]?.focus();
  }

  // Capture on the window, so the game's own shortcuts never see keys while the menu is up.
  const onKey = (event: Event): void => {
    if (!isOpen || !(event instanceof KeyboardEvent)) return;
    event.stopPropagation();
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        if (!help.hidden) closeHelp();
        else hide();
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        move(-1);
        break;
      case 'Tab':
        event.preventDefault();
        move(event.shiftKey ? -1 : 1);
        break;
      case 'Enter': {
        const active = root.ownerDocument.activeElement;
        if (active instanceof HTMLButtonElement && layer.contains(active) && !active.disabled) {
          // Prevented so the browser does not click it a second time.
          event.preventDefault();
          active.click();
        }
        break;
      }
    }
  };
  keys.addEventListener('keydown', onKey, true);

  show();

  return {
    get open() {
      return isOpen;
    },
    show,
    hide,
    update(now) {
      if (!playing || isOpen) return;
      if (session.game.state.status !== 'playing') {
        if (lastSave !== Infinity) saves.clear();
        lastSave = Infinity;
        return;
      }
      if (lastSave === Infinity) lastSave = now;
      if (now - lastSave >= saveEvery) {
        saves.save(session);
        lastSave = now;
      }
    },
    flush,
    place(insets) {
      corner.style.top = `${Math.round(insets.top + 8)}px`;
    },
    destroy() {
      keys.removeEventListener('keydown', onKey, true);
      corner.remove();
      layer.remove();
    },
  };
}
