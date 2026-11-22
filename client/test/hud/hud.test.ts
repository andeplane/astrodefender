import { firstLevel, type GameEvent, type LevelDef } from '@engine';
import { afterEach, describe, expect, it } from 'vitest';
import type { Hud } from '../../src/contract';
import { createHud, createHudWith, type HudOptions } from '../../src/hud/hud';
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
}

function setup(level: LevelDef = firstLevel, options: HudOptions = {}): Setup {
  const root = document.createElement('div');
  document.body.append(root);
  const session = new FakeSession(level);
  const ui = new FakeUi();
  let time = 0;
  const hud = createHudWith(root, session, ui, { now: () => time, ...options });
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

describe('controls', () => {
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

  it('calls a wave early for the bonus the engine pays, then hides the button', () => {
    const { session, frame, btn, text, all } = setup();
    expect(text('.hud-call__bonus')).toBe('+20');
    btn('.hud-call').click();
    expect(session.sent).toEqual([{ type: 'startWave' }]);
    expect(session.game.state.minerals).toBe(240);
    expect(all('.hud-toast').map((toast) => toast.textContent)).toEqual(['Wave called early · +20 minerals']);
    frame();
    expect(btn('.hud-call').hidden).toBe(true);
  });

  it('says the call went through without a bonus when there is none to pay', () => {
    const { session, frame, btn, text, all } = setup();
    session.game.state.wave.countdown = 5;
    frame();
    expect(text('.hud-call__bonus')).toBe('');
    btn('.hud-call').click();
    expect(all('.hud-toast').map((toast) => toast.textContent)).toEqual(['Wave called']);
  });

  it('toasts a failed command in plain words', () => {
    const { session, btn, all } = setup();
    session.game.state.wave.active = true;
    btn('.hud-call').click();
    expect(all('.hud-toast--bad').map((toast) => toast.textContent)).toEqual(['A wave is already under way.']);
  });
});

describe('slot sheet', () => {
  const surface = (slot: number) => ({ kind: 'surface' as const, slot });

  it('is hidden with nothing selected', () => {
    const { one } = setup();
    expect(one('.hud-sheet--slot').hidden).toBe(true);
  });

  it('lists what the first level can build on an empty surface slot and builds in two taps', () => {
    const { session, ui, frame, one, btn, all, text } = setup();
    ui.set({ selected: surface(0) });
    frame();
    expect(one('.hud-sheet--slot').hidden).toBe(false);
    expect(text('.hud-sheet--slot .hud-sheet__title')).toBe('Surface slot 1');
    const ids = all('.hud-item').map((item) => item.dataset.structure);
    expect(ids).toEqual(['battery', 'coalPlant', 'cannon', 'laser', 'lab']);
    expect(text('[data-structure="laser"] .hud-item__stats')).toBe('12 dps thermal · range 160 · draws 15');
    expect(btn('.hud-build').disabled).toBe(true);
    expect(text('.hud-sheet__hint')).toBe('Pick a structure to see its range.');

    btn('[data-structure="laser"]').click();
    expect(ui.state.preview).toBe('laser');
    frame();
    expect(one('[data-structure="laser"]').classList.contains('is-chosen')).toBe(true);
    expect(btn('.hud-build').disabled).toBe(false);
    expect(text('.hud-build')).toBe('Build Laser · 60');

    btn('.hud-build').click();
    expect(session.sent).toEqual([{ type: 'build', structure: 'laser', site: surface(0) }]);
    expect(session.game.state.minerals).toBe(160);
    expect(session.game.structureAt(surface(0))?.def).toBe('laser');
    expect(ui.state.preview).toBeNull();
    frame();
    expect(text('.hud-detail__name')).toBe('Laser');
    expect(text('.hud-sell')).toBe('Sell +30');
  });

  it('marks what cannot be paid and will not build it', () => {
    const { session, ui, frame, one, btn, text } = setup();
    session.game.state.minerals = 35;
    ui.set({ selected: surface(0), preview: 'coalPlant' });
    frame();
    expect(one('[data-structure="coalPlant"]').classList.contains('is-unaffordable')).toBe(true);
    expect(text('[data-structure="coalPlant"] .hud-item__reason')).toBe('Need 5 more minerals');
    expect(one('[data-structure="battery"]').classList.contains('is-unaffordable')).toBe(false);
    expect(btn('.hud-build').disabled).toBe(true);
    expect(text('.hud-sheet__hint')).toBe('Not enough minerals yet.');
  });

  it('does nothing when Build is pressed with the choice gone', () => {
    const { session, ui, frame, btn } = setup();
    ui.set({ selected: surface(0), preview: 'laser' });
    frame();
    ui.set({ preview: null });
    btn('.hud-build').click();
    expect(session.sent).toEqual([]);
  });

  it('offers the dam on a water slot only once it is unlocked', () => {
    const { session, ui, frame, all, text } = setup();
    ui.set({ selected: surface(2) });
    frame();
    expect(text('.hud-sheet--slot .hud-sheet__title')).toBe('Surface slot 3 · water');
    expect(all('.hud-item').map((item) => item.dataset.structure)).not.toContain('dam');
    session.game.state.unlocked.push('dam');
    frame();
    expect(all('.hud-item').map((item) => item.dataset.structure)).toContain('dam');
    expect(text('[data-structure="dam"] .hud-item__stats')).toBe('+30 power');
    ui.set({ selected: surface(0) });
    frame();
    expect(all('.hud-item').map((item) => item.dataset.structure)).not.toContain('dam');
  });

  it('names an orbit slot and says when the shell is full', () => {
    const { ui, frame, all, btn, text } = setup();
    ui.set({ selected: { kind: 'shell', shell: 0, slot: 2 }, preview: 'laser' });
    frame();
    expect(text('.hud-sheet--slot .hud-sheet__title')).toBe('Orbit 1 · slot 3');
    expect(all('.hud-item').map((item) => item.dataset.structure)).toEqual(['battery', 'cannon', 'laser']);
    expect(btn('.hud-build').disabled).toBe(true);
    expect(text('.hud-sheet__hint')).toBe('This orbit is full. Research opens more slots.');
  });

  it('says so when nothing fits the slot', () => {
    const { session, ui, frame, text } = setup();
    session.game.state.unlocked = ['coalPlant'];
    ui.set({ selected: { kind: 'shell', shell: 1, slot: 0 } });
    frame();
    expect(text('.hud-empty')).toBe('Nothing can be built here yet.');
  });

  it('turns a built structure off and on, sells it for the refund and closes', () => {
    const { session, ui, frame, btn, text, all, one } = setup();
    session.send({ type: 'build', structure: 'cannon', site: surface(1) });
    session.sent = [];
    ui.set({ selected: surface(1) });
    frame();
    expect(text('.hud-detail__stats')).toBe('16/hit kinetic · range 150 · draws 5');
    expect(text('.hud-toggle')).toBe('Turn off');
    btn('.hud-toggle').click();
    frame();
    expect(session.game.structureAt(surface(1))?.enabled).toBe(false);
    expect(text('.hud-toggle')).toBe('Turn on');
    expect(all('.hud-detail__off')).toHaveLength(1);
    btn('.hud-toggle').click();
    expect(session.game.structureAt(surface(1))?.enabled).toBe(true);
    frame();

    const before = session.game.state.minerals;
    btn('.hud-sell').click();
    expect(session.game.state.minerals).toBe(before + 25);
    frame();
    expect(all('.hud-item').length).toBeGreaterThan(0);

    btn('.hud-sheet--slot .hud-sheet__close').click();
    expect(ui.state).toEqual({ selected: null, preview: null });
    frame();
    expect(one('.hud-sheet--slot').hidden).toBe(true);
  });

  it('shows the effective stats after research changes a structure', () => {
    const { session, ui, frame, text } = setup();
    session.game.state.modifiers.push({
      type: 'modify',
      structure: 'laser',
      stat: 'weapon.range',
      op: 'add',
      value: 40,
    });
    ui.set({ selected: surface(0) });
    frame();
    expect(text('[data-structure="laser"] .hud-item__stats')).toBe('12 dps thermal · range 200 · draws 15');
  });

  it('toasts when a sale fails because the structure is already gone', () => {
    const { session, ui, frame, btn, all } = setup();
    session.send({ type: 'build', structure: 'lab', site: surface(3) });
    ui.set({ selected: surface(3), preview: 'lab' });
    frame();
    session.game.state.structures = [];
    btn('.hud-sell').click();
    expect(ui.state.preview).toBe('lab');
    expect(all('.hud-toast').map((toast) => toast.textContent)).toEqual(['That structure is gone.']);
  });
});

describe('research', () => {
  it('opens the dealt cards, flags an affordable one and researches it', () => {
    const { session, ui, frame, one, btn, all } = setup();
    expect(one('.hud-badge').hidden).toBe(true);
    expect(one('.hud-sheet--research').hidden).toBe(true);
    ui.set({ selected: { kind: 'surface', slot: 0 } });
    btn('.hud-research-btn').click();
    expect(ui.state.selected).toBeNull();
    frame();
    expect(one('.hud-sheet--research').hidden).toBe(false);
    expect(btn('.hud-research-btn').getAttribute('aria-expanded')).toBe('true');

    const offer = session.game.state.offer;
    expect(all('.hud-card').map((card) => card.dataset.tech)).toEqual(offer);
    const first = offer[0];
    expect(btn(`[data-tech="${first}"] .hud-card__take`).disabled).toBe(true);
    expect(one(`[data-tech="${first}"] .hud-card__line`).textContent).toMatch(/^(Energy|Weapons|Economy|Orbit)$/);
    expect(one(`[data-tech="${first}"] .hud-card__text`).textContent).not.toBe('');
    expect(one(`[data-tech="${first}"] .hud-card__take`).textContent).toMatch(/^Research · \d+ science$/);

    session.game.state.science = 1000;
    frame();
    expect(one('.hud-badge').hidden).toBe(false);
    btn(`[data-tech="${first}"] .hud-card__take`).click();
    expect(session.sent).toEqual([{ type: 'research', tech: first }]);
    expect(session.game.state.techs).toEqual([first]);
    frame();
    expect(all('.hud-card').map((card) => card.dataset.tech)).toEqual(session.game.state.offer);
  });

  it('closes when a slot is selected, and with its close button', () => {
    const { ui, frame, one, btn } = setup();
    btn('.hud-research-btn').click();
    frame();
    ui.set({ selected: { kind: 'surface', slot: 4 } });
    frame();
    expect(one('.hud-sheet--research').hidden).toBe(true);
    ui.set({ selected: null });
    btn('.hud-research-btn').click();
    frame();
    btn('.hud-sheet--research .hud-sheet__close').click();
    frame();
    expect(one('.hud-sheet--research').hidden).toBe(true);
    btn('.hud-research-btn').click();
    btn('.hud-research-btn').click();
    frame();
    expect(one('.hud-sheet--research').hidden).toBe(true);
  });

  it('shows an open pool with its either/or notes, and says when nothing is left', () => {
    const level: LevelDef = { ...firstLevel, research: { pool: ['flakShells', 'railgun'], choices: 0 } };
    const { session, frame, all, text } = setup(level);
    expect(all('.hud-card').map((card) => card.dataset.tech)).toEqual(['flakShells', 'railgun']);
    expect(all('.hud-card__note')).toHaveLength(2);
    expect(text('[data-tech="railgun"] .hud-card__name')).toBe('Railgun');
    session.game.state.science = 500;
    session.game.state.minerals = 500;
    session.send({ type: 'research', tech: 'railgun' });
    frame();
    expect(text('.hud-cards .hud-empty')).toBe('No research left to take.');
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
  it('appears on loss with the stats, and Play again starts over with nothing selected', () => {
    const { session, ui, frame, one, btn, text, all } = setup();
    ui.set({ selected: { kind: 'surface', slot: 0 }, preview: 'laser' });
    btn('.hud-research-btn').click();
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
    expect(one('.hud-sheet--research').hidden).toBe(true);
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
  it('is zero where there is no layout', () => {
    const { hud } = setup();
    expect(hud.insets()).toEqual({ top: 0, bottom: 0 });
  });

  it('measures the bar and the control row', () => {
    const { hud } = setup(firstLevel, {
      measure: (node) =>
        node.classList.contains('hud-bar') ? { top: 6, bottom: 70, height: 64 } : { top: 780, bottom: 836, height: 56 },
      viewportHeight: () => 844,
    });
    expect(hud.insets()).toEqual({ top: 70, bottom: 64 });
  });

  it('measures the bottom against the window when no viewport height is given', () => {
    const { hud } = setup(firstLevel, {
      measure: () => ({ top: window.innerHeight - 50, bottom: window.innerHeight, height: 50 }),
    });
    expect(hud.insets()).toEqual({ top: window.innerHeight, bottom: 50 });
  });

  it('builds through the contract factory with real timing and layout', () => {
    const root = document.createElement('div');
    const session = new FakeSession();
    const hud = createHud(root, session, new FakeUi());
    hud.update(session.game, [{ type: 'waveCleared', wave: 0, reward: 60 }]);
    expect(root.querySelectorAll('.hud-toast')).toHaveLength(1);
    expect(hud.insets()).toEqual({ top: 0, bottom: 0 });
  });
});
