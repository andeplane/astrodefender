import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths, so the build works under any GitHub Pages prefix.
  base: './',
  resolve: {
    alias: { '@engine': new URL('../engine/src/index.ts', import.meta.url).pathname },
  },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts only wires the modules to the page; contract.ts is types.
      exclude: ['src/main.ts', 'src/contract.ts'],
      thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 },
    },
  },
});
