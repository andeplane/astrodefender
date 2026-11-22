import { baseContent, firstLevel } from '@engine';
import { afterEach, describe, expect, it } from 'vitest';
import { createCamera } from '../src/camera';
import { attachInput } from '../src/input';
import { createSession } from '../src/session';
import { createUiStore } from '../src/ui';

const detachers: (() => void)[] = [];
afterEach(() => {
  while (detachers.length) detachers.pop()?.();
});

function setup(keys?: EventTarget) {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const session = createSession({ content: baseContent, level: firstLevel, seed: 1 });
  const ui = createUiStore();
  const camera = createCamera(firstLevel.world);
  camera.resize(800, 800);
  detachers.push(attachInput(canvas, { session, ui, camera, keys }));
  const pointer = (type: string, x: number, y: number, pointerId = 1) =>
    canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId, bubbles: true }));
  const tap = (x: number, y: number) => {
    pointer('pointerdown', x, y);
    pointer('pointerup', x, y);
  };
  const slot = (n: number) => camera.toScreen(session.game.sitePosition({ kind: 'surface', slot: n }));
  return { canvas, session, ui, camera, pointer, tap, slot };
}

const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: k, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe('pointer input', () => {
  it('selects the tapped slot and clears the preview', () => {
    const { ui, tap, slot } = setup();
    ui.set({ preview: 'laser' });
    const at = slot(2);
    tap(at.x, at.y);
    expect(ui.state).toEqual({ selected: { kind: 'surface', slot: 2 }, preview: null });
  });

  it('clears the selection when empty space is tapped', () => {
    const { ui, tap, slot } = setup();
    const at = slot(5);
    tap(at.x, at.y);
    expect(ui.state.selected).not.toBeNull();
    tap(5, 5);
    expect(ui.state.selected).toBeNull();
  });

  it('ignores drags, cancelled pointers and stray ups', () => {
    const { ui, pointer, slot } = setup();
    const at = slot(1);
    pointer('pointerdown', at.x - 40, at.y);
    pointer('pointerup', at.x, at.y);
    expect(ui.state.selected).toBeNull();
    pointer('pointerdown', at.x, at.y, 2);
    pointer('pointercancel', at.x, at.y, 2);
    pointer('pointerup', at.x, at.y, 2);
    expect(ui.state.selected).toBeNull();
    pointer('pointerup', at.x, at.y, 3);
    expect(ui.state.selected).toBeNull();
  });

  it('stops listening once detached', () => {
    const { ui, tap, slot } = setup();
    detachers.pop()?.();
    const at = slot(0);
    tap(at.x, at.y);
    expect(ui.state.selected).toBeNull();
  });
});

describe('keyboard input', () => {
  it('listens on the canvas window by default', () => {
    const { session } = setup();
    key(window, '2');
    expect(session.speed).toBe(2);
  });

  it('sets speed with 1, 2 and 3 and toggles pause with space', () => {
    const target = new EventTarget();
    const { session } = setup(target);
    key(target, '3');
    expect(session.speed).toBe(4);
    const space = key(target, ' ');
    expect(space.defaultPrevented).toBe(true);
    expect(session.speed).toBe(0);
    key(target, ' ');
    expect(session.speed).toBe(4);
    // A speed set elsewhere (the HUD) is what space resumes to.
    session.speed = 2;
    key(target, ' ');
    key(target, ' ');
    expect(session.speed).toBe(2);
    key(target, '1');
    expect(session.speed).toBe(1);
  });

  it('resumes at normal speed when the session started paused', () => {
    const target = new EventTarget();
    const canvas = document.createElement('canvas');
    const session = createSession({ content: baseContent, level: firstLevel, seed: 1 });
    session.speed = 0;
    detachers.push(
      attachInput(canvas, { session, ui: createUiStore(), camera: createCamera(firstLevel.world), keys: target }),
    );
    key(target, ' ');
    expect(session.speed).toBe(1);
  });

  it('clears the selection on Escape', () => {
    const target = new EventTarget();
    const { ui } = setup(target);
    ui.set({ selected: { kind: 'surface', slot: 1 }, preview: 'laser' });
    key(target, 'Escape');
    expect(ui.state).toEqual({ selected: null, preview: null });
  });

  it('calls the next wave with n', () => {
    const target = new EventTarget();
    const { session } = setup(target);
    key(target, 'n');
    // The engine starts the wave on the next tick; the countdown is what the command changes.
    expect(session.game.state.wave.countdown).toBe(0);
    session.game.state.wave.countdown = 50;
    key(target, 'N');
    expect(session.game.state.wave.countdown).toBe(0);
  });

  it('leaves modified keys, other keys and other events alone', () => {
    const target = new EventTarget();
    const { session } = setup(target);
    key(target, '2', { ctrlKey: true });
    key(target, '3', { metaKey: true });
    key(target, '2', { altKey: true });
    key(target, 'x');
    target.dispatchEvent(new Event('keydown'));
    expect(session.speed).toBe(1);
  });
});
