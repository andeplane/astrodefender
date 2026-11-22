import { distance, type Site, type Vec } from '@engine';
import type { CreateCamera, PickSite } from './contract';

/** Room left around the spawn circle, as a share of its radius, so incoming bodies are visible. */
const MARGIN = 0.05;

/**
 * World +y points up on screen: `toScreen` flips y, so the planet turns counter-clockwise on
 * screen as it does in the maths. The renderer only uses `toScreen` and `scale`, so it agrees.
 */
export const createCamera: CreateCamera = (world) => {
  const radius = world.spawnRadius * (1 + MARGIN);
  let width = 0;
  let height = 0;
  let scale = 1;
  let centre: Vec = { x: 0, y: 0 };
  return {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get scale() {
      return scale;
    },
    resize(w, h, insets = { top: 0, bottom: 0 }) {
      width = w;
      height = h;
      const available = Math.max(0, h - insets.top - insets.bottom);
      // Never 0, so toWorld stays finite on a page that has not been laid out yet.
      scale = Math.max(Math.min(w, available) / (2 * radius), 1e-6);
      centre = { x: w / 2, y: insets.top + available / 2 };
    },
    toScreen(p) {
      return { x: centre.x + p.x * scale, y: centre.y - p.y * scale };
    },
    toWorld(p) {
      return { x: (p.x - centre.x) / scale, y: (centre.y - p.y) / scale };
    },
  };
};

export const pickSite: PickSite = (game, level, camera, point, reach) => {
  const world = level.world;
  const sites: Site[] = [];
  for (let slot = 0; slot < world.surfaceSlots; slot++) sites.push({ kind: 'surface', slot });
  world.shells.forEach((shell, index) => {
    const closed = (game.state.orbitSlots[index] ?? 0) === 0;
    for (let slot = 0; slot < shell.slots; slot++) {
      const site: Site = { kind: 'shell', shell: index, slot };
      // A closed orbit cannot be built on, but what already stands there can still be inspected.
      if (!closed || game.structureAt(site)) sites.push(site);
    }
  });
  let best: Site | null = null;
  let bestDistance = reach;
  for (const site of sites) {
    const d = distance(camera.toScreen(game.sitePosition(site)), point);
    if (d <= bestDistance) {
      best = site;
      bestDistance = d;
    }
  }
  return best;
};
