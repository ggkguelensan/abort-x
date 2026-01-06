import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'combinators/index': 'src/combinators/index.ts',
    'timing/index': 'src/timing/index.ts',
    'browser/index': 'src/browser/index.ts',
    'patterns/index': 'src/patterns/index.ts',
    'guards/index': 'src/guards/index.ts',
    'react/index': 'src/react/index.ts',
    'integrations/index': 'src/integrations/index.ts',
    'testing/index': 'src/testing/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['react'],
  esbuildOptions(options) {
    options.banner = {
      js: '/* abort-x - Fluent AbortSignal API */',
    };
  },
});
