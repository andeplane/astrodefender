// Wiring only: builds the parts and runs the frame loop. Everything testable lives in the modules.
import './style.css';
import './hud/hud.css';
import { baseContent, firstLevel } from '@engine';
import { createCamera } from './camera';
import { createHud } from './hud/hud';
import { attachInput } from './input';
import { createRenderer } from './render/renderer';
import { createSession } from './session';
import { createUiStore } from './ui';
import type { Session, UiStore } from './contract';

declare global {
  interface Window {
    /** For debugging and automated screenshots. */
    __astro?: { session: Session; ui: UiStore };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const hudRoot = document.querySelector<HTMLElement>('#hud');
const ctx = canvas?.getContext('2d');
if (!canvas || !hudRoot || !ctx) throw new Error('Astro Defender: #scene canvas or #hud missing');

const seedParam = Number.parseInt(new URLSearchParams(location.search).get('seed') ?? '', 10);
const seed = Number.isFinite(seedParam) ? seedParam : Date.now() % 2 ** 31;

const level = firstLevel;
const session = createSession({ content: baseContent, level, seed });
const ui = createUiStore();
const camera = createCamera(level.world);
const renderer = createRenderer(ctx);
const hud = createHud(hudRoot, session, ui);
attachInput(canvas, { session, ui, camera });
window.__astro = { session, ui };

let insets = hud.insets();

/** The canvas holds device pixels; the transform lets everything else draw in CSS pixels. */
function resize(): void {
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  insets = hud.insets();
  camera.resize(width, height, insets);
}

window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now: number): void {
  const elapsed = now - last;
  last = now;
  const events = session.advance(elapsed);
  // The HUD may grow or shrink (a panel opening); keep the play field clear of it.
  const next = hud.insets();
  if (next.top !== insets.top || next.bottom !== insets.bottom || next.sheet !== insets.sheet) {
    insets = next;
    camera.resize(camera.width, camera.height, insets);
  }
  renderer.draw({ game: session.game, level, ui: ui.state, camera, events, now, alpha: session.alpha });
  hud.update(session.game, events);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
