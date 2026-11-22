import { coreTechs, type Cost, type Game, type Resource, type Site, type Structure, type StructureDef, type TechDef } from '@engine';
import { compact, resourceName, structureDescription, structureName } from '../labels';
import { commandSwatches, swatch, techLineColor, type Swatch } from '../theme';
import type { HudContext } from './context';
import { earlyBonus } from './controls';
import { costText, fitsSite, siteTitle, statLine } from './describe';
import { cardFace, cardsOnTable } from './research';

/**
 * What the command card can show, as data: a page of actions in a StarCraft-style grid, each
 * with its place in the grid (and so its hotkey), its look, and how to tell whether it can run now.
 */

/** The grid's hotkeys by position, StarCraft style: three rows of four under the left hand. */
export const HOTKEYS = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
/** Back sits bottom-right, where StarCraft keeps Cancel. */
export const BACK_SLOT = HOTKEYS.length - 1;

export type CostTone = 'minerals' | 'science' | 'exotics' | 'bonus' | 'none';

export interface ActionStatus {
  disabled: boolean;
  /** Why it cannot run; empty when it can. */
  reason: string;
  /** Short text for the button's corner. */
  cost: string;
  tone: CostTone;
  /** Draws the eye, such as an affordable card behind the Research button. */
  alert: boolean;
}

export interface Action {
  /** Stable id, also the button's `data-action`. */
  id: string;
  /** Place in the grid; the hotkey follows from it. */
  slot: number;
  look: Swatch;
  name: string;
  /** Small caps line under the name in the tooltip. */
  kind: string;
  text: string;
  stats: string;
  /** Full cost in words, for the tooltip. */
  price: string;
  /** A warning that always applies, such as an either/or card. */
  note: string;
  /** A structure whose range is drawn at the selected slot while the button is pointed at. */
  preview: string | null;
  status(game: Game): ActionStatus;
  run(): void;
}

/** The selection panel beside the grid. */
export interface Portrait {
  look: Swatch;
  name: string;
  sub: string;
  text: string;
  /** Read every frame, so it can follow the game. */
  live(game: Game): string;
}

export interface Page {
  /** Changes whenever the page must be rebuilt. */
  key: string;
  portrait: Portrait;
  actions: Action[];
}

/** How the actions move the card between pages. */
export interface Navigation {
  openResearch(): void;
  back(): void;
}

const ready = (cost = '', tone: CostTone = 'none', alert = false): ActionStatus => ({
  disabled: false,
  reason: '',
  cost,
  tone,
  alert,
});
const blocked = (reason: string, cost = '', tone: CostTone = 'none'): ActionStatus => ({
  disabled: true,
  reason,
  cost,
  tone,
  alert: false,
});

const RESOURCES: Resource[] = ['minerals', 'science', 'exotics'];

/** What is still missing to pay `cost`, in words; empty when it can be paid. */
export function shortfall(game: Game, cost: Cost): string {
  const missing = RESOURCES.filter((resource) => (cost[resource] ?? 0) > game.state[resource]).map(
    (resource) => `${compact(Math.ceil((cost[resource] ?? 0) - game.state[resource]))} more ${resourceName(resource)}`,
  );
  return missing.length > 0 ? `Need ${missing.join(' and ')}` : '';
}

/** The first resource a cost asks for, for the button's corner. */
function corner(cost: Cost): { text: string; tone: CostTone } {
  const resource = RESOURCES.find((r) => (cost[r] ?? 0) > 0);
  return resource ? { text: compact(cost[resource] ?? 0), tone: resource } : { text: '', tone: 'none' };
}

/** The engine allows only `orbitSlots[shell]` structures per shell, whatever the slot. */
export function shellFull(game: Game, site: Site): boolean {
  if (site.kind !== 'shell') return false;
  const built = game.state.structures.filter((s) => s.site.kind === 'shell' && s.site.shell === site.shell).length;
  return built >= game.state.orbitSlots[site.shell];
}

