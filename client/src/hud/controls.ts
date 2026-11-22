import type { Game } from '@engine';
import type { Speed } from '../contract';
import { compact } from '../labels';
import type { HudContext, Part } from './context';
import { button, classSetter, el, hiddenSetter, textSetter } from './dom';

const SPEEDS: { speed: Speed; label: string; title: string }[] = [
  { speed: 0, label: '❚❚', title: 'Pause' },
  { speed: 1, label: '1×', title: 'Normal speed' },
  { speed: 2, label: '2×', title: 'Double speed' },
  { speed: 4, label: '4×', title: 'Quadruple speed' },
];

/** The minerals an early call pays now, computed the way the engine's `startWave` command does. */
export function earlyBonus(game: Game): number {
  return game.state.wave.countdown * game.level.world.dt * game.level.earlyCallBonus;
}

/** Pause and speed, as a segmented control. */
export function createSpeedControl(context: HudContext): Part {
  const element = el('div', 'hud-speed');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Game speed');
  const setters = SPEEDS.map(({ speed, label, title }) => {
    const node = button('hud-btn hud-speed__btn', label, () => {
      context.session.speed = speed;
    });
    node.title = title;
    node.setAttribute('aria-label', title);
    node.dataset.speed = String(speed);
    element.append(node);
    const active = classSetter(node, 'is-active');
    let last: boolean | null = null;
    return (current: Speed) => {
      const on = current === speed;
      active(on);
      if (on !== last) {
        last = on;
        node.setAttribute('aria-pressed', String(on));
      }
    };
  });
  return {
    element,
    update() {
      const current = context.session.speed;
      for (const set of setters) set(current);
    },
  };
}

/** Calls the next wave early while the build phase runs, and says what that pays. */
export function createCallWave(context: HudContext): Part {
  const element = button('hud-btn hud-btn--primary hud-call', '', () => {
    const bonus = earlyBonus(context.session.game);
    if (context.send({ type: 'startWave' })) {
      context.toast(bonus >= 1 ? `Wave called early · +${compact(bonus)} minerals` : 'Wave called', 'good');
    }
  });
  const label = el('span', 'hud-call__label', 'Call wave');
  const bonusText = el('span', 'hud-call__bonus');
  element.append(label, bonusText);
  const setBonus = textSetter(bonusText);
  const hide = hiddenSetter(element);
  return {
    element,
    update(game) {
      const { wave, status } = game.state;
      // A countdown of 0 means the wave starts on the next tick: there is nothing left to call.
      const callable =
        status === 'playing' && !wave.active && wave.index < game.level.waves.length && wave.countdown > 0;
      hide(!callable);
      if (callable) {
        const bonus = earlyBonus(game);
        setBonus(bonus >= 1 ? `+${compact(bonus)}` : '');
      }
    },
  };
}
