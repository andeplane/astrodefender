# Astro Defender engine

The whole game with no rendering: a deterministic simulation that a renderer, a bot or a test
drives through commands and reads back through events and plain JSON state.

```sh
npm install
npm test          # tests, fails under 95% coverage
npm run sim       # baseline bots play the first level over 50 seeds
```

## Model

**The planet is an atom.** Structures go on a fixed number of slots: 8 on the rotating surface,
and 4, 6 and 8 in three orbital shells. Inner shells orbit faster (angular speed falls off as
r^-1.5). Slots are the scarce thing, and where a slot is at a given moment decides what it can
see and whether it is in sunlight.

**Asteroids are on rails.** Each body has a radius, an angle and a direction. Every tick it
loses altitude (a constant inflow plus atmospheric drag that grows exponentially near the
planet), orbits faster as it drops, and ablates. Small bodies sink and burn up quickly; big ones
reach the ground and cost population, which is the player's health.

**Energy runs everything.** Generators feed one grid; lasers (while firing), railguns (while
charging), relativity fields and labs draw from it. When demand exceeds generation plus
batteries, everything powered runs at the share that was met. Surface solar follows daylight as
the planet turns; orbital solar only goes dark in the planet's shadow.

**Breaking versus vaporizing.** Thermal damage vaporizes: no fragments, half the minerals.
Kinetic damage shatters a body into fragments that each need dealing with, and knocks survivors
back out. Kills low down pay more minerals than kills high up. Resistances are partial, never
immunity.

**Waves** start on their own after a build phase; calling one early pays a bonus.

## Layout

- `src/game.ts` — the simulation: `apply(command)`, `tick()`, events
- `src/content.ts` — asteroids, structures, techs and the first level, all as data
- `src/bot.ts` — `runGame` and baseline players, used to check balance
- `src/types.ts` — every definition, state, command and event type

## Not in yet

Mirrors, nukes, wormholes, moons, separate surface and orbital grids, fuel and pollution for
power plants, compute, and a real tech tree (the four techs in `content.ts` are placeholders).
