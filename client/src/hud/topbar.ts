import type { Game } from '@engine';
import { clock, compact, reserveName } from '../labels';
import type { HudContext, Part } from './context';
import { classSetter, el, hiddenSetter, textSetter } from './dom';

/** Population share below which the counter turns red. */
const LOW_POPULATION = 0.35;

interface Stat {
  element: HTMLElement;
  value: (text: string) => void;
  sub: (text: string) => void;
}

function stat(name: string, label: string): Stat {
  const element = el('div', `hud-stat hud-stat--${name}`);
  const title = el('span', 'hud-stat__label', label);
  const value = el('span', 'hud-stat__value');
  const sub = el('span', 'hud-stat__sub');
  element.append(title, value, sub);
  return { element, value: textSetter(value), sub: textSetter(sub) };
}

/** The resources, power and wave at a glance. */
export function createTopBar(context: HudContext): Part {
  const element = el('div', 'hud-bar');
  const minerals = stat('minerals', 'Minerals');
  const science = stat('science', 'Science');
  const population = stat('population', 'People');
  const power = stat('power', 'Power');
  const wave = stat('wave', 'Wave');
  const reserves = el('div', 'hud-reserves');
  element.append(minerals.element, science.element, population.element, power.element, wave.element, reserves);

  const lowPopulation = classSetter(population.element, 'is-bad');
  const powerShort = classSetter(power.element, 'is-warn');
  const waveActive = classSetter(wave.element, 'is-active');
  const hideReserves = hiddenSetter(reserves);
  let reserveKey: string | null = null;
  let reserveSetters: ((text: string) => void)[] = [];

  function updateReserves(game: Game): void {
    const { reserves: amounts, structures } = game.state;
    const defs = game.structures();
    const burning = new Set<string>();
    for (const structure of structures) {
      const fuel = defs[structure.def]?.generator?.fuel;
      if (fuel) burning.add(fuel.reserve);
    }
    const shown = Object.keys(amounts).filter((id) => amounts[id] > 0 || burning.has(id));
    const key = shown.join(',');
    if (key !== reserveKey) {
      reserveKey = key;
      reserves.replaceChildren();
      reserveSetters = shown.map((id) => {
        const chip = el('span', 'hud-reserve');
        chip.append(el('span', 'hud-reserve__name', reserveName(id)));
        const value = el('span', 'hud-reserve__value');
        chip.append(value);
        reserves.append(chip);
        return textSetter(value);
      });
    }
    shown.forEach((id, index) => reserveSetters[index](compact(amounts[id])));
    hideReserves(shown.length === 0);
  }

  return {
    element,
    update(game) {
      const state = game.state;
      const level = context.session.level;
      minerals.value(compact(state.minerals));
      science.value(compact(state.science));
      if (state.exotics > 0) science.sub(`${compact(state.exotics)} exotic`);
      else science.sub('');

      const start = level.start.population;
      population.value(String(Math.ceil(state.population)));
      population.sub(`/ ${start}`);
      lowPopulation(state.population < start * LOW_POPULATION);

      const p = state.power;
      power.value(`${compact(p.generation)}/${compact(p.demand)}`);
      power.sub(p.capacity > 0 ? `${compact(p.stored)}/${compact(p.capacity)}` : '');
      powerShort(p.factor < 1);

      const total = level.waves.length;
      const w = state.wave;
      wave.value(`${Math.min(w.index + 1, total)}/${total}`);
      if (w.active) wave.sub(`${state.asteroids.length + w.queue.length} left`);
      else if (w.index >= total) wave.sub('done');
      else wave.sub(`in ${clock(w.countdown * level.world.dt)}`);
      waveActive(w.active);

      updateReserves(game);
    },
  };
}
