import type { Game, Site, Structure, StructureDef } from '@engine';
import { compact, structureDescription, structureName } from '../labels';
import { swatch } from '../theme';
import type { HudContext, Part } from './context';
import { fitsSite, siteKey, siteTitle, statLine } from './describe';
import { button, classSetter, disabledSetter, el, hiddenSetter, textSetter } from './dom';

function swatchNode(id: string): HTMLElement {
  const look = swatch(id);
  const node = el('span', 'hud-swatch', look.glyph);
  node.style.setProperty('--swatch', look.color);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** The engine allows only `orbitSlots[shell]` structures per shell, whatever the slot. */
function shellFull(game: Game, site: Site): boolean {
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

/** Content with nothing that changes between rebuilds. */
const idle = (): void => undefined;

interface MenuItem {
  id: string;
  cost: number;
  update(minerals: number, chosen: boolean): void;
}

/**
 * The bottom sheet for the selected slot: a build menu when it is empty, the structure's panel when
 * it is built on, hidden when nothing is selected. Building takes two taps: pick, then Build.
 */
export function createSlotSheet(context: HudContext): Part {
  const { ui } = context;
  const element = el('section', 'hud-sheet hud-sheet--slot');
  element.setAttribute('aria-label', 'Selected slot');
  const head = el('header', 'hud-sheet__head');
  const title = el('h2', 'hud-sheet__title');
  const close = button('hud-btn hud-btn--ghost hud-sheet__close', '✕', () => ui.set({ selected: null, preview: null }));
  close.setAttribute('aria-label', 'Close');
  head.append(title, close);
  const body = el('div', 'hud-sheet__body');
  const foot = el('footer', 'hud-sheet__foot');
  element.append(head, body, foot);
  element.hidden = true;

  const hide = hiddenSetter(element);
  const setTitle = textSetter(title);
  let key: string | null = null;
  let lastGame: Game | null = null;
  /** Runs every frame for the content that was built for the current key. */
  let refresh: (game: Game) => void = idle;

  function buildMenu(game: Game, site: Site): void {
    const options = buildOptions(game, site);
    if (options.length === 0) {
      body.append(el('p', 'hud-empty', 'Nothing can be built here yet.'));
      refresh = idle;
      return;
    }
    const list = el('ul', 'hud-menu');
    const items: MenuItem[] = options.map((def) => {
      const li = el('li');
      const item = button('hud-item', '', () => ui.set({ preview: def.id }));
      item.dataset.structure = def.id;
      const main = el('span', 'hud-item__main');
      main.append(el('span', 'hud-item__name', structureName(def.id)), el('span', 'hud-item__stats', statLine(def)));
      const cost = el('span', 'hud-item__cost', compact(def.cost));
      const reason = el('span', 'hud-item__reason');
      main.append(reason);
      item.append(swatchNode(def.id), main, cost);
      li.append(item);
      list.append(li);
      const short = classSetter(item, 'is-unaffordable');
      const chosenClass = classSetter(item, 'is-chosen');
      const setReason = textSetter(reason);
      let pressed: boolean | null = null;
      return {
        id: def.id,
        cost: def.cost,
        update(minerals, chosen) {
          short(minerals < def.cost);
          setReason(minerals < def.cost ? `Need ${compact(Math.ceil(def.cost - minerals))} more minerals` : '');
          chosenClass(chosen);
          if (chosen !== pressed) {
            pressed = chosen;
            item.setAttribute('aria-pressed', String(chosen));
          }
        },
      };
    });
    body.append(list);

    const hint = el('span', 'hud-sheet__hint');
    const build = button('hud-btn hud-btn--primary hud-build', 'Build', () => {
      const chosen = items.find((item) => item.id === ui.state.preview);
      const selected = ui.state.selected;
      if (!chosen || !selected) return;
      if (context.send({ type: 'build', structure: chosen.id, site: selected })) ui.set({ preview: null });
    });
    foot.append(hint, build);
    const setHint = textSetter(hint);
    const setBuild = textSetter(build);
    const disableBuild = disabledSetter(build);
    refresh = (current) => {
      const minerals = current.state.minerals;
      const chosen = items.find((item) => item.id === ui.state.preview);
      for (const item of items) item.update(minerals, item === chosen);
      const full = shellFull(current, site);
      disableBuild(!chosen || minerals < chosen.cost || full);
      setBuild(chosen ? `Build ${structureName(chosen.id)} · ${compact(chosen.cost)}` : 'Build');
      if (full) setHint('This orbit is full. Research opens more slots.');
      else if (!chosen) setHint('Pick a structure to see its range.');
      else if (minerals < chosen.cost) setHint('Not enough minerals yet.');
      else setHint('');
    };
  }

  function buildPanel(game: Game, structure: Structure): void {
    const def = game.structures()[structure.def];
    const detail = el('div', 'hud-detail');
    const text = el('div', 'hud-detail__text');
    text.append(
      el('span', 'hud-detail__name', structureName(structure.def)),
      el('span', 'hud-detail__desc', structureDescription(structure.def)),
      el('span', 'hud-detail__stats', statLine(def)),
    );
    detail.append(swatchNode(structure.def), text);
    if (!structure.enabled) detail.append(el('span', 'hud-detail__off', 'Off'));
    body.append(detail);

    const toggle = button('hud-btn hud-toggle', structure.enabled ? 'Turn off' : 'Turn on', () =>
      context.send({ type: 'setEnabled', id: structure.id, enabled: !structure.enabled }),
    );
    toggle.setAttribute('aria-pressed', String(structure.enabled));
    // Mirrors the engine's `sell`: the effective cost times the level's refund share.
    const refund = def.cost * game.level.refund;
    const sell = button('hud-btn hud-btn--danger hud-sell', `Sell +${compact(refund)}`, () => {
      if (context.send({ type: 'sell', id: structure.id })) ui.set({ preview: null });
    });
    foot.append(toggle, sell);
    refresh = idle;
  }

  return {
    element,
    update(game) {
      const site = ui.state.selected;
      hide(site === null);
      if (site === null) {
        key = null;
        return;
      }
      const structure = game.structureAt(site);
      const parts = [
        siteKey(site),
        structure ? `${structure.id}:${structure.def}:${structure.enabled}` : 'empty',
        game.state.unlocked.join(','),
        game.state.modifiers.length,
      ];
      const next = parts.join('|');
      if (next !== key || game !== lastGame) {
        key = next;
        lastGame = game;
        body.replaceChildren();
        foot.replaceChildren();
        setTitle(siteTitle(game.level, site));
        if (structure) buildPanel(game, structure);
        else buildMenu(game, site);
      }
      refresh(game);
    },
  };
}
