import { applyModifier } from './modifiers';
import { TAU, type Vec, clamp, distance, fromPolar, nextRandom, segmentHitsCircle } from './math';
import type {
  Asteroid,
  Command,
  CommandError,
  CommandResult,
  Content,
  Cost,
  DamageType,
  Effect,
  GameEvent,
  GameState,
  GeneratorDef,
  LevelDef,
  Modifier,
  QueuedSpawn,
  Resource,
  Site,
  Structure,
  StructureDef,
  TechDef,
} from './types';

const RESOURCES: Resource[] = ['minerals', 'science', 'exotics'];
const OK: CommandResult = { ok: true };
const fail = (error: CommandError): CommandResult => ({ ok: false, error });

/** The line of sight grazes the surface a little, so a surface tower is not blocked by its own ground. */
const HORIZON = 0.98;

interface ActiveField {
  at: Vec;
  radius: number;
  scale: number;
}

/**
 * The whole game, with no rendering. Commands go in through `apply`, time advances one fixed
 * step per `tick`, and everything that happened comes back as events. The state is plain JSON,
 * so the same seed and the same commands always give the same game.
 */
export class Game {
  readonly content: Content;
  readonly level: LevelDef;
  state: GameState;
  /** Structure definitions with the state's modifiers applied, rebuilt when the modifiers change. */
  private modified?: { modifiers: Modifier[]; count: number; defs: Record<string, StructureDef> };

  constructor(content: Content, level: LevelDef, seed: number, state?: GameState) {
    this.content = content;
    this.level = level;
    if (state) {
      this.state = state;
      return;
    }
    this.state = {
      tick: 0,
      rng: seed | 0,
      nextId: 1,
      status: 'playing',
      minerals: level.start.minerals,
      science: 0,
      exotics: 0,
      population: level.start.population,
      techs: [],
      offer: [],
      unlocked: [...(level.start.structures ?? Object.keys(content.structures))],
      modifiers: [],
      orbitSlots: level.world.shells.map((shell) => shell.open ?? shell.slots),
      reserves: { ...level.start.reserves },
      structures: [],
      asteroids: [],
      projectiles: [],
      wave: { index: 0, active: false, elapsed: 0, countdown: this.ticks(level.waveDelay), queue: [] },
      power: { generation: 0, demand: 0, factor: 1, stored: 0, capacity: 0 },
      stats: { destroyed: 0, burnt: 0, impacts: 0, mineralsEarned: 0, energyUsed: 0, energyUnserved: 0 },
    };
    for (const id of level.start.techs) this.take(content.techs[id]);
    this.dealOffer();
  }

  /** Continue from a saved state. The copy is deep, so the save is never mutated. */
  static restore(content: Content, level: LevelDef, state: GameState): Game {
    return new Game(content, level, 0, structuredClone(state));
  }

  get time(): number {
    return this.state.tick * this.level.world.dt;
  }

  private ticks(seconds: number): number {
    return Math.round(seconds / this.level.world.dt);
  }

  private random(): number {
    const { value, state } = nextRandom(this.state.rng);
    this.state.rng = state;
    return value;
  }

  /** Angular speed of a circular orbit at radius r. */
  orbitalSpeed(r: number): number {
    const world = this.level.world;
    return world.kepler * Math.pow(world.planetRadius / r, 1.5);
  }

  density(r: number): number {
    const world = this.level.world;
    return Math.exp(-(r - world.planetRadius) / world.atmosphereHeight);
  }

  sitePosition(site: Site, time = this.time): Vec {
    const world = this.level.world;
    if (site.kind === 'surface') {
      return fromPolar(world.planetRadius, (site.slot / world.surfaceSlots) * TAU + world.planetSpin * time);
    }
    const shell = world.shells[site.shell];
    return fromPolar(shell.radius, (site.slot / shell.slots) * TAU + this.orbitalSpeed(shell.radius) * time);
  }

