import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Two suites, one command.
 *
 * `unit` covers `lib/domain` — pure functions, no database, no React, no
 * network. architecture.md §2 makes coverage there mandatory rather than
 * pragmatic, and it stays fast because nothing in it can be slow.
 *
 * `integration` covers `lib/db` against the real local Postgres. It cannot be
 * mocked: the thing it exists to prove is that the *database* refuses a second
 * booking over the same unit and dates (capability G1), and a mock would only
 * confirm that the mock agrees with itself.
 *
 * `npm run test` runs both, and the integration suite fails loudly when the
 * stack is down rather than skipping — see lib/db/test/setup.ts. A green run
 * has to mean G1 was actually checked, or the guarantee quietly stops being
 * one. `npm run test:unit` is the fast subset for domain work.
 *
 * The `@/` alias is declared here rather than pulled from tsconfig via a
 * plugin, which keeps the dependency count at one (architecture.md §1: the
 * approved stack is small on purpose).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          // `lib/domain` plus the handful of pure functions that live beside
          // the components consuming them (route matching, breadcrumbs), and
          // lib/auth's pure permission logic. The components themselves are
          // chrome over tested primitives and are verified on /tokens, not
          // here.
          include: [
            'lib/domain/**/*.test.ts',
            'lib/auth/**/*.test.ts',
            'lib/utils.test.ts',
            'components/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['lib/db/**/*.test.ts'],
          setupFiles: ['./lib/db/test/setup.ts'],
          // One database, one set of seeded units. Test files running in
          // parallel would clear each other's bookings between assertions.
          fileParallelism: false,
          // The G1 test deliberately contends for a row lock, and a losing
          // racer waits for the winner to commit.
          testTimeout: 20_000,
        },
      },
    ],
  },
})
