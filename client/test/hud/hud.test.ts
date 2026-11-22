import { firstLevel, type GameEvent, type LevelDef, type Site } from '@engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Hud } from '../../src/contract';
import { createHud, createHudWith, type HudOptions } from '../../src/hud/hud';
import { HOLD_MS } from '../../src/hud/card';
import { TOAST_MS } from '../../src/hud/toasts';
import { FakeSession, FakeUi } from './fakes';

interface Setup {
  root: HTMLElement;
  session: FakeSession;
  ui: FakeUi;
  hud: Hud;
  frame(events?: GameEvent[]): void;
  one(selector: string): HTMLElement;
  btn(selector: string): HTMLButtonElement;
  all(selector: string): HTMLElement[];
  text(selector: string): string;
  setTime(ms: number): void;
  keys: EventTarget;
  press(key: string, init?: KeyboardEventInit): KeyboardEvent;
  /** The action ids on show, in grid order, with their hotkeys. */
  grid(): string[];
  cmd(action: string): HTMLButtonElement;
}

function setup(level: LevelDef = firstLevel, options: HudOptions = {}): Setup {
  const root = document.createElement('div');
  document.body.append(root);
  const session = new FakeSession(level);
  const ui = new FakeUi();
  let time = 0;
  const keys = new EventTarget();
  const hud = createHudWith(root, session, ui, { now: () => time, keys, ...options });
  const one = (selector: string): HTMLElement => {
    const node = root.querySelector(selector);
    if (!(node instanceof HTMLElement)) throw new Error(`missing ${selector}`);
    return node;
  };
  const all = (selector: string): HTMLElement[] =>
    Array.from(root.querySelectorAll(selector)).filter((node): node is HTMLElement => node instanceof HTMLElement);
  const setup: Setup = {
    root,
    session,
    ui,
    hud,
    frame: (events = []) => hud.update(session.game, events),
    one,
    all,
    btn(selector) {
      const node = one(selector);
      if (!(node instanceof HTMLButtonElement)) throw new Error(`${selector} is not a button`);
      return node;
    },
    text: (selector) => one(selector).textContent ?? '',
    setTime(ms) {
      time = ms;
    },
    keys,
    press(key, init = {}) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
      keys.dispatchEvent(event);
      return event;
    },
    grid: () =>
      all('.hud-cmd:not(.is-empty)').map(
        (node) => `${node.querySelector('.hud-cmd__key')?.textContent ?? ''}:${node.dataset.action ?? ''}`,
      ),
    cmd(action) {
      return setup.btn(`.hud-cmd[data-action="${action}"]`);
    },
  };
  setup.frame();
  return setup;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('top bar', () => {
  it('shows resources, population, power, wave countdown and reserves', () => {
    const { text, all } = setup();
    expect(text('.hud-stat--minerals .hud-stat__value')).toBe('220');
    expect(text('.hud-stat--science .hud-stat__value')).toBe('0');
    expect(text('.hud-stat--population .hud-stat__value')).toBe('100');
    expect(text('.hud-stat--population .hud-stat__sub')).toBe('/ 100');
    expect(text('.hud-stat--power .hud-stat__value')).toBe('0/0');
    expect(text('.hud-stat--wave .hud-stat__value')).toBe('1/8');
    expect(text('.hud-stat--wave .hud-stat__sub')).toBe('in 0:20');
    expect(all('.hud-reserve').map((chip) => chip.textContent)).toEqual(['Coal6k', 'Oil1.5k']);
  });

  it('leaves the DOM alone when nothing changed', () => {
    const { root, frame } = setup();
    const observer = new MutationObserver(() => undefined);
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
    frame();
    frame();
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it('warns about low population, short power, stored energy and exotics', () => {
    const { session, frame, one, text } = setup();
    const state = session.game.state;
    state.population = 20;
    state.exotics = 3;
    state.power = { generation: 10, demand: 30, factor: 0.33, stored: 200, capacity: 600 };
    frame();
    expect(one('.hud-stat--population').classList.contains('is-bad')).toBe(true);
    expect(one('.hud-stat--power').classList.contains('is-warn')).toBe(true);
    expect(text('.hud-stat--power .hud-stat__value')).toBe('10/30');
    expect(text('.hud-stat--power .hud-stat__sub')).toBe('200/600');
    expect(text('.hud-stat--science .hud-stat__sub')).toBe('3 exotic');
  });

  it('counts the asteroids left while a wave runs, and says when all are done', () => {
    const { session, frame, one, text } = setup();
    session.send({ type: 'startWave' });
    session.advance(2);
    frame();
    expect(one('.hud-stat--wave').classList.contains('is-active')).toBe(true);
    expect(text('.hud-stat--wave .hud-stat__sub')).toBe('4 left');
    session.game.state.wave = { ...session.game.state.wave, active: false, index: 8 };
    frame();
    expect(text('.hud-stat--wave .hud-stat__value')).toBe('8/8');
    expect(text('.hud-stat--wave .hud-stat__sub')).toBe('done');
  });

  it('keeps an exhausted reserve on show while a plant burns it, and hides the row when none matter', () => {
    const { session, frame, all, one } = setup();
    session.send({ type: 'build', structure: 'coalPlant', site: { kind: 'surface', slot: 0 } });
    session.game.state.reserves = { coal: 0, oil: 0 };
    frame();
    expect(all('.hud-reserve').map((chip) => chip.textContent)).toEqual(['Coal0']);
    session.game.state.structures = [];
    frame();
    expect(one('.hud-reserves').hidden).toBe(true);
  });
});

const surface = (slot: number): Site => ({ kind: 'surface', slot });
const disabled = (node: HTMLElement): boolean =>
  node.classList.contains('is-disabled') && node.getAttribute('aria-disabled') === 'true';
const pointer = (node: HTMLElement, type: string, pointerType = 'mouse') =>
  node.dispatchEvent(new PointerEvent(type, { pointerType, bubbles: true }));

describe('speed control', () => {
  it('sets the speed and marks the active one', () => {
    const { session, frame, btn } = setup();
    btn('[data-speed="4"]').click();
    frame();
    expect(session.speed).toBe(4);
    expect(btn('[data-speed="4"]').classList.contains('is-active')).toBe(true);
    expect(btn('[data-speed="4"]').getAttribute('aria-pressed')).toBe('true');
    expect(btn('[data-speed="1"]').getAttribute('aria-pressed')).toBe('false');
    btn('[data-speed="0"]').click();
    expect(session.speed).toBe(0);
  });
});

describe('command card: top level', () => {
  it('shows Call wave on W and Research on R, with a twelve-button grid', () => {
    const { grid, all, text, one } = setup();
    expect(all('.hud-cmd')).toHaveLength(12);
    expect(grid()).toEqual(['W:callWave', 'R:research']);
    expect(text('.hud-portrait__name')).toBe('Command');
    expect(text('.hud-portrait__text')).toBe('Tap a slot on the planet or in orbit to build there.');
    expect(one('.hud-console').dataset.page).toBe('main');
    expect(all('.hud-cmd')[1].getAttribute('aria-keyshortcuts')).toBe('W');
  });

  it('calls a wave early for the bonus the engine pays, then dims the button', () => {
    const { session, frame, cmd, all } = setup();
    expect(cmd('callWave').querySelector('.hud-cmd__cost')?.textContent).toBe('+20');
    cmd('callWave').click();
    expect(session.sent).toEqual([{ type: 'startWave' }]);
    expect(session.game.state.minerals).toBe(240);
    expect(all('.hud-toast').map((toast) => toast.textContent)).toEqual(['Wave called early · +20 minerals']);
    session.advance(1);
    frame();
    expect(disabled(cmd('callWave'))).toBe(true);
    cmd('callWave').click();
    expect(session.sent).toHaveLength(1);
    expect(all('.hud-toast--bad').map((toast) => toast.textContent)).toEqual(['A wave is already under way.']);
  });

  it('says the call went through without a bonus, and why it cannot call', () => {
    const { session, frame, cmd, all, press } = setup();
    session.game.state.wave.countdown = 5;
    frame();
    expect(cmd('callWave').querySelector('.hud-cmd__cost')?.textContent).toBe('');
    press('w');
    expect(all('.hud-toast').map((toast) => toast.textContent)).toEqual(['Wave called']);
    frame();
    expect(disabled(cmd('callWave'))).toBe(true);
    session.game.state.wave = { ...session.game.state.wave, active: false, index: 8 };
    cmd('callWave').click();
    session.game.state.wave = { ...session.game.state.wave, index: 0 };
    cmd('callWave').click();
    expect(all('.hud-toast--bad').map((toast) => toast.textContent)).toEqual([
      'No waves left to call.',
      'The wave is starting.',
    ]);
  });

  it('flags the Research button when a card is affordable', () => {
    const { session, frame, one } = setup();
    expect(one('[data-action="research"] .hud-cmd__alert').hidden).toBe(true);
    session.game.state.science = 1000;
    frame();
    expect(one('[data-action="research"] .hud-cmd__alert').hidden).toBe(false);
  });

  it('leaves the DOM alone when nothing changed', () => {
    const { root, frame, ui } = setup();
    ui.set({ selected: surface(0) });
    frame();
    const observer = new MutationObserver(() => undefined);
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
    frame();
    frame();
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });
});

describe('command card: building', () => {
  it('lists what fits an empty surface slot on Q W E R A, and builds in one click', () => {
    const { session, ui, frame, grid, cmd, text, one } = setup();
    ui.set({ selected: surface(0) });
    frame();
    expect(one('.hud-console').dataset.page).toBe('build');
    expect(text('.hud-portrait__name')).toBe('Surface slot 1');
    expect(text('.hud-portrait__sub')).toBe('Empty slot');
    expect(grid()).toEqual(['Q:build:battery', 'W:build:coalPlant', 'E:build:cannon', 'R:build:laser', 'A:build:lab', 'V:back']);
    expect(cmd('build:laser').querySelector('.hud-cmd__cost')?.textContent).toBe('60');
    expect(cmd('build:laser').querySelector('.hud-cmd__glyph')?.textContent).toBe('La');
    expect(cmd('build:laser').getAttribute('aria-label')).toBe('Laser, 60 minerals');

    cmd('build:laser').click();
    expect(session.sent).toEqual([{ type: 'build', structure: 'laser', site: surface(0) }]);
    expect(session.game.state.minerals).toBe(160);
    expect(session.game.structureAt(surface(0))?.def).toBe('laser');
    expect(ui.state.preview).toBeNull();
    // The card switches to the structure's actions straight away.
    expect(one('.hud-console').dataset.page).toBe('structure');
    expect(grid()).toEqual(['S:sell', 'D:toggle', 'V:back']);
    expect(text('.hud-portrait__name')).toBe('Laser');
    expect(text('.hud-portrait__live')).toBe('12 dps thermal · range 160 · draws 15');
    expect(cmd('sell').querySelector('.hud-cmd__cost')?.textContent).toBe('+30');
  });

  it('builds with the hotkey of the button, whatever its case', () => {
    const { session, ui, press } = setup();
    ui.set({ selected: surface(1) });
    const event = press('E');
    expect(event.defaultPrevented).toBe(true);
    expect(session.game.structureAt(surface(1))?.def).toBe('cannon');
    expect(press('k').defaultPrevented).toBe(false);
  });

  it('dims what cannot be paid, says why, and will not build it', () => {
    const { session, ui, frame, cmd, all } = setup();
    session.game.state.minerals = 35;
    ui.set({ selected: surface(0) });
    frame();
    expect(disabled(cmd('build:coalPlant'))).toBe(true);
    expect(disabled(cmd('build:battery'))).toBe(false);
    cmd('build:coalPlant').click();
    expect(session.sent).toEqual([]);
    expect(all('.hud-toast--bad').map((toast) => toast.textContent)).toEqual(['Need 5 more minerals']);
  });

  it('previews the range of the button under the pointer, and explains it in the tooltip', () => {
    const { session, ui, frame, cmd, one, text } = setup();
    session.game.state.minerals = 50;
    ui.set({ selected: surface(0) });
    frame();
    expect(one('.hud-tip').hidden).toBe(true);
    pointer(cmd('build:laser'), 'pointerenter');
    expect(ui.state.preview).toBe('laser');
    expect(one('.hud-tip').hidden).toBe(false);
    expect(text('.hud-tip__name')).toBe('Laser');
    expect(text('.hud-tip__key')).toBe('R');
    expect(text('.hud-tip__price')).toBe('60 minerals');
    expect(text('.hud-tip__kind')).toBe('Build');
    expect(text('.hud-tip__stats')).toBe('12 dps thermal · range 160 · draws 15');
    expect(text('.hud-tip__reason')).toBe('Need 10 more minerals');
    pointer(cmd('build:laser'), 'pointerleave');
    expect(ui.state.preview).toBeNull();
    expect(one('.hud-tip').hidden).toBe(true);

    // A preview someone else set is left alone.
    pointer(cmd('build:cannon'), 'pointerenter');
    ui.set({ preview: 'lab' });
    pointer(cmd('build:cannon'), 'pointerleave');
    expect(ui.state.preview).toBe('lab');
  });

  it('shows keyboard focus as a tooltip, but not focus from a click', () => {
    const { ui, frame, cmd, one, text } = setup();
    ui.set({ selected: surface(0) });
    frame();
    cmd('back').dispatchEvent(new FocusEvent('focus'));
    expect(text('.hud-tip__key')).toBe('Esc');
    cmd('back').dispatchEvent(new FocusEvent('blur'));
    expect(one('.hud-tip').hidden).toBe(true);
    pointer(cmd('build:lab'), 'pointerdown');
    cmd('build:lab').dispatchEvent(new FocusEvent('focus'));
    expect(one('.hud-tip').hidden).toBe(true);
  });

  it('on touch, a long press shows the details instead of building', () => {
    vi.useFakeTimers();
    try {
      const { session, ui, frame, cmd, one, text } = setup();
      ui.set({ selected: surface(0) });
      frame();
      const lab = cmd('build:lab');
      pointer(lab, 'pointerenter', 'touch');
      expect(one('.hud-tip').hidden).toBe(true);
      pointer(lab, 'pointerdown', 'touch');
      vi.advanceTimersByTime(HOLD_MS);
      expect(text('.hud-tip__name')).toBe('Lab');
      expect(ui.state.preview).toBe('lab');
      pointer(lab, 'pointerup', 'touch');
      lab.click();
      expect(session.sent).toEqual([]);
      expect(one('.hud-tip').hidden).toBe(true);

      // A short tap builds.
      pointer(lab, 'pointerdown', 'touch');
      vi.advanceTimersByTime(HOLD_MS / 2);
      pointer(lab, 'pointerup', 'touch');
      lab.click();
      expect(session.game.structureAt(surface(0))?.def).toBe('lab');
    } finally {
      vi.useRealTimers();
    }
  });

  it('forgets a long press the system cancelled', () => {
    vi.useFakeTimers();
    try {
      const { session, ui, frame, cmd } = setup();
      ui.set({ selected: surface(0) });
      frame();
      const battery = cmd('build:battery');
      pointer(battery, 'pointerdown', 'touch');
      vi.advanceTimersByTime(HOLD_MS);
      pointer(battery, 'pointercancel', 'touch');
      battery.click();
      expect(session.game.structureAt(surface(0))?.def).toBe('battery');
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers the dam on a water slot only once it is unlocked', () => {
    const { session, ui, frame, grid, text } = setup();
    ui.set({ selected: surface(2) });
    frame();
    expect(text('.hud-portrait__name')).toBe('Surface slot 3 · water');
    expect(grid()).not.toContain('Q:build:dam');
    session.game.state.unlocked.push('dam');
    frame();
    expect(grid().some((entry) => entry.endsWith('build:dam'))).toBe(true);
    ui.set({ selected: surface(0) });
    frame();
    expect(grid().some((entry) => entry.endsWith('build:dam'))).toBe(false);
  });

  it('dims everything on a full orbit and says why', () => {
    const { ui, frame, grid, cmd, text } = setup();
    ui.set({ selected: { kind: 'shell', shell: 0, slot: 2 } });
    frame();
    expect(text('.hud-portrait__name')).toBe('Orbit 1 · slot 3');
    expect(grid()).toEqual(['Q:build:battery', 'W:build:cannon', 'E:build:laser', 'V:back']);
    expect(disabled(cmd('build:battery'))).toBe(true);
    expect(text('.hud-portrait__live')).toBe('This orbit is full. Research opens more slots.');
  });

  it('says so when nothing fits the slot', () => {
    const { session, ui, frame, grid, text } = setup();
    session.game.state.unlocked = ['coalPlant'];
    ui.set({ selected: { kind: 'shell', shell: 1, slot: 0 } });
    frame();
    expect(grid()).toEqual(['V:back']);
    expect(text('.hud-portrait__text')).toBe('Nothing can be built here yet.');
  });

  it('grows a row without hotkeys when more fits than the grid holds', () => {
    const { session, ui, frame, grid, all } = setup();
    session.game.state.unlocked = Object.keys(session.game.structures());
    ui.set({ selected: surface(2) });
    frame();
    expect(all('.hud-cmd').filter((node) => !node.hidden)).toHaveLength(16);
    expect(grid().filter((entry) => entry.startsWith(':')).length).toBeGreaterThan(0);
    expect(grid()).toContain('V:back');
    ui.set({ selected: null });
    frame();
    expect(all('.hud-cmd').filter((node) => !node.hidden)).toHaveLength(12);
  });

  it('turns a built structure off and on, and sells it for the refund', () => {
    const { session, ui, frame, cmd, text, grid } = setup();
    session.send({ type: 'build', structure: 'cannon', site: surface(1) });
    session.sent = [];
    ui.set({ selected: surface(1) });
    frame();
    expect(text('.hud-portrait__live')).toBe('16/hit kinetic · range 150 · draws 5');
    expect(cmd('toggle').querySelector('.hud-cmd__glyph')?.textContent).toBe('Off');
    cmd('toggle').click();
    expect(session.game.structureAt(surface(1))?.enabled).toBe(false);
    expect(cmd('toggle').querySelector('.hud-cmd__glyph')?.textContent).toBe('On');
    expect(text('.hud-portrait__sub')).toBe('Surface slot 2 · Off');
    cmd('toggle').click();
    expect(session.game.structureAt(surface(1))?.enabled).toBe(true);

    const before = session.game.state.minerals;
    cmd('sell').click();
    expect(session.game.state.minerals).toBe(before + 25);
    expect(grid()[0]).toBe('Q:build:battery');
  });

  it('toasts when a sale fails because the structure is already gone', () => {
    const { session, ui, frame, cmd, all } = setup();
    session.send({ type: 'build', structure: 'lab', site: surface(3) });
    ui.set({ selected: surface(3), preview: 'lab' });
    frame();
    session.game.state.structures = [];
    cmd('sell').click();
    expect(ui.state.preview).toBe('lab');
    expect(all('.hud-toast').map((toast) => toast.textContent)).toEqual(['That structure is gone.']);
  });

  it('shows the effective stats after research changes a structure', () => {
    const { session, ui, frame, cmd, text } = setup();
    session.game.state.modifiers.push({ type: 'modify', structure: 'laser', stat: 'weapon.range', op: 'add', value: 40 });
    ui.set({ selected: surface(0) });
    frame();
    pointer(cmd('build:laser'), 'pointerenter');
    expect(text('.hud-tip__stats')).toBe('12 dps thermal · range 200 · draws 15');
  });

  it('deselects with Cancel, V or Escape', () => {
    const { ui, frame, cmd, press, grid } = setup();
    ui.set({ selected: surface(0) });
    frame();
    cmd('back').click();
    expect(ui.state).toEqual({ selected: null, preview: null });
    expect(grid()).toEqual(['W:callWave', 'R:research']);
    ui.set({ selected: surface(0) });
    press('v');
    expect(ui.state.selected).toBeNull();
    ui.set({ selected: surface(0) });
    expect(press('Escape').defaultPrevented).toBe(true);
    expect(ui.state.selected).toBeNull();
    press('Escape');
    expect(grid()).toEqual(['W:callWave', 'R:research']);
  });
});

describe('command card: research', () => {
  it('opens the dealt cards as buttons, says what is short, and researches in one click', () => {
    const { session, frame, cmd, grid, text, one, all } = setup();
    cmd('research').click();
    expect(one('.hud-console').dataset.page).toBe('research');
    const offer = session.game.state.offer;
    expect(grid()).toEqual([...offer.map((id, i) => `${'QWE'[i]}:tech:${id}`), 'V:back']);
    expect(text('.hud-portrait__name')).toBe('Research');
    expect(text('.hud-portrait__live')).toBe('0 science');

    const first = offer[0];
    const button = cmd(`tech:${first}`);
    expect(disabled(button)).toBe(true);
    expect(button.querySelector('.hud-cmd__cost')?.className).toContain('hud-cmd__cost--science');
    pointer(button, 'pointerenter');
    expect(text('.hud-tip__kind')).toMatch(/^(Energy|Weapons|Economy|Orbit)$/);
    expect(text('.hud-tip__text')).not.toBe('');
    expect(text('.hud-tip__price')).toMatch(/^\d+ science$/);
    expect(text('.hud-tip__reason')).toMatch(/^Need \d+ more science$/);
    button.click();
    expect(session.sent).toEqual([]);
    expect(all('.hud-toast--bad')).toHaveLength(1);

    session.game.state.science = 1000;
    frame();
    expect(disabled(cmd(`tech:${first}`))).toBe(false);
    cmd(`tech:${first}`).click();
    expect(session.sent).toEqual([{ type: 'research', tech: first }]);
    expect(session.game.state.techs).toEqual([first]);
    expect(grid().slice(0, -1).map((entry) => entry.split(':tech:')[1])).toEqual(session.game.state.offer);
  });

  it('researches with a hotkey and goes back with V or Escape', () => {
    const { session, press, grid } = setup();
    session.game.state.science = 1000;
    press('r');
    const first = session.game.state.offer[0];
    press('q');
    expect(session.game.state.techs).toEqual([first]);
    press('v');
    expect(grid()).toEqual(['W:callWave', 'R:research']);
    press('r');
    press('Escape');
    expect(grid()).toEqual(['W:callWave', 'R:research']);
  });

  it('gives way to a slot picked on the planet', () => {
    const { ui, frame, cmd, grid } = setup();
    cmd('research').click();
    ui.set({ selected: surface(4) });
    frame();
    expect(grid()[0]).toBe('Q:build:battery');
    ui.set({ selected: null });
    frame();
    expect(grid()).toEqual(['W:callWave', 'R:research']);
  });

  it('shows an open pool with its either/or notes, and says when nothing is left', () => {
    const level: LevelDef = { ...firstLevel, research: { pool: ['flakShells', 'railgun'], choices: 0 } };
    const { session, frame, cmd, grid, text } = setup(level);
    cmd('research').click();
    expect(grid()).toEqual(['Q:tech:flakShells', 'W:tech:railgun', 'V:back']);
    expect(cmd('tech:railgun').querySelector('.hud-cmd__glyph')?.textContent).toBe('Ra');
    expect(cmd('tech:flakShells').querySelector('.hud-cmd__glyph')?.textContent).toBe('FS');
    pointer(cmd('tech:railgun'), 'pointerenter');
    expect(text('.hud-tip__note')).toBe('Either/or: taking it locks its rival cards.');
    session.game.state.science = 500;
    session.game.state.minerals = 500;
    session.send({ type: 'research', tech: 'railgun' });
    frame();
    expect(grid()).toEqual(['V:back']);
    expect(text('.hud-portrait__sub')).toBe('No research left to take.');
  });
});

describe('hotkeys', () => {
  it('listens on the root window by default', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const session = new FakeSession();
    const ui = new FakeUi();
    createHudWith(root, session, ui, { now: () => 0 });
    ui.set({ selected: surface(0) });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    expect(session.game.structureAt(surface(0))?.def).toBe('battery');
  });

  it('leaves modified, repeated and typed keys alone, and keys after the game ends', () => {
    const { session, ui, root, press, keys } = setup();
    ui.set({ selected: surface(0) });
    press('q', { ctrlKey: true });
    press('q', { metaKey: true });
    press('q', { altKey: true });
    press('q', { repeat: true });
    keys.dispatchEvent(new Event('keydown'));
    const field = document.createElement('input');
    root.append(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    keys.dispatchEvent(Object.defineProperty(new KeyboardEvent('keydown', { key: 'q' }), 'target', { value: field }));
    session.game.state.status = 'lost';
    press('q');
    expect(session.sent).toEqual([]);
  });

  it('stops once the HUD is off the page', () => {
    const { session, ui, root, press } = setup();
    root.remove();
    ui.set({ selected: surface(0) });
    press('q');
    expect(session.sent).toEqual([]);
  });
});

describe('feedback', () => {
  it('toasts wave events and lets them expire, keeping at most three', () => {
    const { frame, all, setTime } = setup();
    frame([
      { type: 'waveStarted', wave: 0, bonus: 0 },
      { type: 'waveStarted', wave: 1, bonus: 12 },
      { type: 'spawned', id: 1, kind: 'rock' },
    ]);
    expect(all('.hud-toast').map((toast) => toast.textContent)).toEqual([
      'Wave 1 incoming',
      'Wave 2 incoming · +12 minerals',
    ]);
    frame([
      { type: 'waveCleared', wave: 1, reward: 80 },
      { type: 'waveCleared', wave: 2, reward: 100 },
    ]);
    expect(all('.hud-toast')).toHaveLength(3);
    expect(all('.hud-toast--good').map((toast) => toast.textContent)).toEqual([
      'Wave 2 cleared · +80 minerals',
      'Wave 3 cleared · +100 minerals',
    ]);
    setTime(TOAST_MS);
    frame();
    expect(all('.hud-toast')).toHaveLength(0);
  });
});

describe('end screen', () => {
  it('appears on loss with the stats, and Play again starts over on the top-level commands', () => {
    const { session, ui, frame, one, btn, text, all, cmd, grid } = setup();
    cmd('research').click();
    session.game.state.population = 0;
    session.advance(1);
    frame();
    expect(session.game.state.status).toBe('lost');
    expect(one('.hud-end').hidden).toBe(false);
    expect(text('.hud-end__title')).toBe('Planet lost');
    expect(text('.hud-end__sub')).toBe('Fell in wave 1 of 8.');
    expect(all('.hud-end__stats dd')[0].textContent).toBe('0 / 100');
    frame();

    btn('.hud-end__again').click();
    expect(session.restarts).toBe(1);
    expect(ui.state).toEqual({ selected: null, preview: null });
    frame();
    expect(one('.hud-end').hidden).toBe(true);
    expect(grid()).toEqual(['W:callWave', 'R:research']);
  });

  it('celebrates a win', () => {
    const { session, frame, one, text } = setup();
    session.game.state.status = 'won';
    frame();
    expect(one('.hud-end__card').classList.contains('is-won')).toBe(true);
    expect(text('.hud-end__title')).toBe('Planet saved');
    expect(text('.hud-end__sub')).toBe('All 8 waves held off.');
  });
});

describe('insets', () => {
  const box = (top: number, bottom: number, left: number, right: number) => ({
    top,
    bottom,
    left,
    right,
    height: bottom - top,
  });
  const layout = (bar: ReturnType<typeof box>, card: ReturnType<typeof box>) => (node: HTMLElement) =>
    node.classList.contains('hud-bar') ? bar : card;

  it('is zero where there is no layout', () => {
    const { hud } = setup();
    expect(hud.insets()).toEqual({ top: 0, bottom: 0, sheet: 0 });
  });

  it('counts a phone-width console along the bottom edge', () => {
    const { hud } = setup(firstLevel, {
      measure: layout(box(6, 70, 8, 382), box(600, 836, 8, 382)),
      viewportHeight: () => 844,
      viewportWidth: () => 390,
    });
    expect(hud.insets()).toEqual({ top: 70, bottom: 244, sheet: 244 });
  });

  it('ignores a console docked in a corner well clear of the orbits', () => {
    const { hud } = setup(firstLevel, {
      measure: layout(box(6, 70, 700, 1220), box(820, 1072, 1400, 1912)),
      viewportHeight: () => 1080,
      viewportWidth: () => 1920,
    });
    expect(hud.insets()).toEqual({ top: 70, bottom: 0, sheet: 0 });
  });

  it('counts a corner console that would cover the outer orbit', () => {
    const { hud } = setup(firstLevel, {
      measure: layout(box(6, 70, 320, 960), box(470, 712, 768, 1272)),
      viewportHeight: () => 720,
      viewportWidth: () => 1280,
    });
    expect(hud.insets()).toEqual({ top: 70, bottom: 250, sheet: 250 });
  });

  it('measures against the window when no viewport size is given', () => {
    const { hud } = setup(firstLevel, {
      measure: () => box(window.innerHeight - 50, window.innerHeight, 0, window.innerWidth),
    });
    expect(hud.insets()).toEqual({ top: window.innerHeight, bottom: 50, sheet: 50 });
  });

  it('builds through the contract factory with real timing and layout', () => {
    const root = document.createElement('div');
    const session = new FakeSession();
    const hud = createHud(root, session, new FakeUi());
    hud.update(session.game, [{ type: 'waveCleared', wave: 0, reward: 60 }]);
    expect(root.querySelectorAll('.hud-toast')).toHaveLength(1);
    expect(hud.insets()).toEqual({ top: 0, bottom: 0, sheet: 0 });
  });
});
