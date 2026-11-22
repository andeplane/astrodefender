import { Game, baseContent, firstLevel, greedyPolicy, idlePolicy, runGame } from '../src/index';

// Plays the first level with a few baseline players over many seeds and prints how each did.
const players = {
  idle: idlePolicy,
  lasers: greedyPolicy(['laser']),
  cannons: greedyPolicy(['cannon']),
  mixed: greedyPolicy(['laser', 'cannon']),
  research: greedyPolicy(['laser', 'railgun', 'rocketBattery', 'cannon'], 1),
  twoLabs: greedyPolicy(['laser', 'railgun', 'rocketBattery', 'cannon'], 2),
};
const seeds = Number(process.argv[2] ?? 50);

for (const [name, policy] of Object.entries(players)) {
  let wins = 0;
  let population = 0;
  let unserved = 0;
  let techs = 0;
  let ticks = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const game = new Game(baseContent, firstLevel, seed);
    const result = runGame(game, policy, 80_000);
    techs += game.state.techs.length;
    ticks += result.ticks;
    if (result.status === 'won') wins++;
    population += result.population;
    unserved += result.stats.energyUnserved / Math.max(1, result.stats.energyUsed + result.stats.energyUnserved);
  }
  console.log(
    `${name.padEnd(9)} wins ${String(wins).padStart(3)}/${seeds}  ` +
      `avg population ${(population / seeds).toFixed(1).padStart(5)}  ` +
      `power unserved ${((100 * unserved) / seeds).toFixed(0)}%  ` +
      `techs ${(techs / seeds).toFixed(1)}  ` +
      `minutes ${(((ticks / seeds) * firstLevel.world.dt) / 60).toFixed(1)}`,
  );
}
