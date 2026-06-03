import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    platform: 'node',
    target: 'node20',
    clean: true,
    sourcemap: true,
    // Runtime uses Bun.listen / Bun.connect; do not bundle Bun types/runtime.
    deps: {
        neverBundle: ['bun'],
    },
});