  /** Every structure definition as it stands now, with what research has changed. */
  structures(): Record<string, StructureDef> {
    const { modifiers } = this.state;
    if (this.modified?.modifiers !== modifiers || this.modified.count !== modifiers.length) {
      const defs = { ...this.content.structures };
      for (const modifier of modifiers) defs[modifier.structure] = applyModifier(defs[modifier.structure], modifier);
      this.modified = { modifiers, count: modifiers.length, defs };
    }
    return this.modified.defs;
  }

  /** Share of full sunlight at a site. The sun sits far away along +x. */
  sunlight(site: Site, time = this.time): number {
    const at = this.sitePosition(site, time);
    const radius = this.level.world.planetRadius;
    if (site.kind === 'surface') return Math.max(0, at.x / radius);
    return at.x < 0 && Math.abs(at.y) < radius ? 0 : 1;
  }

  private light(source: GeneratorDef['source'], site: Site): number {
    if (source === 'constant') return 1;
    const sun = this.sunlight(site);
    return source === 'daylight' && sun > 0 ? 1 : sun;
  }

  private validSite(site: Site): boolean {
    const world = this.level.world;
    if (!Number.isInteger(site.slot) || site.slot < 0) return false;
    if (site.kind === 'surface') return site.slot < world.surfaceSlots;
    const shell = world.shells[site.shell];
    return shell !== undefined && site.slot < shell.slots;
  }

  structureAt(site: Site): Structure | undefined {
    return this.state.structures.find(
      (s) =>
        s.site.kind === site.kind &&
        s.site.slot === site.slot &&
        (s.site.kind === 'surface' || (site.kind === 'shell' && s.site.shell === site.shell)),
    );
  }

  /** True when the shell holds as many structures as its open slots allow. */
  private shellFull(shell: number): boolean {
    const built = this.state.structures.filter((s) => s.site.kind === 'shell' && s.site.shell === shell).length;
    return built >= this.state.orbitSlots[shell];
  }

  private hasFeature(def: StructureDef, site: Site): boolean {
    if (!def.feature) return true;
    return site.kind === 'surface' && (this.level.world.surfaceFeatures?.[def.feature] ?? []).includes(site.slot);
  }

  freeSites(kind: Site['kind']): Site[] {
    const world = this.level.world;
    const sites: Site[] = [];
    if (kind === 'surface') {
      for (let slot = 0; slot < world.surfaceSlots; slot++) sites.push({ kind, slot });
    } else {
      world.shells.forEach((shell, index) => {
        if (this.shellFull(index)) return;
        for (let slot = 0; slot < shell.slots; slot++) sites.push({ kind, shell: index, slot });
      });
    }
    return sites.filter((site) => !this.structureAt(site));
  }

  /** The free sites a structure could be built on right now. */
  sitesFor(def: StructureDef): Site[] {
    return def.sites.flatMap((kind) => this.freeSites(kind)).filter((site) => this.hasFeature(def, site));
  }

  canBuild(def: StructureDef): boolean {
    return this.state.unlocked.includes(def.id) && this.state.minerals >= def.cost;
  }

  private timesTaken(tech: string): number {
    return this.state.techs.filter((id) => id === tech).length;
  }

  /** What the tech costs now: a repeatable one grows each time it is taken. */
  techCost(tech: TechDef): Cost {
    const scale = Math.pow(tech.repeat?.growth ?? 1, this.timesTaken(tech.id));
    const cost: Cost = {};
    for (const resource of RESOURCES) {
      const amount = tech.cost[resource];
      if (amount !== undefined) cost[resource] = amount * scale;
    }
    return cost;
  }

  canAfford(cost: Cost): boolean {
    return RESOURCES.every((resource) => this.state[resource] >= (cost[resource] ?? 0));
  }

  /** Why a tech cannot be taken, whatever the player can pay. */
  private blocked(tech: TechDef): CommandError | undefined {
    const { techs } = this.state;
    if (!tech.repeat && techs.includes(tech.id)) return 'already-researched';
    if (!(tech.requires ?? []).every((id) => techs.includes(id))) return 'locked';
    const rival = techs.some((id) => id !== tech.id && this.content.techs[id].exclusive === tech.exclusive);
    if (tech.exclusive && rival) return 'excluded';
    return undefined;
  }

