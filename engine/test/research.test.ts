import { describe, expect, it } from 'vitest';
import { Game, applyModifier, baseContent, baseWorld, modifierProblem, validate } from '../src/index';
import type { Content, LevelDef, Modifier, TechDef } from '../src/index';
import { RESERVES, errorOf, level, must, newGame, ofType, place, run, shell, surface, testContent } from './helpers';

const closed = { ...baseWorld, shells: baseWorld.shells.map((s) => ({ ...s, open: 0 })) };
const start = { minerals: 1000, population: 100, techs: [], reserves: RESERVES };

describe('research', () => {
  it('pays for a tech in every resource it costs and applies its effects', () => {
    const game = newGame({ start: { ...start, structures: ['laser'] } });
    expect(errorOf(game, { type: 'research', tech: 'nope' })).toBe('unknown-tech');
    expect(errorOf(game, { type: 'research', tech: 'fission' })).toBe('locked');
    expect(errorOf(game, { type: 'research', tech: 'photovoltaics' })).toBe('cannot-afford');
    expect(errorOf(game, { type: 'build', structure: 'solarFarm', site: surface(0) })).toBe('locked');
    game.state.science = 125;
    must(game, { type: 'research', tech: 'photovoltaics' });
    expect(game.state.science).toBe(105);
    expect(errorOf(game, { type: 'research', tech: 'photovoltaics' })).toBe('already-researched');
    must(game, { type: 'build', structure: 'solarFarm', site: surface(0) });

    game.state.minerals = 30;
    expect(errorOf(game, { type: 'research', tech: 'fission' })).toBe('cannot-afford');
    game.state.minerals = 50;
    must(game, { type: 'research', tech: 'fission' });
    expect(game.state).toMatchObject({ science: 25, minerals: 10, techs: ['photovoltaics', 'fission'] });
    expect(game.state.unlocked).toEqual(['laser', 'solarFarm', 'fissionPlant']);
  });

  it('applies the effects of techs a level starts with, at no cost', () => {
    const game = newGame({ start: { ...start, techs: ['photovoltaics', 'drilling'], structures: [] } });
    expect(game.state.unlocked).toEqual(['solarFarm']);
    expect(game.state.reserves.coal).toBe(RESERVES.coal + 50);
    expect(game.state.science).toBe(0);
  });

  it('locks the other techs of an exclusive group once one is taken', () => {
    const game = newGame();
    game.state.science = 100;
    must(game, { type: 'research', tech: 'heavyRounds' });
    expect(errorOf(game, { type: 'research', tech: 'lightRounds' })).toBe('excluded');
    expect(game.researchable().map((tech) => tech.id)).not.toContain('lightRounds');
  });

  it('lets a repeatable tech be taken again at a growing cost', () => {
    const game = newGame({ world: closed });
    game.state.science = 100;
    const pad = testContent.techs.pad;
    expect(game.techCost(pad)).toEqual({ science: 10, minerals: 4 });
    must(game, { type: 'research', tech: 'pad' });
    expect(game.techCost(pad)).toEqual({ science: 20, minerals: 8 });
    must(game, { type: 'research', tech: 'pad' });
    expect(game.state.science).toBe(70);
    expect(game.state.orbitSlots).toEqual([2, 0, 0]);
    expect(game.techCost(pad)).toEqual({ science: 40, minerals: 16 });
  });

  it('offers only the level pool', () => {
    const game = newGame({ research: { pool: ['photovoltaics', 'fission'], choices: 0 } });
    game.state.science = 100;
    expect(game.researchable().map((tech) => tech.id)).toEqual(['photovoltaics']);
    expect(errorOf(game, { type: 'research', tech: 'drilling' })).toBe('not-offered');
    must(game, { type: 'research', tech: 'photovoltaics' });
    expect(game.researchable().map((tech) => tech.id)).toEqual(['fission']);
  });
});

