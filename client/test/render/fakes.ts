import { Game, type GameEvent, type Vec, baseContent, firstLevel } from '@engine';
import type { Camera } from '../../src/contract';
import type { Ctx } from '../../src/render/ctx';

/** Centred on the screen, y up, like the real camera; no insets. */
export class FakeCamera implements Camera {
  width: number;
  height: number;
  scale: number;
  constructor(width = 390, height = 844, scale = 390 / 840) {
    this.width = width;
    this.height = height;
    this.scale = scale;
  }
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }
  toScreen(world: Vec): Vec {
    return { x: this.width / 2 + world.x * this.scale, y: this.height / 2 - world.y * this.scale };
  }
  toWorld(screen: Vec): Vec {
    return { x: (screen.x - this.width / 2) / this.scale, y: (this.height / 2 - screen.y) / this.scale };
  }
}

export class FakeGradient implements CanvasGradient {
  readonly stops: { offset: number; color: string }[] = [];
  readonly args: number[];
  constructor(args: number[]) {
    this.args = args;
  }
  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

type Style = string | CanvasGradient | CanvasPattern;

export interface Call {
  name: string;
  /** The style in force for fill, stroke and fillText calls. */
  style?: Style;
  alpha: number;
  args: (number | string)[];
}

/** Records every drawing call with the style in force, so tests can ask what was painted. */
export class RecordingCtx implements Ctx {
  readonly calls: Call[] = [];
  readonly gradients: FakeGradient[] = [];
  fillStyle: Style = '#000';
  strokeStyle: Style = '#000';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  globalAlpha = 1;
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  dash: number[] = [];
  depth = 0;

  private record(name: string, args: (number | string)[], style?: Style): void {
    this.calls.push({ name, args, style, alpha: this.globalAlpha });
  }
  save(): void {
    this.depth++;
    this.record('save', []);
  }
  restore(): void {
    this.depth--;
    this.record('restore', []);
  }
  beginPath(): void {
    this.record('beginPath', []);
  }
  closePath(): void {
    this.record('closePath', []);
  }
  moveTo(x: number, y: number): void {
    this.record('moveTo', [x, y]);
  }
  lineTo(x: number, y: number): void {
    this.record('lineTo', [x, y]);
  }
  arc(x: number, y: number, radius: number, start: number, end: number): void {
    if (radius < 0) throw new RangeError('negative radius');
    this.record('arc', [x, y, radius, start, end]);
  }
  fill(): void {
    this.record('fill', [], this.fillStyle);
  }
  stroke(): void {
    this.record('stroke', [], this.strokeStyle);
  }
  clip(): void {
    this.record('clip', []);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.record('fillRect', [x, y, w, h], this.fillStyle);
  }
  fillText(text: string, x: number, y: number): void {
    this.record('fillText', [text, x, y], this.fillStyle);
  }
  setLineDash(segments: Iterable<number>): void {
    this.dash = [...segments];
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
    return this.gradient([x0, y0, r0, x1, y1, r1]);
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    return this.gradient([x0, y0, x1, y1]);
  }
  private gradient(args: number[]): FakeGradient {
    const gradient = new FakeGradient(args);
    this.gradients.push(gradient);
    return gradient;
  }

  named(name: string): Call[] {
    return this.calls.filter((call) => call.name === name);
  }
  texts(): string[] {
    return this.named('fillText').map((call) => String(call.args[0]));
  }
  /** Styles used by fill and stroke calls. */
  styles(): Style[] {
    return this.calls.filter((call) => call.name === 'fill' || call.name === 'stroke').map((call) => call.style ?? '');
  }
  clear(): void {
    this.calls.length = 0;
    this.gradients.length = 0;
  }
}

export function newGame(seed = 1): Game {
  return new Game(baseContent, firstLevel, seed);
}

/** Ticks until `until` holds, collecting every event; fails the test if it never does. */
export function tickUntil(game: Game, until: (events: GameEvent[]) => boolean, limit = 20000): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < limit; i++) {
    const events = game.tick();
    all.push(...events);
    if (until(events)) return all;
  }
  throw new Error('condition never held');
}
