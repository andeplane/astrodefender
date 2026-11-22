import { describe, expect, it } from 'vitest';
import {
  asteroidRadius,
  formatAmount,
  healthShare,
  slotRadius,
  stars,
  structureRadius,
  withAlpha,
} from '../../src/render/look';

describe('withAlpha', () => {
  it('turns a hex colour into rgba', () => {
    expect(withAlpha('#ff8000', 0.5)).toBe('rgba(255, 128, 0, 0.5)');
    expect(withAlpha('#FFFFFF', 1 / 3)).toBe('rgba(255, 255, 255, 0.333)');
  });

  it('leaves other colours alone', () => {
    expect(withAlpha('rgba(1, 2, 3, 0.4)', 0.5)).toBe('rgba(1, 2, 3, 0.4)');
    expect(withAlpha('#fff', 0.5)).toBe('#fff');
  });
});

describe('stars', () => {
  it('is the same sky every time, and cached', () => {
    const sky = stars(50);
    expect(stars(50)).toBe(sky);
    expect(sky).toHaveLength(50);
    expect(stars(20)).toEqual(sky.slice(0, 20));
  });

  it('keeps every star on screen with a sensible size and brightness', () => {
    for (const star of stars(200)) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(1);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(1);
      expect(star.size).toBeGreaterThan(0.3);
      expect(star.size).toBeLessThanOrEqual(1.6);
      expect(star.alpha).toBeGreaterThan(0.2);
      expect(star.alpha).toBeLessThanOrEqual(0.85);
    }
  });

  it('spreads the stars out', () => {
    const left = stars(200).filter((star) => star.x < 0.5).length;
    expect(left).toBeGreaterThan(60);
    expect(left).toBeLessThan(140);
  });
});

describe('sizes', () => {
  it('grows asteroids with the cube root of mass', () => {
    expect(asteroidRadius(64, 1)).toBeCloseTo(12);
    expect(asteroidRadius(8, 1)).toBeCloseTo(6);
  });

  it('never draws a body or a marker too small to see', () => {
    expect(asteroidRadius(1, 0.1)).toBe(2.5);
    expect(asteroidRadius(-1, 1)).toBe(2.5);
    expect(structureRadius(0.1)).toBe(9);
    expect(structureRadius(1)).toBe(16);
    expect(slotRadius(0.1)).toBe(3.5);
    expect(slotRadius(1)).toBe(6);
  });
});

describe('healthShare', () => {
  it('is hp over full hp, clamped', () => {
    expect(healthShare(50, 10, 10)).toBe(0.5);
    expect(healthShare(200, 10, 10)).toBe(1);
    expect(healthShare(-5, 10, 10)).toBe(0);
    expect(healthShare(5, 0, 10)).toBe(0);
  });
});

describe('formatAmount', () => {
  it('rounds big amounts and keeps a decimal for small ones', () => {
    expect(formatAmount(12.6)).toBe('13');
    expect(formatAmount(3.14)).toBe('3.1');
    expect(formatAmount(-4)).toBe('4');
    expect(formatAmount(9.96)).toBe('10');
  });
});
