import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  external: ['react'],
  clean: true,
  outDir: 'dist',
  tsconfig: 'tsconfig.lib.json',
});