describe('research cards', () => {
  const research = {
    pool: ['photovoltaics', 'fission', 'tracking', 'boilers', 'heavyRounds', 'lightRounds'],
    choices: 3,
  };

  it('deals a hand from the techs that can be taken, the same for the same seed', () => {
    const a = new Game(testContent, level({ research }), 4);
    const b = new Game(testContent, level({ research }), 4);
    expect(a.state.offer).toHaveLength(3);
    expect(new Set(a.state.offer).size).toBe(3);
    expect(a.state.offer).not.toContain('fission');
    expect(b.state.offer).toEqual(a.state.offer);
    expect(a.researchable().map((tech) => tech.id)).toEqual(a.state.offer);

    const hands = new Set<string>();
    for (let seed = 1; seed <= 20; seed++)
      hands.add(new Game(testContent, level({ research }), seed).state.offer.join());
    expect(hands.size).toBeGreaterThan(3);
  });

  it('accepts only a card on the table, then deals again', () => {
    const game = new Game(testContent, level({ research }), 4);
    game.state.science = 100;
    const left = research.pool.find((id) => id !== 'fission' && !game.state.offer.includes(id));
    expect(errorOf(game, { type: 'research', tech: left ?? '' })).toBe('not-offered');
    const [picked] = game.state.offer;
    must(game, { type: 'research', tech: picked });
    expect(game.state.techs).toEqual([picked]);
    expect(game.state.offer).not.toContain(picked);
    expect(game.state.offer.length).toBeGreaterThan(0);
  });

  it('deals fewer cards when few are left, and none when the pool is spent', () => {
    const game = new Game(testContent, level({ research: { pool: ['tracking', 'boilers'], choices: 3 } }), 1);
    game.state.science = 100;
    expect([...game.state.offer].sort()).toEqual(['boilers', 'tracking']);
    must(game, { type: 'research', tech: 'tracking' });
    expect(game.state.offer).toEqual(['boilers']);
    must(game, { type: 'research', tech: 'boilers' });
    expect(game.state.offer).toEqual([]);
    expect(game.researchable()).toEqual([]);
  });

  it('survives a save and restore with the hand and the effects intact', () => {
    const game = new Game(testContent, level({ research }), 9);
    game.state.science = 100;
    must(game, { type: 'research', tech: game.state.offer[0] });
    const restored = Game.restore(testContent, level({ research }), game.state);
    expect(restored.state).toEqual(game.state);
    expect(restored.structures()).toEqual(game.structures());
  });
});

describe('modifiers', () => {
  it('change what a structure does from the moment the tech is taken', () => {
    const game = newGame();
    game.state.science = 100;
    must(game, { type: 'build', structure: 'solarFarm', site: surface(1) });
    game.tick();
    expect(game.state.power.generation).toBeCloseTo(60 * Math.SQRT1_2);
    must(game, { type: 'research', tech: 'tracking' });
    game.tick();
    expect(game.state.power.generation).toBe(60);
    // Slot 4 is still in the dark.
    must(game, { type: 'build', structure: 'solarFarm', site: surface(4) });
    game.tick();
    expect(game.state.power.generation).toBe(60);
  });

  it('stack, and reach the price', () => {
    const game = newGame();
    game.state.science = 100;
    const before = game.structures().railgun;
    must(game, { type: 'research', tech: 'heavyRounds' });
    const after = game.structures().railgun;
    expect(after.cost).toBe(before.cost + 20);
    expect(after.weapon).toMatchObject({ hit: 120, range: 260 });
    expect(game.structures()).toBe(game.structures());
    expect(baseContent.structures.railgun.cost).toBe(before.cost);
    must(game, { type: 'build', structure: 'railgun', site: surface(0) });
    expect(game.state.minerals).toBe(10_000 - after.cost);
    must(game, { type: 'sell', id: game.state.structures[0].id });
    expect(game.state.minerals).toBe(10_000 - after.cost / 2);
  });

  it('refuse a field that does not exist or has another type', () => {
    const laser = baseContent.structures.laser;
    const modifier = (stat: string, op: Modifier['op'], value: Modifier['value']): Modifier => ({
      type: 'modify',
      structure: 'laser',
      stat,
      op,
      value,
    });
    expect(modifierProblem(laser, modifier('weapon.rnage', 'add', 1))).toBe('laser has no field weapon.rnage');
    expect(modifierProblem(laser, modifier('cost.deep', 'add', 1))).toBe('laser has no field cost.deep');
    expect(modifierProblem(laser, modifier('weapon', 'set', 1))).toBe('laser has no field weapon');
    expect(modifierProblem(laser, modifier('weapon.range', 'set', 'far'))).toBe('laser.weapon.range is not a string');
    expect(modifierProblem(laser, modifier('sites', 'set', 'shell'))).toBe('laser.sites is not a string');
    expect(modifierProblem(laser, modifier('weapon.damage', 'mul', 'kinetic'))).toBe('laser.weapon.damage cannot mul');
    expect(modifierProblem(laser, modifier('weapon.range', 'mul', 2))).toBeUndefined();
    expect(() => applyModifier(laser, modifier('nope', 'set', 1))).toThrow('laser has no field nope');
    expect(applyModifier(laser, modifier('weapon.damage', 'set', 'kinetic')).weapon).toMatchObject({
      damage: 'kinetic',
    });
    expect(applyModifier(laser, modifier('cost', 'set', 5)).cost).toBe(5);
    expect(laser.cost).toBe(60);
  });
});

