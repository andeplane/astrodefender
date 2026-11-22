export type DamageType = 'thermal' | 'kinetic' | 'explosive';
export type SiteKind = 'surface' | 'shell';

/** Where a structure sits: a slot on the rotating planet, or a slot in an orbital shell. */
export type Site =
  | { kind: 'surface'; slot: number }
  | { kind: 'shell'; shell: number; slot: number };

export interface ShellDef {
  radius: number;
  slots: number;
}

export interface WorldDef {
  /** Seconds per tick. The simulation only ever advances in whole ticks. */
  dt: number;
  planetRadius: number;
  /** Planet rotation, rad/s. Surface slots turn with it. */
  planetSpin: number;
  /** Orbital angular speed at the planet's surface, rad/s. Falls off as r^-1.5. */
  kepler: number;
  /** Scale height of the atmosphere: density is exp(-(r - planetRadius) / height). */
  atmosphereHeight: number;
  /** Radial decay every asteroid has outside the atmosphere, units/s. */
  inflow: number;
  surfaceSlots: number;
  shells: ShellDef[];
  spawnRadius: number;
  /** Mass at which drag is exactly dragCoef; lighter bodies sink faster. */
  refMass: number;
  /** Below this mass an asteroid has burnt up. */
  burnMass: number;
  /** Fragments lighter than this are dust and are not spawned. */
  minFragmentMass: number;
  /** Share of minerals kept when a body is vaporized rather than broken. */
  vaporYield: number;
  /** Share of minerals kept for a kill at spawn radius; a kill at the surface keeps all. */
  highOrbitYield: number;
}

export interface FragmentDef {
  count: number;
  /** Share of the parent's mass that survives as fragments. */
  massFraction: number;
  /** Defaults to the parent's kind. */
  kind?: string;
}

export interface AsteroidDef {
  id: string;
  /** Hit points per unit of mass. */
  toughness: number;
  /** Damage multiplier per damage type. Never 0: every threat has more than one answer. */
  resist: Record<DamageType, number>;
  dragCoef: number;
  /** Mass lost per second at full atmospheric density, times mass^(2/3). */
  ablation: number;
  /** Minerals per unit of mass destroyed. */
  yield: number;
  /** Population lost per unit of mass on impact. */
  impact: number;
  fragments?: FragmentDef;
}

export interface GeneratorDef {
  output: number;
  /** Solar output follows daylight on the surface and the planet's shadow in orbit. */
  source: 'constant' | 'solar';
}

export interface BeamDef {
  type: 'beam';
  range: number;
  dps: number;
  damage: DamageType;
  /** Power drawn while firing. */
  draw: number;
}

export interface LauncherDef {
  type: 'launcher';
  range: number;
  hit: number;
  damage: DamageType;
  /** Power drawn while charging. */
  draw: number;
  energyPerShot: number;
  speed: number;
  /** Radius gained by a refMass body per hit; heavier bodies move less. */
  knockback: number;
}

export interface FieldDef {
  radius: number;
  /** Share of time removed for bodies inside the field at full power. */
  slow: number;
  draw: number;
}

export interface LabDef {
  /** Science per second at full power. */
  science: number;
  draw: number;
}

export interface StructureDef {
  id: string;
  cost: number;
  sites: SiteKind[];
  requires?: string[];
  generator?: GeneratorDef;
  battery?: { capacity: number };
  weapon?: BeamDef | LauncherDef;
  field?: FieldDef;
  lab?: LabDef;
}

export interface TechDef {
  id: string;
  cost: number;
  requires?: string[];
}

export interface Content {
  asteroids: Record<string, AsteroidDef>;
  structures: Record<string, StructureDef>;
  techs: Record<string, TechDef>;
}

export interface SpawnDef {
  /** Seconds after the wave starts. */
  at: number;
  kind: string;
  mass: number;
  count?: number;
  /** Seconds between bodies when count > 1. */
  interval?: number;
  /** 1 is prograde (with the planet's spin), -1 retrograde. */
  direction?: 1 | -1;
}

export interface WaveDef {
  spawns: SpawnDef[];
  reward: number;
}

export interface LevelDef {
  world: WorldDef;
  waves: WaveDef[];
  start: { minerals: number; population: number; techs: string[] };
  /** Seconds of build time before each wave starts on its own. */
  waveDelay: number;
  /** Minerals per second skipped when the player calls a wave early. */
  earlyCallBonus: number;
  /** Share of the build cost returned on sale. */
  refund: number;
}

export interface Structure {
  id: number;
  def: string;
  site: Site;
  enabled: boolean;
  /** Energy stored towards the next launcher shot. */
  charge: number;
}

export interface Asteroid {
  id: number;
  kind: string;
  mass: number;
  hp: number;
  r: number;
  theta: number;
  direction: 1 | -1;
  /** Damage already in flight towards this body, so launchers do not overkill. */
  pending: number;
  lastHit: DamageType | null;
}

export interface Projectile {
  target: number;
  hit: number;
  damage: DamageType;
  knockback: number;
  ticksLeft: number;
}

export interface QueuedSpawn {
  atTick: number;
  kind: string;
  mass: number;
  direction: 1 | -1;
}

export interface WaveState {
  /** The running wave, or the next one to start. */
  index: number;
  active: boolean;
  elapsed: number;
  /** Ticks until the next wave starts on its own. */
  countdown: number;
  queue: QueuedSpawn[];
}

export interface PowerState {
  generation: number;
  demand: number;
  /** Share of demand that was met this tick, 0 to 1. Everything powered scales by it. */
  factor: number;
  stored: number;
  capacity: number;
}

export interface Stats {
  destroyed: number;
  burnt: number;
  impacts: number;
  mineralsEarned: number;
  energyUsed: number;
  energyUnserved: number;
}

export interface GameState {
  tick: number;
  rng: number;
  nextId: number;
  status: 'playing' | 'won' | 'lost';
  minerals: number;
  science: number;
  population: number;
  techs: string[];
  structures: Structure[];
  asteroids: Asteroid[];
  projectiles: Projectile[];
  wave: WaveState;
  power: PowerState;
  stats: Stats;
}

export type Command =
  | { type: 'build'; structure: string; site: Site }
  | { type: 'sell'; id: number }
  | { type: 'setEnabled'; id: number; enabled: boolean }
  | { type: 'research'; tech: string }
  | { type: 'startWave' };

export type CommandError =
  | 'game-over'
  | 'unknown-structure'
  | 'unknown-tech'
  | 'unknown-id'
  | 'locked'
  | 'already-researched'
  | 'cannot-afford'
  | 'invalid-site'
  | 'site-occupied'
  | 'wave-active';

export type CommandResult = { ok: true } | { ok: false; error: CommandError };

export type GameEvent =
  | { type: 'waveStarted'; wave: number; bonus: number }
  | { type: 'waveCleared'; wave: number; reward: number }
  | { type: 'spawned'; id: number; kind: string }
  | { type: 'destroyed'; id: number; minerals: number; fragments: number }
  | { type: 'burnt'; id: number }
  | { type: 'impact'; id: number; population: number }
  | { type: 'fired'; structure: number; target: number }
  | { type: 'ended'; status: 'won' | 'lost' };