  private pool(): TechDef[] {
    const ids = this.level.research?.pool ?? Object.keys(this.content.techs);
    return ids.map((id) => this.content.techs[id]);
  }

  /** The techs the player may pick from now: the cards on the table, or the whole open pool. */
  researchable(): TechDef[] {
    if (this.level.research?.choices) return this.state.offer.map((id) => this.content.techs[id]);
    return this.pool().filter((tech) => !this.blocked(tech));
  }

  /** Deal a fresh hand of cards from the techs that can be taken. Does nothing in an open pool. */
  private dealOffer(): void {
    const choices = this.level.research?.choices ?? 0;
    const offer: string[] = [];
    if (choices > 0) {
      const candidates = this.pool().filter((tech) => !this.blocked(tech));
      while (offer.length < choices && candidates.length > 0) {
        const [dealt] = candidates.splice(Math.floor(this.random() * candidates.length), 1);
        offer.push(dealt.id);
      }
    }
    this.state.offer = offer;
  }

  private take(tech: TechDef): void {
    this.state.techs.push(tech.id);
    for (const effect of tech.effects) this.applyEffect(effect);
  }

  private applyEffect(effect: Effect): void {
    const state = this.state;
    switch (effect.type) {
      case 'unlock':
        if (!state.unlocked.includes(effect.structure)) state.unlocked.push(effect.structure);
        break;
      case 'modify':
        state.modifiers.push(effect);
        break;
      case 'slots': {
        const shell = this.level.world.shells[effect.shell];
        // A level without that shell has nothing to open.
        if (shell)
          state.orbitSlots[effect.shell] = Math.min(shell.slots, state.orbitSlots[effect.shell] + effect.count);
        break;
      }
      case 'reserve':
        state.reserves[effect.reserve] = (state.reserves[effect.reserve] ?? 0) + effect.amount;
        break;
    }
  }

  apply(command: Command): CommandResult {
    const state = this.state;
    if (state.status !== 'playing') return fail('game-over');
    switch (command.type) {
      case 'build': {
        const def = this.structures()[command.structure];
        const site = command.site;
        if (!def) return fail('unknown-structure');
        if (!state.unlocked.includes(def.id)) return fail('locked');
        if (!this.validSite(site) || !def.sites.includes(site.kind) || !this.hasFeature(def, site)) {
          return fail('invalid-site');
        }
        if (this.structureAt(site)) return fail('site-occupied');
        if (site.kind === 'shell' && this.shellFull(site.shell)) return fail('no-capacity');
        if (state.minerals < def.cost) return fail('cannot-afford');
        state.minerals -= def.cost;
        state.structures.push({ id: state.nextId++, def: def.id, site, enabled: true, charge: 0 });
        return OK;
      }
      case 'sell': {
        const index = state.structures.findIndex((s) => s.id === command.id);
        if (index < 0) return fail('unknown-id');
        const [sold] = state.structures.splice(index, 1);
        state.minerals += this.structures()[sold.def].cost * this.level.refund;
        return OK;
      }
      case 'setEnabled': {
        const structure = state.structures.find((s) => s.id === command.id);
        if (!structure) return fail('unknown-id');
        structure.enabled = command.enabled;
        return OK;
      }
      case 'research': {
        const tech = this.content.techs[command.tech];
        if (!tech) return fail('unknown-tech');
        const blocked = this.blocked(tech);
        if (blocked) return fail(blocked);
        if (!this.researchable().includes(tech)) return fail('not-offered');
        const cost = this.techCost(tech);
        if (!this.canAfford(cost)) return fail('cannot-afford');
        for (const resource of RESOURCES) state[resource] -= cost[resource] ?? 0;
        this.take(tech);
        this.dealOffer();
        return OK;
      }
      case 'startWave': {
        if (state.wave.active) return fail('wave-active');
        const bonus = state.wave.countdown * this.level.world.dt * this.level.earlyCallBonus;
        state.minerals += bonus;
        state.wave.countdown = 0;
        return OK;
      }
    }
  }

