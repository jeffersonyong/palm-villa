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
    /**
     * Test FILES run one at a time, across the whole run.
     *
     * The integration project shares one database and one set of seeded units,
     * and its `beforeEach` clears every booking, so two of its files in flight
     * at once delete each other's fixtures mid-test. It surfaces as "test setup
     * lost booking <uuid>", as a unit somehow already booked for the dates a
     * test just chose, or as the cleaner itself failing to delete a guest
     * because another file inserted a booking against it a moment ago.
     *
     * It has to be declared HERE, at the root, not inside the project that
     * needs it. Worker allocation is decided for the run as a whole, so the
     * project-level copy does not bind when a second project is configured —
     * the integration files were still being spread across workers, rarely
     * enough to look like flakiness while there were seven of them and
     * routinely at nine. The unit project is serialised too and pays almost
     * nothing: it is pure functions and finishes in well under a second.
     */
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          // `lib/domain` plus the handful of pure functions that live beside
          // the components and screens consuming them (route matching,
          // breadcrumbs, a history window), and lib/auth's pure permission
          // logic. The components themselves are chrome over tested primitives
          // and are verified on /tokens, not here — and nothing under `app/`
          // that touches the database or renders is eligible, which is why the
          // glob catches `*.test.ts` and never `*.test.tsx`.
          include: [
            'lib/domain/**/*.test.ts',
            'lib/auth/**/*.test.ts',
            'lib/utils.test.ts',
            'components/**/*.test.ts',
            'app/**/*.test.ts',
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
          // One database, one set of seeded units. Declared at the root as
          // well, which is the copy that actually binds — see the note there.
          fileParallelism: false,
          // The G1 test deliberately contends for a row lock, and a losing
          // racer waits for the winner to commit.
          testTimeout: 20_000,
        },
      },
    ],
  },
})
