export interface Vec {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export function fromPolar(r: number, theta: number): Vec {
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** True when the segment a-b passes within `radius` of the origin. */
export function segmentHitsCircle(a: Vec, b: Vec, radius: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(-(a.x * dx + a.y * dy) / lengthSq, 0, 1);
  return Math.hypot(a.x + t * dx, a.y + t * dy) < radius;
}

/** mulberry32: returns a value in [0, 1) and the next state. State lives in the game state. */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}
