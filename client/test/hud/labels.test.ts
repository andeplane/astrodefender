import { baseContent, firstLevel, type CommandError, type StructureDef } from '@engine';
import { describe, expect, it } from 'vitest';
import { costText, featuresOf, fitsSite, siteKey, siteTitle, statLine } from '../../src/hud/describe';
import { cardFace } from '../../src/hud/research';
import {
  clock,
  compact,
  errorText,
  humanize,
  reserveName,
  resourceName,
  structureDescription,
  structureName,
} from '../../src/labels';

describe('labels', () => {
  it('names every structure in the content, and falls back to words for unknown ids', () => {
    for (const id of Object.keys(baseContent.structures)) {
      expect(structureName(id)).not.toBe('');
      expect(structureDescription(id)).not.toBe('');
    }
    expect(structureName('rocketBattery')).toBe('Rocket battery');
    expect(structureName('gravityWell')).toBe('Gravity well');
    expect(structureDescription('gravityWell')).toBe('');
    expect(humanize('deep_space-probe')).toBe('Deep space probe');
    expect(humanize('x2Laser')).toBe('X2 laser');
  });

  it('names reserves and resources', () => {
    expect(reserveName('fusionFuel')).toBe('Fusion fuel');
    expect(reserveName('helium3')).toBe('Helium3');
    expect(resourceName('exotics')).toBe('exotics');
  });

  it('has plain words for every command error', () => {
    const errors: CommandError[] = [
      'game-over',
      'unknown-structure',
      'unknown-tech',
      'unknown-id',
      'locked',
      'already-researched',
      'excluded',
      'not-offered',
      'no-capacity',
      'cannot-afford',
      'invalid-site',
      'site-occupied',
      'wave-active',
    ];
    for (const error of errors) expect(errorText(error)).toMatch(/\.$/);
  });

  it('formats numbers compactly', () => {
    expect(compact(0)).toBe('0');
    expect(compact(999.9)).toBe('999');
    expect(compact(1000)).toBe('1k');
    expect(compact(1520)).toBe('1.5k');
    expect(compact(12345)).toBe('12k');
    expect(compact(3_450_000)).toBe('3.4M');
    expect(compact(-1520)).toBe('-1.5k');
  });

  it('formats seconds as m:ss, rounding up', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(0.2)).toBe('0:01');
    expect(clock(20)).toBe('0:20');
    expect(clock(125)).toBe('2:05');
    expect(clock(-3)).toBe('0:00');
  });
});

describe('describe', () => {
  const s = baseContent.structures;

  it('gives one line of key stats for each kind of structure', () => {
    expect(statLine(s.coalPlant)).toBe('+20 power · burns coal 1/s');
    expect(statLine(s.solarFarm)).toBe('+60 power in sun');
    expect(statLine(s.rocketBattery)).toBe('120/hit explosive · range 320 · 5 minerals/shot · draws 5');
    expect(statLine(s.relativityField)).toBe('slows 60% · radius 90 · draws 30');
    expect(statLine(s.lab)).toBe('+1 science/s · draws 10');
    expect(statLine(s.battery)).toBe('stores 600');
    const daylight: StructureDef = { ...s.solarFarm, generator: { output: 10, source: 'daylight', throttled: false } };
    expect(statLine(daylight)).toBe('+10 power by day');
    for (const def of Object.values(s)) expect(statLine(def)).not.toBe('');
  });

  it('writes costs and sites', () => {
    expect(costText({ science: 30 })).toBe('30 science');
    expect(costText({ minerals: 1200, exotics: 2 })).toBe('1.2k minerals + 2 exotics');
    expect(costText({})).toBe('free');
    expect(featuresOf(firstLevel, { kind: 'surface', slot: 6 })).toEqual(['water']);
    expect(
      featuresOf(
        { ...firstLevel, world: { ...firstLevel.world, surfaceFeatures: undefined } },
        { kind: 'surface', slot: 6 },
      ),
    ).toEqual([]);
    expect(featuresOf(firstLevel, { kind: 'shell', shell: 0, slot: 0 })).toEqual([]);
    expect(fitsSite(firstLevel, s.dam, { kind: 'shell', shell: 0, slot: 0 })).toBe(false);
    expect(fitsSite(firstLevel, s.dam, { kind: 'surface', slot: 2 })).toBe(true);
    expect(siteTitle(firstLevel, { kind: 'surface', slot: 0 })).toBe('Surface slot 1');
    expect(siteKey(null)).toBe('');
    expect(siteKey({ kind: 'shell', shell: 1, slot: 3 })).toBe('o1.3');
  });

  it('shows unknown tech ids as words', () => {
    expect(cardFace('deepCoreDrill')).toEqual({ name: 'Deep core drill', line: '', text: '' });
    expect(cardFace('water1').name).toBe('Hydro Dams');
  });
});
