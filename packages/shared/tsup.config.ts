import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],  // генерує index.js і index.cjs
  dts: true,
  sourcemap: true,
  clean: true,
  // без цього tsup генерує .mjs замість .js
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
    };
  },
});