# Astro Defender engine

The whole game with no rendering: a deterministic simulation that a renderer, a bot or a test
drives through commands and reads back through events and plain JSON state.

```sh
npm install
npm test          # tests, fails under 95% coverage
npm run sim       # baseline bots play the first level over 50 seeds (about a minute)
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

**Fuel is finite.** A level starts with reserves (coal, oil, uranium). A plant that names a
reserve burns it while it runs and stops when it is gone. A throttled plant covers only the
demand that free power did not, and burns in proportion. Ice that is destroyed adds fusion fuel.

## Research and the tech tree

The engine has no tech in it. It knows four **effects**, and a tech is a cost, prerequisites and
a list of effects:

| Effect | What it does |
| --- | --- |
| `unlock` | makes a structure buildable |
| `modify` | sets, adds to or multiplies one field of a structure, by path (`weapon.range`) |
| `slots` | opens orbital slots in a shell |
| `reserve` | adds to a fuel reserve |

A tech may also belong to an `exclusive` group (taking one locks the rest for the run) or be
repeatable at a growing cost. A level names its own `pool` of techs and how many cards are on
the table at once; the hand is dealt with the game's seeded RNG.

The tree itself is data in `src/tree/core.ts`: 41 cards. Changing a number, a prerequisite or
what a card does is an edit there and nowhere else. `validate()` checks that every card and level
refers to structures, fields, techs and shells that exist, and the tests run it, so a typo fails
a test instead of silently doing nothing. A card whose mechanic the engine lacks carries a `todo`
and no effects; 17 of the 41 do something today.

To add a card that needs something new, add the mechanic to the engine as a field on a structure
or a new effect, then describe the card with it.

## Layout

- `src/game.ts`: the simulation: `apply(command)`, `tick()`, events
- `src/modifiers.ts`: applies a `modify` effect to a structure definition
- `src/validate.ts`: checks content and levels for broken references
- `src/content.ts`: asteroids, structures and the first level, all as data
- `src/tree/core.ts`: the tech tree, as data
- `src/bot.ts`: `runGame` and baseline players, used to check balance
- `src/types.ts`: every definition, state, command and event type

## Not in yet

Mirrors, nukes, wormholes, moons, salvage, sight and compute, separate surface and orbital grids,
and pollution. The cards that wait for them say so in their `todo`.
