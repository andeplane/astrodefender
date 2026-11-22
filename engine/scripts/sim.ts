import { Game, baseContent, firstLevel, greedyPolicy, idlePolicy, runGame } from '../src/index';

// Plays the first level with a few baseline players over many seeds and prints how each did.
const players = {
  idle: idlePolicy,
  lasers: greedyPolicy(['laser']),
  railguns: greedyPolicy(['railgun']),
  mixed: greedyPolicy(['laser', 'railgun']),
};
const seeds = Number(process.argv[2] ?? 50);

for (const [name, policy] of Object.entries(players)) {
  let wins = 0;
  let population = 0;
  let unserved = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const result = runGame(new Game(baseContent, firstLevel, seed), policy, 40_000);
    if (result.status === 'won') wins++;
    population += result.population;
    unserved += result.stats.energyUnserved / Math.max(1, result.stats.energyUsed + result.stats.energyUnserved);
  }
  console.log(
    `${name.padEnd(9)} wins ${String(wins).padStart(3)}/${seeds}  ` +
      `avg population ${(population / seeds).toFixed(1).padStart(5)}  ` +
      `power unserved ${((100 * unserved) / seeds).toFixed(0)}%`,
  );
}