  private pickTarget(from: Vec, range: number, skipDoomed: boolean): Asteroid | undefined {
    const blocker = this.level.world.planetRadius * HORIZON;
    let best: Asteroid | undefined;
    for (const asteroid of this.state.asteroids) {
      if (asteroid.hp <= 0 || (skipDoomed && asteroid.pending >= asteroid.hp)) continue;
      if (best && asteroid.r >= best.r) continue;
      const at = fromPolar(asteroid.r, asteroid.theta);
      if (distance(from, at) > range || segmentHitsCircle(from, at, blocker)) continue;
      best = asteroid;
    }
    return best;
  }

  private hurt(asteroid: Asteroid, amount: number, damage: DamageType): void {
    asteroid.hp -= amount * this.content.asteroids[asteroid.kind].resist[damage];
    asteroid.lastHit = damage;
  }

  private startWave(events: GameEvent[], bonus: number): void {
    const wave = this.state.wave;
    const queue: QueuedSpawn[] = [];
    for (const spawn of this.level.waves[wave.index].spawns) {
      for (let i = 0; i < (spawn.count ?? 1); i++) {
        queue.push({
          atTick: this.ticks(spawn.at + i * (spawn.interval ?? 0)),
          kind: spawn.kind,
          mass: spawn.mass,
          direction: spawn.direction ?? 1,
        });
      }
    }
    wave.queue = queue.sort((a, b) => a.atTick - b.atTick);
    wave.active = true;
    wave.elapsed = 0;
    events.push({ type: 'waveStarted', wave: wave.index, bonus });
  }

  private spawn(kind: string, mass: number, r: number, theta: number, direction: 1 | -1): Asteroid {
    const asteroid: Asteroid = {
      id: this.state.nextId++,
      kind,
      mass,
      hp: mass * this.content.asteroids[kind].toughness,
      r,
      theta,
      direction,
      pending: 0,
      lastHit: null,
    };
    this.state.asteroids.push(asteroid);
    return asteroid;
  }

  /** A destroyed body pays out minerals and, unless it was vaporized, breaks into fragments. */
  private destroy(asteroid: Asteroid, events: GameEvent[]): void {
    const state = this.state;
    const world = this.level.world;
    const def = this.content.asteroids[asteroid.kind];
    const vaporized = asteroid.lastHit === 'thermal';
    let fragmentMass = 0;
    let fragments = 0;
    if (def.fuel) {
      state.reserves[def.fuel.reserve] = (state.reserves[def.fuel.reserve] ?? 0) + asteroid.mass * def.fuel.perMass;
    }
    if (def.fragments && !vaporized) {
      const each = (asteroid.mass * def.fragments.massFraction) / def.fragments.count;
      if (each >= world.minFragmentMass) {
        fragments = def.fragments.count;
        fragmentMass = each * fragments;
        for (let i = 0; i < fragments; i++) {
          const r = Math.max(world.planetRadius + 1, asteroid.r + (this.random() - 0.5) * 10);
          const theta = asteroid.theta + (this.random() - 0.5) * 0.3;
          this.spawn(def.fragments.kind ?? asteroid.kind, each, r, theta, asteroid.direction);
        }
      }
    }
    const height = clamp((asteroid.r - world.planetRadius) / (world.spawnRadius - world.planetRadius), 0, 1);
    const minerals =
      (asteroid.mass - fragmentMass) *
      def.yield *
      (1 - height * (1 - world.highOrbitYield)) *
      (vaporized ? world.vaporYield : 1);
    state.minerals += minerals;
    state.stats.mineralsEarned += minerals;
    state.stats.destroyed++;
    events.push({ type: 'destroyed', id: asteroid.id, minerals, fragments });
  }

