import { Game, baseContent, firstLevel } from '@engine';
import { afterEach, describe, expect, it } from 'vitest';
import type { Session } from '../src/contract';
import { createMenu, type Menu } from '../src/menu/menu';
import {
  SAVE_KEY,
  SAVE_VERSION,
  browserStorage,
  createSaveStore,
  type SaveStore,
  type StorageLike,
} from '../src/menu/save';
import { createSession } from '../src/session';
import { FakeSession } from './hud/fakes';

/** An in-memory Storage that can be told to fail, like a browser with blocked site data. */
class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();
  failGet = false;
  failSet = false;
  failRemove = false;

  getItem(key: string): string | null {
    if (this.failGet) throw new Error('blocked');
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error('quota');
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failRemove) throw new Error('blocked');
    this.items.delete(key);
  }
}

const makeSession = (seed = 3) => createSession({ content: baseContent, level: firstLevel, seed });

function savedGame(storage: FakeStorage, seed = 21, ticks = 4): Game {
  const game = new Game(baseContent, firstLevel, seed);
  for (let i = 0; i < ticks; i++) game.tick();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, seed, state: game.state }));
  return game;
}

describe('save store', () => {
  it('round-trips a running game', () => {
    const storage = new FakeStorage();
    const saves = createSaveStore(storage);
    const session = makeSession(8);
    session.advance(100);
    expect(saves.save(session)).toBe(true);
    const data = saves.load();
    expect(data?.seed).toBe(8);
    expect(data?.version).toBe(SAVE_VERSION);
    expect(data?.state).toEqual(session.game.state);
    saves.clear();
    expect(saves.load()).toBeNull();
  });

  it('does not save a finished game', () => {
    const storage = new FakeStorage();
    const session = makeSession();
    session.game.state.status = 'lost';
    expect(createSaveStore(storage).save(session)).toBe(false);
    expect(storage.items.size).toBe(0);
  });

  it.each([
    ['junk', 'not json'],
    ['another version', JSON.stringify({ version: SAVE_VERSION + 1, seed: 1, state: {} })],
    ['a missing seed', JSON.stringify({ version: SAVE_VERSION, state: {} })],
    ['a missing state', JSON.stringify({ version: SAVE_VERSION, seed: 1 })],
    ['a finished game', JSON.stringify({ version: SAVE_VERSION, seed: 1, state: { tick: 1, status: 'won' } })],
    [
      'a state without its lists',
      JSON.stringify({ version: SAVE_VERSION, seed: 1, state: { tick: 1, status: 'playing', structures: [] } }),
    ],
    ['null', 'null'],
  ])('treats %s as no save and clears it', (_label, raw) => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, raw);
    expect(createSaveStore(storage).load()).toBeNull();
    expect(storage.items.has(SAVE_KEY)).toBe(false);
  });

  it('works without storage, or when every storage call throws', () => {
    const none = createSaveStore(null);
    expect(none.load()).toBeNull();
    expect(none.save(makeSession())).toBe(false);
    none.clear();

    const storage = new FakeStorage();
    savedGame(storage);
    storage.failGet = true;
    storage.failSet = true;
    storage.failRemove = true;
    const saves = createSaveStore(storage);
    expect(saves.load()).toBeNull();
    expect(saves.save(makeSession())).toBe(false);
    expect(() => saves.clear()).not.toThrow();
  });

  it('finds the browser storage, or none when reading it throws', () => {
    const storage = window.localStorage;
    expect(browserStorage({ localStorage: storage })).toBe(storage);
    expect(browserStorage(null)).toBeNull();
    const blocked = {
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
    };
    expect(browserStorage(blocked)).toBeNull();
  });
});

const menus: Menu[] = [];
afterEach(() => {
  while (menus.length) menus.pop()?.destroy();
  document.body.replaceChildren();
});

function setup(options: { storage?: FakeStorage; session?: Session; saves?: SaveStore } = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const storage = options.storage ?? new FakeStorage();
  const session = options.session ?? makeSession();
  const saves = options.saves ?? createSaveStore(storage);
  let starts = 0;
  const menu = createMenu({ root, session, saves, onStart: () => starts++, saveEvery: 1000 });
  menus.push(menu);
  const find = (text: string): HTMLButtonElement => {
    const found = [...root.querySelectorAll('button')].find((b) => b.textContent === text);
    if (!found) throw new Error(`no button ${text}`);
    return found;
  };
  const layer = root.querySelector<HTMLElement>('.menu');
  const help = root.querySelector<HTMLElement>('.menu-help');
  const corner = root.querySelector<HTMLButtonElement>('.menu-corner');
  if (!layer || !help || !corner) throw new Error('menu parts missing');
  return { root, storage, session, saves, menu, find, layer, help, corner, starts: () => starts };
}

const press = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
};

