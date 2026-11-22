import { coreTechs, type Game, type TechDef } from '@engine';
import { humanize } from '../labels';

/** A card's face. Content outside the core tree still shows, under its id. */
export function cardFace(id: string): { name: string; line: string; text: string } {
  const card = coreTechs[id];
  if (!card) return { name: humanize(id), line: '', text: '' };
  return { name: card.name, line: humanize(card.line), text: card.text };
}

/** The cards the player may pick from now: the dealt hand, or the whole open pool. */
export function cardsOnTable(game: Game): TechDef[] {
  return game.level.research?.choices ? game.state.offer.map((id) => game.content.techs[id]) : game.researchable();
}