  tick(): GameEvent[] {
    const state = this.state;
    if (state.status !== 'playing') return [];
    const events: GameEvent[] = [];
    const world = this.level.world;
    const dt = world.dt;

    // Power: add up generation and what every enabled consumer asks for this tick.
    const structures = this.structures();
    let firm = 0;
    let flexible = 0;
    const fuelLeft = { ...state.reserves };
    const burners: { reserve: string; amount: number; throttled: boolean }[] = [];
    let demand = 0;
    let capacity = 0;
    const beams: { structure: Structure; target: Asteroid; dps: number; damage: DamageType }[] = [];
    const charging: { structure: Structure; draw: number }[] = [];
    const fields: { at: Vec; radius: number; slow: number }[] = [];
    let science = 0;
    for (const structure of state.structures) {
      const def = structures[structure.def];
      capacity += def.battery?.capacity ?? 0;
      delete structure.target;
      if (!structure.enabled) continue;
      if (def.generator) {
        const { fuel, throttled } = def.generator;
        let output = def.generator.output * this.light(def.generator.source, structure.site);
        if (fuel) {
          // A plant short of fuel runs at the share its reserve still covers.
          const want = fuel.rate * dt;
          const have = fuelLeft[fuel.reserve] ?? 0;
          const share = want <= have ? 1 : have / want;
          fuelLeft[fuel.reserve] = have - want * share;
          output *= share;
          burners.push({ reserve: fuel.reserve, amount: want * share, throttled });
        }
        if (throttled) flexible += output;
        else firm += output;
      }
      if (def.weapon?.type === 'beam') {
        const target = this.pickTarget(this.sitePosition(structure.site), def.weapon.range, false);
        if (target) {
          structure.target = target.id;
          demand += def.weapon.draw;
          beams.push({ structure, target, dps: def.weapon.dps, damage: def.weapon.damage });
        }
      } else if (def.weapon && structure.charge < def.weapon.energyPerShot) {
        demand += def.weapon.draw;
        charging.push({ structure, draw: def.weapon.draw });
      }
      if (def.field) {
        demand += def.field.draw;
        fields.push({ at: this.sitePosition(structure.site), radius: def.field.radius, slow: def.field.slow });
      }
      if (def.lab) {
        demand += def.lab.draw;
        science += def.lab.science;
      }
    }
    // Throttled plants cover only what the rest leaves unmet, and burn fuel in proportion.
    const flexUsed = clamp(demand - firm, 0, flexible);
    const generation = firm + flexUsed;
    const throttle = flexible > 0 ? flexUsed / flexible : 0;
    for (const burner of burners) {
      const burnt = burner.amount * (burner.throttled ? throttle : 1);
      state.reserves[burner.reserve] = Math.max(0, state.reserves[burner.reserve] - burnt);
    }
    const needed = demand * dt;
    const available = generation * dt + Math.min(state.power.stored, capacity);
    const factor = needed > 0 ? Math.min(1, available / needed) : 1;
    state.power = {
      generation,
      demand,
      factor,
      capacity,
      stored: clamp(available - needed * factor, 0, capacity),
    };
    state.stats.energyUsed += needed * factor;
    state.stats.energyUnserved += needed * (1 - factor);

    // Everything powered runs at the share of demand that was met.
    state.science += science * factor * dt;
    for (const beam of beams) {
      this.hurt(beam.target, beam.dps * factor * dt, beam.damage);
    }
    for (const { structure, draw } of charging) structure.charge += draw * factor * dt;
    for (const structure of state.structures) {
      const weapon = structures[structure.def].weapon;
      if (!structure.enabled || weapon?.type !== 'launcher' || structure.charge < weapon.energyPerShot) continue;
      if (state.minerals < weapon.ammo) continue;
      const from = this.sitePosition(structure.site);
      const target = this.pickTarget(from, weapon.range, true);
      if (!target) continue;
      structure.charge = 0;
      state.minerals -= weapon.ammo;
      target.pending += weapon.hit * this.content.asteroids[target.kind].resist[weapon.damage];
      const flight = distance(from, fromPolar(target.r, target.theta)) / weapon.speed;
      state.projectiles.push({
        target: target.id,
        hit: weapon.hit,
        damage: weapon.damage,
        knockback: weapon.knockback,
        ticksLeft: Math.max(1, this.ticks(flight)),
      });
      events.push({ type: 'fired', structure: structure.id, target: target.id });
    }

    // Projectiles in flight. One whose target is already gone is wasted.
    state.projectiles = state.projectiles.filter((projectile) => {
      if (--projectile.ticksLeft > 0) return true;
      const target = state.asteroids.find((a) => a.id === projectile.target);
      if (target && target.hp > 0) {
        target.pending -= projectile.hit * this.content.asteroids[target.kind].resist[projectile.damage];
        this.hurt(target, projectile.hit, projectile.damage);
        target.r = Math.min(world.spawnRadius, target.r + (projectile.knockback * world.refMass) / target.mass);
      }
      return false;
    });

    // Deaths first, so fragments move this tick like every other body.
    const alive = state.asteroids;
    state.asteroids = [];
    for (const asteroid of alive) {
      if (asteroid.hp > 0) state.asteroids.push(asteroid);
      else this.destroy(asteroid, events);
    }

    const activeFields: ActiveField[] = fields.map((f) => ({ at: f.at, radius: f.radius, scale: 1 - f.slow * factor }));
    state.asteroids = state.asteroids.filter((asteroid) => this.advance(asteroid, activeFields, events));

    this.advanceWave(events);
    state.tick++;

    if (state.population <= 0) {
      state.population = 0;
      state.status = 'lost';
    } else if (state.wave.index >= this.level.waves.length) {
      state.status = 'won';
    }
    if (state.status !== 'playing') events.push({ type: 'ended', status: state.status });
    return events;
  }