describe('main menu', () => {
  it('opens on load with the title, Continue disabled without a save and New game focused', () => {
    const { root, menu, find, layer, corner } = setup();
    expect(menu.open).toBe(true);
    expect(layer.hidden).toBe(false);
    expect(corner.hidden).toBe(true);
    expect(root.querySelector('h1')?.textContent).toBe('AstroDefender');
    expect(find('Continue').disabled).toBe(true);
    expect(find('New game').classList.contains('menu-btn--primary')).toBe(true);
    expect(document.activeElement).toBe(find('New game'));
    expect(layer.style.getPropertyValue('--menu-sky')).not.toBe('');
  });

  it('cannot be closed before a game is chosen', () => {
    const { menu, layer } = setup();
    press('Escape');
    menu.hide();
    expect(menu.open).toBe(true);
    expect(layer.hidden).toBe(false);
  });

  it('continues the saved game', () => {
    const storage = new FakeStorage();
    const saved = savedGame(storage, 21, 4);
    const { menu, session, find, layer, corner, starts } = setup({ storage });
    const continueBtn = find('Continue');
    expect(continueBtn.disabled).toBe(false);
    expect(document.activeElement).toBe(continueBtn);
    continueBtn.click();
    expect(menu.open).toBe(false);
    expect(layer.hidden).toBe(true);
    expect(corner.hidden).toBe(false);
    expect(session.seed).toBe(21);
    expect(session.game.state).toEqual(saved.state);
    expect(starts()).toBe(1);
  });

  it('starts fresh with New game and replaces the save', () => {
    const storage = new FakeStorage();
    savedGame(storage, 21, 4);
    const { menu, session, find, starts } = setup({ storage, session: makeSession(40) });
    find('New game').click();
    expect(menu.open).toBe(false);
    expect(storage.items.has(SAVE_KEY)).toBe(false);
    expect(session.seed).toBe(41);
    expect(session.game.state.tick).toBe(0);
    expect(starts()).toBe(1);
    menu.update(0);
    expect(JSON.parse(storage.items.get(SAVE_KEY) ?? 'null')).toMatchObject({ seed: 41 });
  });

  it('drops a save the session cannot load and stays open', () => {
    const storage = new FakeStorage();
    savedGame(storage);
    const session = new FakeSession();
    session.load = () => {
      throw new Error('incompatible');
    };
    const { menu, find } = setup({ storage, session });
    find('Continue').click();
    expect(menu.open).toBe(true);
    expect(storage.items.has(SAVE_KEY)).toBe(false);
    expect(find('Continue').disabled).toBe(true);
    expect(document.activeElement).toBe(find('New game'));
  });

  it('keeps Continue harmless when the save vanished after the menu opened', () => {
    const storage = new FakeStorage();
    savedGame(storage);
    const { menu, find } = setup({ storage });
    storage.items.clear();
    find('Continue').click();
    expect(menu.open).toBe(true);
    expect(find('Continue').disabled).toBe(true);
  });

  it('pauses from the corner button and resumes the game in memory', () => {
    const { menu, session, find, corner, layer, storage } = setup();
    find('New game').click();
    session.advance(500);
    const game = session.game;
    corner.click();
    expect(menu.open).toBe(true);
    expect(layer.classList.contains('is-paused')).toBe(true);
    expect(root().querySelector('.menu-tagline')?.textContent).toBe('Paused');
    // Opening saves right away.
    expect(JSON.parse(storage.items.get(SAVE_KEY) ?? 'null')).toMatchObject({ state: { tick: game.state.tick } });
    expect(document.activeElement).toBe(find('Continue'));
    find('Continue').click();
    expect(menu.open).toBe(false);
    expect(session.game).toBe(game);
    menu.show();
    press('Escape');
    expect(menu.open).toBe(false);
    menu.show();
    menu.show();
    expect(menu.open).toBe(true);
  });

  it('keeps the game keys from reaching the game while open', () => {
    const { find } = setup();
    let reached = 0;
    const listener = () => reached++;
    window.addEventListener('keydown', listener);
    press('n');
    press(' ');
    window.removeEventListener('keydown', listener);
    expect(reached).toBe(0);
    find('New game').click();
    window.addEventListener('keydown', listener);
    press('n');
    window.removeEventListener('keydown', listener);
    expect(reached).toBe(1);
  });

  it('moves focus with arrows and Tab and activates with Enter', () => {
    const storage = new FakeStorage();
    savedGame(storage);
    const { menu, find } = setup({ storage });
    expect(document.activeElement).toBe(find('Continue'));
    press('ArrowDown');
    expect(document.activeElement).toBe(find('New game'));
    press('ArrowRight');
    expect(document.activeElement).toBe(find('How to play'));
    press('Tab');
    expect(document.activeElement).toBe(find('Continue'));
    press('ArrowUp');
    expect(document.activeElement).toBe(find('How to play'));
    press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(find('New game'));
    press('ArrowLeft');
    expect(document.activeElement).toBe(find('Continue'));
    (document.activeElement instanceof HTMLElement ? document.activeElement : null)?.blur();
    press('ArrowDown');
    expect(document.activeElement).toBe(find('Continue'));
    (document.activeElement instanceof HTMLElement ? document.activeElement : null)?.blur();
    press('ArrowUp');
    expect(document.activeElement).toBe(find('How to play'));
    press('ArrowUp');
    const enter = press('Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(menu.open).toBe(false);
  });

  it('ignores Enter when nothing in the menu is focused', () => {
    const { menu } = setup();
    (document.activeElement instanceof HTMLElement ? document.activeElement : null)?.blur();
    const enter = press('Enter');
    expect(enter.defaultPrevented).toBe(false);
    expect(menu.open).toBe(true);
  });

  it('opens How to play and closes it with Close, Escape and the backdrop', () => {
    const { find, help, menu } = setup();
    const helpBtn = find('How to play');
    helpBtn.click();
    expect(help.hidden).toBe(false);
    expect(help.textContent).toContain('Goal');
    expect(help.textContent).toContain('Waves');
    expect(document.activeElement).toBe(find('Close'));
    press('ArrowDown');
    expect(document.activeElement).toBe(find('Close'));
    find('Close').click();
    expect(help.hidden).toBe(true);
    expect(document.activeElement).toBe(helpBtn);

    helpBtn.click();
    press('Escape');
    expect(help.hidden).toBe(true);
    expect(menu.open).toBe(true);

    helpBtn.click();
    help.querySelector('.menu-help__card')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(help.hidden).toBe(false);
    help.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(help.hidden).toBe(true);
  });

  it('closes How to play when the menu resumes', () => {
    const { find, help, menu } = setup();
    find('New game').click();
    menu.show();
    find('How to play').click();
    menu.hide();
    expect(help.hidden).toBe(true);
    expect(menu.open).toBe(false);
  });

  it('autosaves on an interval while playing, not while the menu is open', () => {
    const { find, menu, storage, session } = setup();
    menu.update(0);
    expect(storage.items.size).toBe(0);
    find('New game').click();
    menu.update(100);
    const first = storage.items.get(SAVE_KEY);
    expect(first).toBeDefined();
    session.advance(200);
    menu.update(600);
    expect(storage.items.get(SAVE_KEY)).toBe(first);
    menu.update(1100);
    expect(storage.items.get(SAVE_KEY)).not.toBe(first);
    menu.show();
    storage.items.clear();
    menu.update(5000);
    expect(storage.items.size).toBe(0);
  });

  it('clears the save when the game ends and saves again after a restart', () => {
    const { find, menu, storage, session } = setup();
    find('New game').click();
    menu.update(0);
    expect(storage.items.has(SAVE_KEY)).toBe(true);
    session.game.state.status = 'lost';
    menu.update(10);
    expect(storage.items.has(SAVE_KEY)).toBe(false);
    storage.setItem('other', 'x');
    menu.update(20);
    expect(storage.items.has('other')).toBe(true);
    menu.flush();
    expect(storage.items.has(SAVE_KEY)).toBe(false);

    // The end screen's Play again restarts the session in place.
    session.restart();
    menu.update(30);
    expect(storage.items.has(SAVE_KEY)).toBe(false);
    menu.update(1030);
    expect(storage.items.has(SAVE_KEY)).toBe(true);
  });

  it('cannot Continue a finished game from the pause menu', () => {
    const { find, menu, session } = setup();
    find('New game').click();
    session.game.state.status = 'won';
    menu.show();
    expect(find('Continue').disabled).toBe(true);
    press('Escape');
    expect(menu.open).toBe(true);
  });

  it('flushes nothing before a game is chosen', () => {
    const storage = new FakeStorage();
    const { menu } = setup({ storage });
    menu.flush();
    expect(storage.items.size).toBe(0);
  });

  it('places the corner button under the HUD top bar', () => {
    const { menu, corner } = setup();
    menu.place({ top: 61.6, bottom: 0 });
    expect(corner.style.top).toBe('70px');
  });

  it('stops listening for keys once destroyed', () => {
    const { menu, root: rootNode } = setup();
    menu.destroy();
    menus.length = 0;
    let reached = 0;
    const listener = () => reached++;
    window.addEventListener('keydown', listener);
    press('n');
    window.removeEventListener('keydown', listener);
    expect(reached).toBe(1);
    expect(rootNode.children).toHaveLength(0);
  });
});

function root(): HTMLElement {
  const found = document.querySelector<HTMLElement>('.menu');
  if (!found) throw new Error('no menu');
  return found;
}
