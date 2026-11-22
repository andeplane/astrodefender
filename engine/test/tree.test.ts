import { describe, expect, it } from 'vitest';
import { Game, baseContent, coreTechs, firstLevel, playableTechs, validate } from '../src/index';
import { RESERVES, level } from './helpers';

describe('core tech tree', () => {
  it('refers only to things the engine and the content have', () => {
    expect(validate(baseContent, [firstLevel])).toEqual([]);
  });

  it('has 41 cards, each either doing something or saying what it waits for', () => {
    const cards = Object.values(coreTechs);
    expect(cards).toHaveLength(41);
    for (const card of cards) {
      expect(card.effects.length > 0 || card.todo !== undefined, card.id).toBe(true);
      expect(card.name.length, card.id).toBeGreaterThan(0);
      expect(card.text.length, card.id).toBeLessThan(120);
    }
    expect(playableTechs).toHaveLength(17);
  });

  it('pairs its either/or cards two by two', () => {
    const groups = new Map<string, string[]>();
    for (const card of Object.values(coreTechs)) {
      if (card.exclusive) groups.set(card.exclusive, [...(groups.get(card.exclusive) ?? []), card.id]);
    }
    expect([...groups.keys()].sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    for (const pair of groups.values()) expect(pair).toHaveLength(2);
  });

  it('can be researched from end to end, with every modifier fitting its structure', () => {
    const start = { minerals: 0, population: 100, techs: [], structures: [], reserves: RESERVES };
    const game = new Game(baseContent, level({ start }), 1);
    Object.assign(game.state, { minerals: 1e6, science: 1e6, exotics: 1e6 });
    let progress = true;
    while (progress) {
      progress = false;
      for (const tech of game.researchable()) {
        if (!tech.repeat || !game.state.techs.includes(tech.id))
          progress = game.apply({ type: 'research', tech: tech.id }).ok || progress;
      }
    }
    // One of each either/or pair is left out.
    expect(new Set(game.state.techs).size).toBe(41 - 5);
    expect(Object.keys(game.structures())).toEqual(Object.keys(baseContent.structures));
    expect(game.structures().coalPlant.generator?.throttled).toBe(true);
    expect(game.structures().dam.battery?.capacity).toBe(1500);
    expect(game.state.unlocked).toContain('fusionPlant');
  });

  it('only puts playable cards in the first level', () => {
    for (const id of firstLevel.research?.pool ?? []) expect(playableTechs, id).toContain(id);
    for (const id of firstLevel.start.structures ?? []) expect(baseContent.structures[id], id).toBeDefined();
  });
});
