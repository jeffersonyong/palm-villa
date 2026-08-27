import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Test configuration for the domain layer.
 *
 * `lib/domain` is pure — no database, no React, no network — so the default
 * node environment is enough and no framework plugin is needed. The `@/` alias
 * is declared here rather than pulled from tsconfig via a plugin, which keeps
 * the dependency count at one (architecture.md §1: the approved stack is small
 * on purpose).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
