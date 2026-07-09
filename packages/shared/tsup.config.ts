import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  tsconfig: './tsconfig.json',
  splitting: false,
  sourcemap: true,
  clean: true,
  bundle: true,
  skipNodeModulesBundle: true,
});
