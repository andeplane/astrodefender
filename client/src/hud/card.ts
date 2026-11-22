import type { Game } from '@engine';
import { siteKey } from './describe';
import {
  buildPage,
  HOTKEYS,
  mainPage,
  researchPage,
  structurePage,
  type Action,
  type ActionStatus,
  type Navigation,
  type Page,
} from './actions';
import type { HudContext, Part } from './context';
import { attrSetter, classSetter, el, hiddenSetter, textSetter } from './dom';

/** How long a finger rests on a button before its details show instead of it being pressed, in ms. */
export const HOLD_MS = 450;

const COLUMNS = 4;

export interface CommandCard extends Part {
  /** Handles a hotkey for the page on show. True when the key was used. */
  key(event: KeyboardEvent): boolean;
  /** Back to the top-level commands. */
  reset(): void;
}

interface Cell {
  readonly node: HTMLButtonElement;
  action: Action | null;
  status: ActionStatus | null;
  assign(action: Action | null): void;
  refresh(game: Game): void;
}

function createCell(index: number, onPress: (index: number) => void): Cell {
  const node = el('button', 'hud-cmd is-empty');
  node.type = 'button';
  const glyph = el('span', 'hud-cmd__glyph');
  const hotkey = el('span', 'hud-cmd__key', (HOTKEYS[index] ?? '').toUpperCase());
  const cost = el('span', 'hud-cmd__cost');
  const alert = el('span', 'hud-cmd__alert');
  alert.hidden = true;
  glyph.setAttribute('aria-hidden', 'true');
  hotkey.setAttribute('aria-hidden', 'true');
  node.append(glyph, hotkey, cost, alert);
  node.tabIndex = -1;
  node.addEventListener('click', () => onPress(index));

  const setCost = textSetter(cost);
  const disabled = classSetter(node, 'is-disabled');
  const ariaDisabled = attrSetter(node, 'aria-disabled');
  const hideAlert = hiddenSetter(alert);
  const cell: Cell = {
    node,
    action: null,
    status: null,
    assign(action) {
      cell.action = action;
      cell.status = null;
      node.classList.toggle('is-empty', action === null);
      node.tabIndex = action ? 0 : -1;
      glyph.textContent = action?.look.glyph ?? '';
      glyph.classList.toggle('is-long', (action?.look.glyph.length ?? 0) > 2);
      if (action) {
        node.dataset.action = action.id;
        node.style.setProperty('--rim', action.look.color);
        node.setAttribute('aria-label', action.price ? `${action.name}, ${action.price}` : action.name);
        if (HOTKEYS[index]) node.setAttribute('aria-keyshortcuts', HOTKEYS[index].toUpperCase());
      } else {
        delete node.dataset.action;
        node.style.removeProperty('--rim');
        node.removeAttribute('aria-label');
        node.removeAttribute('aria-keyshortcuts');
      }
    },
    refresh(game) {
      const status = cell.action ? cell.action.status(game) : null;
      cell.status = status;
      disabled(status?.disabled ?? false);
      ariaDisabled(status?.disabled ? 'true' : null);
      setCost(status?.cost ?? '');
      const tone = `hud-cmd__cost hud-cmd__cost--${status?.tone ?? 'none'}`;
      if (cost.className !== tone) cost.className = tone;
      hideAlert(!status?.alert);
    },
  };
  return cell;
}

/**
 * The StarCraft-style command card: a selection panel and a grid of square buttons, each with
 * its hotkey and cost in the corners. Nothing selected shows the top-level commands; a selected
 * empty slot shows what can be built there, one click to build; a built slot shows its actions.
 */
