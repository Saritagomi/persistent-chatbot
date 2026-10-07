import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: {
      'core/index': 'src/core/index.ts',
      'server/index': 'src/server/index.ts',
    },
    format: ['esm', 'cjs'],
    platform: 'neutral',
    target: 'es2020',
    dts: true,
    minify: true,
    clean: true,
  },
  {
    entry: { 'react/index': 'src/react/index.ts' },
    format: ['esm', 'cjs'],
    platform: 'browser',
    target: 'es2020',
    dts: true,
    minify: true,
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    // Next.js App Router needs this on client components.
    banner: { js: '"use client";' },
    copy: [{ from: 'src/styles.css', to: 'dist' }],
  },
])
