import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Loads `.env.local` into `process.env` for the integration tests.
 *
 * Next.js does this for the application; Vitest does not, and `lib/db` reads
 * the Supabase URL and service-role key through `lib/env.ts` like everything
 * else. Hand-parsed rather than pulling in `dotenv`: the file is a handful of
 * `KEY=value` lines written by `supabase start`, and architecture.md §1 keeps
 * the approved stack small on purpose.
 *
 * Existing values win, so `SUPABASE_URL=... npm run test` still overrides the
 * file, and nothing here writes a value back to disk.
 */
export function loadEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local')
  let contents: string

  try {
    contents = readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      [
        'The integration tests need .env.local, which was not found.',
        '',
        'Start the local Supabase stack and copy the values it prints:',
        '  npm run db:start',
        '',
        'Then create .env.local from .env.example with the API URL, the',
        'publishable key and the service-role key it reported.',
      ].join('\n'),
    )
  }

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim()

    if (line === '' || line.startsWith('#')) continue

    const separator = line.indexOf('=')

    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    // Values from `supabase start` are unquoted, but a hand-edited file may not
    // be, and a JWT wrapped in quotes fails authentication in a way that reads
    // as a permissions problem rather than a typo.
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2')

    process.env[key] ??= value
  }
}