  /** Move one body along its decaying orbit. Returns false when it burnt up or hit the planet. */
  private advance(asteroid: Asteroid, fields: ActiveField[], events: GameEvent[]): boolean {
    const state = this.state;
    const world = this.level.world;
    const def = this.content.asteroids[asteroid.kind];
    const at = fromPolar(asteroid.r, asteroid.theta);
    // Fields do not stack: the strongest one a body sits in sets its clock.
    let scale = 1;
    for (const field of fields) {
      if (distance(field.at, at) <= field.radius) scale = Math.min(scale, field.scale);
    }
    const dt = world.dt * scale;
    const density = this.density(asteroid.r);

    const lost = def.ablation * density * Math.pow(asteroid.mass, 2 / 3) * dt;
    if (asteroid.mass - lost < world.burnMass) {
      state.stats.burnt++;
      events.push({ type: 'burnt', id: asteroid.id });
      return false;
    }
    asteroid.hp *= (asteroid.mass - lost) / asteroid.mass;
    asteroid.mass -= lost;

    const drag = def.dragCoef * density * Math.cbrt(world.refMass / asteroid.mass);
    asteroid.r -= (world.inflow + drag) * dt;
    asteroid.theta += asteroid.direction * this.orbitalSpeed(Math.max(asteroid.r, world.planetRadius)) * dt;

    if (asteroid.r <= world.planetRadius) {
      const population = def.impact * asteroid.mass;
      state.population -= population;
      state.stats.impacts++;
      events.push({ type: 'impact', id: asteroid.id, population });
      return false;
    }
    return true;
  }

  private advanceWave(events: GameEvent[]): void {
    const state = this.state;
    const wave = state.wave;
    if (!wave.active) {
      if (wave.index >= this.level.waves.length) return;
      if (wave.countdown-- > 0) return;
      // A countdown of exactly 0 was set by an early call, which already paid its bonus.
      this.startWave(events, 0);
    }
    while (wave.queue.length > 0 && wave.queue[0].atTick <= wave.elapsed) {
      const next = wave.queue.shift() as QueuedSpawn;
      const spawned = this.spawn(
        next.kind,
        next.mass,
        this.level.world.spawnRadius,
        this.random() * TAU,
        next.direction,
      );
      events.push({ type: 'spawned', id: spawned.id, kind: spawned.kind });
    }
    wave.elapsed++;
    if (wave.queue.length === 0 && state.asteroids.length === 0) {
      const reward = this.level.waves[wave.index].reward;
      state.minerals += reward;
      events.push({ type: 'waveCleared', wave: wave.index, reward });
      wave.index++;
      wave.active = false;
      wave.countdown = this.ticks(this.level.waveDelay);
    }
  }
}
