import type { Camera, Session, Speed, UiStore } from './contract';
import { pickSite } from './camera';

export interface InputOptions {
  session: Session;
  ui: UiStore;
  camera: Camera;
  /** How far from a slot a tap still picks it, in CSS pixels. Generous for fingers. */
  reach?: number;
  /** Where keyboard shortcuts are listened for; defaults to the canvas's window. */
  keys?: EventTarget;
}

/** A pointer that moves further than this between down and up is a drag, not a tap. */
const TAP_SLOP = 10;

const speedKeys: Record<string, Speed> = { '1': 1, '2': 2, '3': 4 };

/** Wires taps on the canvas and desktop shortcuts to the session and UI store. Returns a detach function. */
export function attachInput(canvas: HTMLElement, options: InputOptions): () => void {
  const { session, ui, camera, reach = 32 } = options;
  const keys = options.keys ?? canvas.ownerDocument.defaultView ?? canvas;
  const downs = new Map<number, { x: number; y: number }>();
  let resumeSpeed: Speed = session.speed === 0 ? 1 : session.speed;

  const local = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onDown = (event: PointerEvent) => {
    downs.set(event.pointerId, local(event));
  };
  const onUp = (event: PointerEvent) => {
    const start = downs.get(event.pointerId);
    downs.delete(event.pointerId);
    if (!start) return;
    const point = local(event);
    if (Math.hypot(point.x - start.x, point.y - start.y) > TAP_SLOP) return;
    // Tapping empty space picks null, which clears the selection.
    ui.set({ selected: pickSite(session.game, session.level, camera, point, reach), preview: null });
  };
  const onCancel = (event: PointerEvent) => {
    downs.delete(event.pointerId);
  };

  const onKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || event.ctrlKey || event.metaKey || event.altKey) return;
    const speed = speedKeys[event.key];
    if (speed !== undefined) {
      session.speed = speed;
      resumeSpeed = speed;
    } else if (event.key === ' ') {
      event.preventDefault();
      if (session.speed === 0) {
        session.speed = resumeSpeed;
      } else {
        resumeSpeed = session.speed;
        session.speed = 0;
      }
    } else if (event.key === 'Escape') {
      ui.set({ selected: null, preview: null });
    } else if (event.key === 'n' || event.key === 'N') {
      session.send({ type: 'startWave' });
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  keys.addEventListener('keydown', onKey);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    keys.removeEventListener('keydown', onKey);
  };
}