export function createCommandCard(context: HudContext, extras: HTMLElement[] = []): CommandCard {
  const { ui } = context;
  const element = el('section', 'hud-console');
  element.setAttribute('aria-label', 'Command card');

  const top = el('div', 'hud-console__top');
  top.append(...extras);

  const portrait = el('div', 'hud-portrait');
  const icon = el('span', 'hud-portrait__icon');
  icon.setAttribute('aria-hidden', 'true');
  const words = el('div', 'hud-portrait__words');
  const name = el('h2', 'hud-portrait__name');
  const sub = el('span', 'hud-portrait__sub');
  const text = el('p', 'hud-portrait__text');
  const live = el('span', 'hud-portrait__live');
  words.append(name, sub, text, live);
  portrait.append(icon, words);

  const grid = el('div', 'hud-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Commands');

  const tip = el('div', 'hud-tip');
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  const tipHead = el('div', 'hud-tip__head');
  const tipName = el('span', 'hud-tip__name');
  const tipKey = el('kbd', 'hud-tip__key');
  const tipPrice = el('span', 'hud-tip__price');
  tipHead.append(tipName, tipKey, tipPrice);
  const tipKind = el('span', 'hud-tip__kind');
  const tipText = el('p', 'hud-tip__text');
  const tipStats = el('p', 'hud-tip__stats');
  const tipNote = el('p', 'hud-tip__note');
  const tipReason = el('p', 'hud-tip__reason');
  tip.append(tipHead, tipKind, tipText, tipStats, tipNote, tipReason);

  const main = el('div', 'hud-console__main');
  main.append(portrait, grid);
  element.append(tip, top, main);

  const setName = textSetter(name);
  const setSub = textSetter(sub);
  const setText = textSetter(text);
  const setLive = textSetter(live);
  const tipSetters = {
    name: textSetter(tipName),
    key: textSetter(tipKey),
    price: textSetter(tipPrice),
    kind: textSetter(tipKind),
    text: textSetter(tipText),
    stats: textSetter(tipStats),
    note: textSetter(tipNote),
    reason: textSetter(tipReason),
  };
  const hideTip = hiddenSetter(tip);

  let mode: 'main' | 'research' = 'main';
  let page: Page | null = null;
  let key: string | null = null;
  let lastGame: Game | null = null;
  const cells: Cell[] = [];
  /** The cell the pointer or focus is on, whose details the tooltip shows. */
  let hover: number | null = null;
  /** The preview this card asked for, so it only clears its own. */
  let shownPreview: string | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  /** A long press showed details; the click that follows it must not press the button. */
  let swallow = false;
  /** Focus that came from a pointer shows no tooltip; keyboard focus does. */
  let pointerFocus = false;

  const nav: Navigation = {
    openResearch() {
      if (ui.state.selected) ui.set({ selected: null, preview: null });
      mode = 'research';
      sync(context.session.game);
    },
    back() {
      if (mode === 'research') mode = 'main';
      else if (ui.state.selected) ui.set({ selected: null, preview: null });
      sync(context.session.game);
    },
  };
  // A slot picked on the planet always wins over the research page.
  ui.subscribe((state) => {
    if (state.selected && mode === 'research') mode = 'main';
  });

  function ensureCells(count: number): void {
    const needed = Math.max(HOTKEYS.length, Math.ceil(count / COLUMNS) * COLUMNS);
    while (cells.length < needed) {
      const cell = createCell(cells.length, press);
      const index = cells.length;
      wire(cell.node, index);
      cells.push(cell);
      grid.append(cell.node);
    }
    for (let i = HOTKEYS.length; i < cells.length; i++) cells[i].node.hidden = i >= needed;
  }

  function wire(node: HTMLButtonElement, index: number): void {
    node.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') setHover(index);
    });
    node.addEventListener('pointerleave', () => {
      cancelHold();
      if (hover === index) setHover(null);
    });
    node.addEventListener('pointerdown', (event) => {
      pointerFocus = true;
      if (event.pointerType !== 'touch') return;
      cancelHold();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        swallow = true;
        setHover(index);
      }, HOLD_MS);
    });
    const release = () => {
      cancelHold();
      if (swallow && hover === index) setHover(null);
    };
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', () => {
      swallow = false;
      release();
    });
    node.addEventListener('focus', () => {
      if (!pointerFocus) setHover(index);
      pointerFocus = false;
    });
    node.addEventListener('blur', () => {
      if (hover === index) setHover(null);
    });
  }

  function cancelHold(): void {
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
  }

  function press(index: number): void {
    if (swallow) {
      swallow = false;
      return;
    }
    activate(cells[index]?.action ?? null);
  }

  function activate(action: Action | null): boolean {
    if (!action) return false;
    const status = action.status(context.session.game);
    if (status.disabled) context.toast(status.reason, 'bad');
    else action.run();
    sync(context.session.game);
    return true;
  }

  function setHover(index: number | null): void {
    hover = index;
    renderTip();
    syncPreview();
  }

  function hovered(): Action | null {
    return hover === null ? null : (cells[hover]?.action ?? null);
  }

  function renderTip(): void {
    const action = hovered();
    hideTip(action === null);
    if (!action) return;
    tipSetters.name(action.name);
    tipSetters.key(action.id === 'back' ? 'Esc' : (HOTKEYS[action.slot] ?? '').toUpperCase());
    tipSetters.price(action.price);
    tipSetters.kind(action.kind);
    tipSetters.text(action.text);
    tipSetters.stats(action.stats);
    tipSetters.note(action.note);
    tipSetters.reason(cells[action.slot]?.status?.reason ?? '');
  }

  function syncPreview(): void {
    const want = hovered()?.preview ?? null;
    if (want === shownPreview) return;
    const previous = shownPreview;
    shownPreview = want;
    if (want !== null) ui.set({ preview: want });
    else if (ui.state.preview === previous) ui.set({ preview: null });
  }

  function pageFor(game: Game): Page {
    const site = ui.state.selected;
    if (site) {
      const structure = game.structureAt(site);
      return structure ? structurePage(context, game, structure, nav) : buildPage(context, game, site, nav);
    }
    return mode === 'research' ? researchPage(context, game, nav) : mainPage(context, game, nav);
  }

  /** Cheap to compute every frame; changes whenever the page on show could. */
  function stateKey(game: Game): string {
    const site = ui.state.selected;
    const structure = site ? game.structureAt(site) : undefined;
    const { state } = game;
    return [
      mode,
      siteKey(site),
      structure ? `${structure.id}:${structure.def}:${structure.enabled}` : '',
      state.unlocked.join(','),
      state.modifiers.length,
      state.techs.length,
      state.offer.join(','),
    ].join('|');
  }

  function sync(game: Game): void {
    const next = stateKey(game);
    if (next !== key || game !== lastGame) {
      key = next;
      lastGame = game;
      page = pageFor(game);
      const bySlot = new Map(page.actions.map((action) => [action.slot, action]));
      ensureCells(Math.max(...page.actions.map((action) => action.slot)) + 1);
      cells.forEach((cell, index) => {
        cell.assign(bySlot.get(index) ?? null);
      });
      const look = page.portrait.look;
      icon.textContent = look.glyph;
      icon.style.setProperty('--rim', look.color);
      setName(page.portrait.name);
      setSub(page.portrait.sub);
      setText(page.portrait.text);
      element.dataset.page = page.key.split('|')[0];
    }
    for (const cell of cells) cell.refresh(game);
    setLive(page?.portrait.live(game) ?? '');
    renderTip();
    syncPreview();
  }

  return {
    element,
    update: sync,
    key(event) {
      const game = context.session.game;
      sync(game);
      if (event.key === 'Escape') {
        nav.back();
        return true;
      }
      const index = HOTKEYS.indexOf(event.key.toLowerCase());
      if (index < 0) return false;
      return activate(cells[index].action);
    },
    reset() {
      mode = 'main';
    },
  };
}