describe('orbital slots', () => {
  it('stay closed until research opens them, and may be used anywhere in the shell', () => {
    const game = newGame({ world: closed });
    game.state.science = 100;
    expect(game.freeSites('shell')).toEqual([]);
    expect(errorOf(game, { type: 'build', structure: 'laser', site: shell(0, 2) })).toBe('no-capacity');
    must(game, { type: 'research', tech: 'pad' });
    expect(game.freeSites('shell')).toHaveLength(4);
    must(game, { type: 'build', structure: 'laser', site: shell(0, 2) });
    expect(errorOf(game, { type: 'build', structure: 'laser', site: shell(0, 3) })).toBe('no-capacity');
    expect(errorOf(game, { type: 'build', structure: 'laser', site: shell(1, 0) })).toBe('no-capacity');
    expect(game.sitesFor(game.structures().laser).every((site) => site.kind === 'surface')).toBe(true);
  });

  it('never exceed the shell, and ignore a shell the level lacks', () => {
    const game = newGame();
    game.state.science = 100;
    must(game, { type: 'research', tech: 'pad' });
    must(game, { type: 'research', tech: 'farShell' });
    expect(game.state.orbitSlots).toEqual([4, 6, 8]);
  });
});

describe('site features', () => {
  it('restrict a structure to the slots that have its feature', () => {
    const game = newGame({ world: { ...baseWorld, surfaceFeatures: { water: [2, 6] } } });
    expect(errorOf(game, { type: 'build', structure: 'dam', site: surface(0) })).toBe('invalid-site');
    expect(game.sitesFor(game.structures().dam)).toEqual([surface(2), surface(6)]);
    must(game, { type: 'build', structure: 'dam', site: surface(2) });
    game.tick();
    expect(game.state.power.generation).toBe(30);
    expect(errorOf(newGame(), { type: 'build', structure: 'dam', site: surface(2) })).toBe('invalid-site');
  });
});

describe('fuel', () => {
  const fuelled = (coal: number): Game => newGame({ start: { ...start, reserves: { coal } } });

  it('is burnt by a running plant, which stops when the reserve is gone', () => {
    const game = fuelled(1.5);
    must(game, { type: 'build', structure: 'coalPlant', site: surface(0) });
    must(game, { type: 'build', structure: 'lab', site: surface(1) });
    run(game, 20);
    expect(game.state.reserves.coal).toBeCloseTo(0.5);
    expect(game.state.power.generation).toBe(20);
    run(game, 10);
    expect(game.state.reserves.coal).toBe(0);
    run(game, 1);
    expect(game.state.power).toMatchObject({ generation: 0, factor: 0 });
  });

  it('runs a plant at the share its last fuel covers', () => {
    const game = fuelled(0.025);
    must(game, { type: 'build', structure: 'coalPlant', site: surface(0) });
    game.tick();
    expect(game.state.power.generation).toBeCloseTo(10);
    expect(game.state.reserves.coal).toBe(0);
  });

  it('is not burnt by a plant that is switched off, or one with no reserve at all', () => {
    const game = fuelled(10);
    must(game, { type: 'build', structure: 'coalPlant', site: surface(0) });
    must(game, { type: 'setEnabled', id: game.state.structures[0].id, enabled: false });
    run(game, 20);
    expect(game.state.reserves.coal).toBe(10);

    must(game, { type: 'build', structure: 'fissionPlant', site: surface(1) });
    game.tick();
    expect(game.state.power.generation).toBe(0);
  });

  it('is saved by a throttled plant, which covers only what the grid asks for', () => {
    const game = fuelled(100);
    game.state.science = 100;
    must(game, { type: 'research', tech: 'boilers' });
    must(game, { type: 'build', structure: 'coalPlant', site: surface(0) });
    must(game, { type: 'build', structure: 'battery', site: surface(1) });
    run(game, 20);
    expect(game.state.reserves.coal).toBe(100);
    expect(game.state.power).toMatchObject({ generation: 0, stored: 0 });

    must(game, { type: 'build', structure: 'lab', site: surface(2) });
    run(game, 20);
    expect(game.state.reserves.coal).toBeCloseTo(99.5);
    expect(game.state.power).toMatchObject({ generation: 10, factor: 1 });

    // Free power comes first: solar covers the lab and the coal plant idles.
    must(game, { type: 'build', structure: 'solarFarm', site: surface(0 + 7) });
    const coal = game.state.reserves.coal;
    game.tick();
    expect(game.state.power.generation).toBeGreaterThan(10);
    expect(game.state.reserves.coal).toBe(coal);
  });

  it('gives no power from a throttled plant that has run dry', () => {
    const game = fuelled(0);
    game.state.science = 100;
    must(game, { type: 'research', tech: 'boilers' });
    must(game, { type: 'build', structure: 'coalPlant', site: surface(0) });
    must(game, { type: 'build', structure: 'lab', site: surface(1) });
    game.tick();
    expect(game.state.power).toMatchObject({ generation: 0, factor: 0 });
    expect(game.state.reserves.coal).toBe(0);
  });

  it('is won from bodies that carry it', () => {
    const game = newGame();
    const ice = place(game, { kind: 'ice', mass: 8, r: 200 });
    ice.hp = 0;
    game.tick();
    expect(game.state.reserves.fusionFuel).toBe(8);
    const more = place(game, { kind: 'ice', mass: 2, r: 200 });
    more.hp = 0;
    game.tick();
    expect(game.state.reserves.fusionFuel).toBe(10);
  });
});

