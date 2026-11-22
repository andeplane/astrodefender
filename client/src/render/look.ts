import { nextRandom } from '@engine';

/** `#rrggbb` with an alpha, as an `rgba()` string. Anything else is returned as it is. */
export function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return color;
  const [r, g, b] = [match[1], match[2], match[3]].map((hex) => parseInt(hex, 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

export interface Star {
  /** Share of the screen width and height, 0 to 1. */
  x: number;
  y: number;
  /** Radius in pixels. */
  size: number;
  alpha: number;
}

const starCache = new Map<number, Star[]>();

/** A fixed sky: star i is the same on every frame and every run, so the background never shimmers. */
export function stars(count: number): Star[] {
  const cached = starCache.get(count);
  if (cached) return cached;
  const made: Star[] = [];
  let seed = 0x5eed;
  const next = (): number => {
    const step = nextRandom(seed);
    seed = step.state;
    return step.value;
  };
  for (let i = 0; i < count; i++) {
    const bright = next();
    made.push({ x: next(), y: next(), size: 0.4 + bright * bright * 1.2, alpha: 0.25 + next() * 0.6 });
  }
  starCache.set(count, made);
  return made;
}

/** On-screen radius of an asteroid: it grows with the cube root of mass, never smaller than a dot you can see. */
export function asteroidRadius(mass: number, scale: number): number {
  return Math.max(2.5, 3 * Math.cbrt(Math.max(0, mass)) * scale);
}

/** On-screen radius of a built structure and of an empty slot marker. */
export function structureRadius(scale: number): number {
  return Math.max(9, 16 * scale);
}

export function slotRadius(scale: number): number {
  return Math.max(3.5, 6 * scale);
}

/** Share of health left, 0 to 1. Ablation shrinks hp and mass together, so this tracks only damage. */
export function healthShare(hp: number, mass: number, toughness: number): number {
  const full = mass * toughness;
  if (full <= 0) return 0;
  return Math.min(1, Math.max(0, hp / full));
}

/** A floating amount: whole numbers once they are big enough, one decimal below 10. */
export function formatAmount(value: number): string {
  const size = Math.abs(value);
  return size >= 10 ? String(Math.round(size)) : String(Math.round(size * 10) / 10);
}
