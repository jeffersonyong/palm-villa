import { dataClient } from '@/lib/supabase/data'

/**
 * The property every query is scoped by.
 *
 * architecture.md §5.1: "Every table carries `property_id` (uuid, FK) and every
 * query is scoped by it. v1 seeds exactly one property." §11 explains what that
 * discipline buys — everything is scoped by property so a second building is
 * configuration rather than a rewrite — while no multi-property UI is built.
 *
 * The id is looked up rather than pinned to a constant in code or an
 * environment variable, so a database reseeded with a fresh uuid keeps working
 * and no id is duplicated between the seed and the application.
 *
 * Resolution is memoised per process in production, because the answer cannot
 * change while the process runs: v1 has exactly one property row, and a query
 * per request to re-learn the same uuid is pure overhead. A failed lookup is
 * not cached — a database that was not running when the first request arrived
 * should recover when it is, rather than leaving the process permanently
 * broken.
 *
 * In development that premise does not hold. `npm run db:reset` drops the
 * property and reseeds it with a FRESH uuid under a dev server that is still
 * running, and the memoised id becomes one that no longer exists. Because
 * every query — bookings, and `role_permission` too — is scoped by
 * property_id, the result is an empty portal AND an admin who appears to hold
 * no permissions, from a database that is in fact perfectly seeded. The
 * failure looks like a broken login, which sends you looking in the wrong
 * place entirely.
 *
 * So the cache is production-only. The cost in dev is one indexed
 * single-row lookup per request; the cost of keeping it was a confusing
 * debugging session after every reset.
 */

let cached: Promise<string> | null = null

const isMemoised = process.env.NODE_ENV === 'production'

export function currentPropertyId(): Promise<string> {
  if (!isMemoised) {
    return resolvePropertyId()
  }

  cached ??= resolvePropertyId().catch((error: unknown) => {
    cached = null

    throw error
  })

  return cached
}

async function resolvePropertyId(): Promise<string> {
  const { data, error } = await dataClient().from('property').select('id')

  if (error) {
    throw new Error(`Could not read the property: ${error.message}`)
  }

  // Both failures are the same mistake — a database that was never seeded, or
  // one seeded twice — and both would otherwise surface much later as a screen
  // that is mysteriously empty or showing another building's bookings.
  const [property] = data as { id: string }[]

  if (data.length !== 1 || !property) {
    throw new Error(
      `Expected exactly one property, found ${data.length}. Run \`npm run db:reset\` to apply the seed (architecture.md §5.1).`,
    )
  }

  return property.id
}

/** Clears the memoised id. Test-only: the integration suite reseeds. */
export function resetPropertyCache(): void {
  cached = null
}