/** What can be built on an empty slot, cheapest first. */
export function buildOptions(game: Game, site: Site): StructureDef[] {
  const defs = game.structures();
  return game.state.unlocked
    .map((id) => defs[id])
    .filter((def): def is StructureDef => def !== undefined && fitsSite(game.level, def, site))
    .sort((a, b) => a.cost - b.cost);
}

/** `Flak shells` → `FS`, `Railgun` → `Ra`: short enough for a button face. */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => word.length > 0);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const word = words[0] ?? '?';
  return word.charAt(0).toUpperCase() + word.slice(1, 2);
}

/** Lays actions out from the top-left, skipping Back's place, and adds Back. */
function fill(actions: Omit<Action, 'slot'>[], back: Action): Action[] {
  const placed = actions.map((action, index) => ({ ...action, slot: index < BACK_SLOT ? index : index + 1 }));
  return [...placed, back];
}

function backAction(nav: Navigation, name: string, text: string): Action {
  return {
    id: 'back',
    slot: BACK_SLOT,
    look: commandSwatches.back,
    name,
    kind: 'Esc',
    text,
    stats: '',
    price: '',
    note: '',
    preview: null,
    status: () => ready(),
    run: () => nav.back(),
  };
}

/** Nothing selected: the commands that do not need a slot. */
export function mainPage(context: HudContext, game: Game, nav: Navigation): Page {
  const techs = cardsOnTable(game);
  const costs = techs.map((tech) => game.techCost(tech));
  const callWave: Action = {
    id: 'callWave',
    slot: 1,
    look: commandSwatches.callWave,
    name: 'Call wave',
    kind: 'Wave',
    text: 'Start the next wave now. Calling it early pays minerals for the time left.',
    stats: '',
    price: '',
    note: '',
    preview: null,
    status(current) {
      const { wave, status } = current.state;
      if (status !== 'playing') return blocked('The game is over.');
      if (wave.active) return blocked('A wave is already under way.');
      if (wave.index >= current.level.waves.length) return blocked('No waves left to call.');
      // A countdown of 0 means the wave starts on the next tick: there is nothing left to call.
      if (wave.countdown <= 0) return blocked('The wave is starting.');
      const bonus = earlyBonus(current);
      return bonus >= 1 ? ready(`+${compact(bonus)}`, 'bonus') : ready();
    },
    run() {
      const bonus = earlyBonus(context.session.game);
      if (context.send({ type: 'startWave' })) {
        context.toast(bonus >= 1 ? `Wave called early · +${compact(bonus)} minerals` : 'Wave called', 'good');
      }
    },
  };
  const research: Action = {
    id: 'research',
    slot: 3,
    look: commandSwatches.research,
    name: 'Research',
    kind: 'Tech',
    text: 'Spend science on a card from the tech tree.',
    stats: techs.length > 0 ? `${techs.length} on the table` : 'Nothing left to research',
    price: '',
    note: '',
    preview: null,
    status: (current) => ready('', 'none', costs.some((cost) => current.canAfford(cost))),
    run: () => nav.openResearch(),
  };
  return {
    key: `main|${techs.map((tech) => tech.id).join(',')}`,
    portrait: {
      look: commandSwatches.idle,
      name: 'Command',
      sub: 'Nothing selected',
      text: 'Tap a slot on the planet or in orbit to build there.',
      live: () => '',
    },
    actions: [callWave, research],
  };
}

/** An empty slot: one button per structure that fits, building on a single click. */
export function buildPage(context: HudContext, game: Game, site: Site, nav: Navigation): Page {
  const options = buildOptions(game, site);
  const actions = options.map(
    (def): Omit<Action, 'slot'> => ({
      id: `build:${def.id}`,
      look: swatch(def.id),
      name: structureName(def.id),
      kind: 'Build',
      text: structureDescription(def.id),
      stats: statLine(def),
      price: `${compact(def.cost)} minerals`,
      note: '',
      preview: def.id,
      status(current) {
        const cost = compact(def.cost);
        if (shellFull(current, site)) return blocked('This orbit is full. Research opens more slots.', cost, 'minerals');
        const missing = shortfall(current, { minerals: def.cost });
        return missing ? blocked(missing, cost, 'minerals') : ready(cost, 'minerals');
      },
      run() {
        if (context.send({ type: 'build', structure: def.id, site })) context.ui.set({ preview: null });
      },
    }),
  );
  const title = siteTitle(game.level, site);
  return {
    key: `build|${options.map((def) => def.id).join(',')}`,
    portrait: {
      look: commandSwatches.emptySlot,
      name: title,
      sub: 'Empty slot',
      text: options.length > 0 ? 'Pick a structure to build it here.' : 'Nothing can be built here yet.',
      live: (current) => (shellFull(current, site) ? 'This orbit is full. Research opens more slots.' : ''),
    },
    actions: fill(actions, backAction(nav, 'Cancel', 'Deselect the slot.')),
  };
}