describe('ammunition', () => {
  it('is paid in minerals per shot, and a launcher that cannot pay holds fire', () => {
    const game = newGame();
    must(game, { type: 'build', structure: 'coalPlant', site: surface(4) });
    must(game, { type: 'build', structure: 'rocketBattery', site: surface(0) });
    run(game, 20 * 6);
    place(game, { kind: 'iron', mass: 50, r: 220 });
    game.state.minerals = 4;
    expect(ofType(game.tick(), 'fired')).toHaveLength(0);
    game.state.minerals = 12;
    expect(ofType(game.tick(), 'fired')).toHaveLength(1);
    expect(game.state.minerals).toBe(7);
  });
});

describe('validate', () => {
  const tech = (id: string, extra: Partial<TechDef> = {}): TechDef => ({
    id,
    cost: { science: 1 },
    effects: [],
    ...extra,
  });
  const content = (...techs: TechDef[]): Content => ({
    ...baseContent,
    techs: Object.fromEntries(techs.map((t) => [t.id, t])),
  });

  it('passes the test tree', () => {
    expect(validate(testContent)).toEqual([]);
    expect(validate(testContent, [level({ research: { pool: ['photovoltaics', 'fission'], choices: 3 } })])).toEqual(
      [],
    );
  });

  it('names every broken reference in a tree', () => {
    const broken = content(
      tech('a', { requires: ['ghost', 'b'] }),
      tech('b', { requires: ['c'] }),
      tech('c', { requires: ['a', 'd'] }),
      tech('d', { exclusive: 'alone', repeat: { growth: 0.5 }, cost: { science: -1 } }),
      tech('e', {
        effects: [
          { type: 'unlock', structure: 'deathStar' },
          { type: 'modify', structure: 'deathStar', stat: 'cost', op: 'add', value: 1 },
          { type: 'modify', structure: 'laser', stat: 'weapon.rnage', op: 'add', value: 1 },
          { type: 'modify', structure: 'laser', stat: 'weapon.range', op: 'add', value: 1 },
          { type: 'slots', shell: -1, count: 1 },
          { type: 'slots', shell: 0, count: 0 },
          { type: 'reserve', reserve: 'coal', amount: 0 },
          { type: 'reserve', reserve: 'coal', amount: 5 },
        ],
      }),
    );
    broken.techs.wrong = tech('f');
    broken.structures = { ...broken.structures, wrong: baseContent.structures.laser };
    expect(validate(broken)).toEqual([
      'structure wrong: id is laser',
      'tech a: requires unknown tech ghost',
      'tech a: requires itself',
      'tech b: requires itself',
      'tech c: requires itself',
      'tech d: repeat cost shrinks',
      'tech d: negative cost',
      'tech e: unknown structure deathStar',
      'tech e: unknown structure deathStar',
      'tech e: laser has no field weapon.rnage',
      'tech e: bad slots effect',
      'tech e: bad slots effect',
      'tech e: bad reserve effect',
      'tech wrong: id is f',
      'exclusive group alone: only one tech',
    ]);
  });

  it('names what a level asks for that is not there', () => {
    const broken: LevelDef = level({
      start: { minerals: 0, population: 1, techs: ['ghost', 'photovoltaics'], structures: ['laser', 'deathStar'] },
      research: { pool: ['fission', 'nope', 'farShell', 'pad', 'heavyRounds'], choices: 3 },
    });
    expect(validate(testContent, [level(), broken])).toEqual([
      'level 1: starts with unknown structure deathStar',
      'level 1: starts with unknown tech ghost',
      'level 1: pool has unknown tech nope',
      'level 1: farShell opens shell 7, which the level lacks',
    ]);
    const orphan = level({ research: { pool: ['fission'], choices: 0 } });
    expect(validate(testContent, [orphan])).toEqual([
      'level 0: fission requires photovoltaics, which is not in the pool',
    ]);
  });
});