/** A built slot: what the structure can do. */
export function structurePage(context: HudContext, game: Game, structure: Structure, nav: Navigation): Page {
  const def = game.structures()[structure.def];
  // Mirrors the engine's `sell`: the effective cost times the level's refund share.
  const refund = def.cost * game.level.refund;
  const on = structure.enabled;
  const sell: Action = {
    id: 'sell',
    slot: 5,
    look: commandSwatches.sell,
    name: 'Sell',
    kind: 'Structure',
    text: `Tear it down for ${compact(refund)} minerals and free the slot.`,
    stats: '',
    price: `+${compact(refund)} minerals`,
    note: '',
    preview: null,
    status: () => ready(`+${compact(refund)}`, 'bonus'),
    run() {
      if (context.send({ type: 'sell', id: structure.id })) context.ui.set({ preview: null });
    },
  };
  const toggle: Action = {
    id: 'toggle',
    slot: 6,
    look: on ? commandSwatches.turnOff : commandSwatches.turnOn,
    name: on ? 'Turn off' : 'Turn on',
    kind: 'Structure',
    text: on ? 'Switch it off to save power. It does nothing while off.' : 'Switch it back on.',
    stats: '',
    price: '',
    note: '',
    preview: null,
    status: () => ready(),
    run: () => context.send({ type: 'setEnabled', id: structure.id, enabled: !on }),
  };
  const back = backAction(nav, 'Cancel', 'Deselect the slot.');
  return {
    key: `structure|${structure.id}:${structure.def}:${on}`,
    portrait: {
      look: swatch(structure.def),
      name: structureName(structure.def),
      sub: `${siteTitle(game.level, structure.site)}${on ? '' : ' · Off'}`,
      text: structureDescription(structure.def),
      live: () => statLine(def),
    },
    actions: [sell, toggle, back],
  };
}

/** The research page: one button per card on the table. */
export function researchPage(context: HudContext, game: Game, nav: Navigation): Page {
  const techs = cardsOnTable(game);
  const actions = techs.map((tech: TechDef): Omit<Action, 'slot'> => {
    const face = cardFace(tech.id);
    const cost = game.techCost(tech);
    const shown = corner(cost);
    return {
      id: `tech:${tech.id}`,
      look: { glyph: initials(face.name), color: techLineColor(coreTechs[tech.id]?.line ?? '') },
      name: face.name,
      kind: face.line || 'Research',
      text: face.text,
      stats: '',
      price: costText(cost),
      note: tech.exclusive ? 'Either/or: taking it locks its rival cards.' : '',
      preview: null,
      status(current) {
        const missing = shortfall(current, cost);
        return missing ? blocked(missing, shown.text, shown.tone) : ready(shown.text, shown.tone);
      },
      run() {
        context.send({ type: 'research', tech: tech.id });
      },
    };
  });
  return {
    key: `research|${techs.map((tech) => tech.id).join(',')}|${game.state.techs.length}`,
    portrait: {
      look: commandSwatches.research,
      name: 'Research',
      sub: techs.length > 0 ? `${techs.length} on the table` : 'No research left to take.',
      text: 'Spend science on a card. Point at one to read it.',
      live: (current) => `${compact(current.state.science)} science`,
    },
    actions: fill(actions, backAction(nav, 'Back', 'Back to the commands.')),
  };
}

