import { afterAll, beforeAll, beforeEach } from 'vitest'

import { BUCKET_FOR_KIND, DOCUMENT_KINDS } from '@/lib/domain/document'
import { dataClient } from '@/lib/supabase/data'

import { resetPropertyCache } from '../property'

import { loadEnvLocal } from './env'

/**
 * Integration test setup.
 *
 * These tests run against the real local Postgres, because the thing most of
 * them exist to prove — capability G1, that double booking is structurally
 * impossible — cannot be demonstrated against a mock. A mock would only ever
 * confirm that the mock agrees with itself.
 *
 * ── Why this refuses to skip ───────────────────────────────────────────────
 *
 * If the stack is down these tests fail loudly rather than skipping. A suite
 * that quietly passes when the database is absent would mean a green run no
 * longer says G1 was verified, and G1 is a written commitment to the client
 * (scope-of-capabilities.md). A missing database is a broken test run.
 *
 * ── The suite shares your development database ─────────────────────────────
 *
 * The local stack has one database, so running these tests **deletes any
 * bookings you created by hand in the portal**. That is worth knowing before
 * it surprises you mid-demo; the seeded property, units and roles are left
 * alone, so `npm run dev` still works immediately afterwards.
 */

loadEnvLocal()

const EPOCH = '1970-01-01'

beforeAll(async () => {
  await assertDatabaseReady()
})

beforeEach(async () => {
  await clearTransactionalData()
  // The suite may have been pointed at a freshly reset database, which reseeds
  // the property with a new uuid.
  resetPropertyCache()
})

// Clearing before each test is what guarantees isolation; clearing again at the
// end is courtesy. Without it the final test's bookings stay in the database and
// turn up in the portal afterwards, which reads as real data until you notice
// the guest is called "Test Guest".
afterAll(async () => {
  await clearTransactionalData()
})

async function assertDatabaseReady(): Promise<void> {
  let count: number | null = null

  try {
    const result = await dataClient().from('unit').select('id', { count: 'exact', head: true })

    if (result.error) {
      throw new Error(result.error.message)
    }

    count = result.count
  } catch (error: unknown) {
    throw new Error(
      [
        'The local Supabase stack is not reachable, so the integration tests cannot run.',
        '',
        '  npm run db:start     # start Postgres, Auth and Storage in Docker',
        '  npm run db:reset     # apply every migration and the seed',
        '',
        `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
      ].join('\n'),
    )
  }

  if (!count) {
    throw new Error(
      'The database is running but holds no units. Run `npm run db:reset` to apply supabase/seed.sql.',
    )
  }

  await assertStorageReady()
}

/**
 * Storage is part of the stack these tests need, and its absence looks
 * different from Postgres being down.
 *
 * The documents slice stores objects as well as rows, so a stack whose Storage
 * container is not running fails deep inside an upload with a fetch error
 * rather than at the door. Checked here for the reason the unit count is: a
 * green run has to mean the capability was actually exercised.
 */
async function assertStorageReady(): Promise<void> {
  const { data, error } = await dataClient().storage.listBuckets()

  if (error) {
    throw new Error(
      [
        'The local Supabase stack is up but its Storage API is not reachable.',
        '',
        '  npm run db:start     # Postgres, Auth AND Storage',
        '',
        `Underlying error: ${error.message}`,
      ].join('\n'),
    )
  }

  const buckets = new Set((data ?? []).map((bucket) => bucket.id))
  const missing = DOCUMENT_KINDS.map((kind) => BUCKET_FOR_KIND[kind]).filter(
    (bucket) => !buckets.has(bucket),
  )

  if (missing.length > 0) {
    throw new Error(
      `Storage is missing the ${missing.join(', ')} bucket(s). Run \`npm run db:reset\` to replay supabase/migrations.`,
    )
  }
}

/**
 * Empties the tables the tests write to, leaving the seeded inventory.
 *
 * Deleting bookings cascades to their lines and occupancy rows, which is what
 * frees the units for the next test. Guests follow, since a guest exists only
 * because a booking created one.
 *
 * Two things do NOT cascade, and both arrived with the units slice
 * (20260904000100). A lease is an occupancy row with no booking, so nothing
 * deletes it when the bookings go; and out-of-service is a flag on a seeded
 * unit, which is a row this function is otherwise careful not to touch. Left
 * alone, either one leaks into the next test file as a unit that is
 * mysteriously unavailable — which reads as a schema fault rather than as
 * contamination, and costs an afternoon to find.
 *
 * The deposits slice (20260906000100) added three tables and needed no line
 * here, which is worth saying so the next reader does not re-derive it: a
 * deposit hangs off the booking, a charge off the deposit, and an inspection
 * off the occupancy — so all three go with the bookings above.
 *
 * `audit_event` is deliberately left alone: it is append-only by design
 * (architecture.md §4) and no test asserts a global count — the ones that care
 * filter by the entity they just acted on. Wiping an audit trail between tests
 * would also be the one habit this schema is built to make impossible.
 */
async function clearTransactionalData(): Promise<void> {
  const db = dataClient()

  // PostgREST refuses an unfiltered delete, which is a good default and an
  // inconvenience here; every row has a created_at after the epoch.
  const { error: bookingError } = await db.from('booking').delete().gte('created_at', EPOCH)

  if (bookingError) {
    throw new Error(`Could not clear bookings between tests: ${bookingError.message}`)
  }

  const { error: leaseError } = await db.from('occupancy').delete().is('booking_id', null)

  if (leaseError) {
    throw new Error(`Could not clear leases between tests: ${leaseError.message}`)
  }

  const { error: guestError } = await db.from('guest').delete().gte('created_at', EPOCH)

  if (guestError) {
    throw new Error(`Could not clear guests between tests: ${guestError.message}`)
  }

  // Notes ride along here for the same reason: they are a column on a seeded
  // row, so nothing else clears them between tests.
  const { error: serviceError } = await db
    .from('unit')
    .update({ out_of_service_since: null, out_of_service_reason: null, notes: null })
    .or('out_of_service_since.not.is.null,notes.not.is.null')

  if (serviceError) {
    throw new Error(`Could not return units to service between tests: ${serviceError.message}`)
  }

  await emptyDocumentBuckets()
}

/**
 * Empties the four private buckets.
 *
 * The `document` rows go with their bookings — they hang off one, and the
 * delete above cascades — but the OBJECTS do not: Storage is a second system,
 * and nothing in Postgres knows how to reach into it. Left alone they
 * accumulate across every run of the suite, and worse, an orphan-sweep test
 * would find another test's leftovers and report a number nobody can predict.
 *
 * Two levels of listing, because keys are `{propertyId}/{documentId}.{ext}` and
 * Storage's `list()` is prefix-only: the root lists property folders, and each
 * folder lists its objects. A folder entry is distinguishable from an object by
 * having no `id`.
 */
async function emptyDocumentBuckets(): Promise<void> {
  const db = dataClient()

  for (const kind of DOCUMENT_KINDS) {
    const bucket = BUCKET_FOR_KIND[kind]
    const folders = await db.storage.from(bucket).list('', { limit: 1000 })

    if (folders.error || !folders.data) {
      continue
    }

    for (const folder of folders.data) {
      if (folder.id) {
        // An object at the root, which nothing this product writes produces.
        await db.storage.from(bucket).remove([folder.name])
        continue
      }

      const objects = await db.storage.from(bucket).list(folder.name, { limit: 1000 })

      if (objects.error || !objects.data || objects.data.length === 0) {
        continue
      }

      await db.storage
        .from(bucket)
        .remove(objects.data.map((object) => `${folder.name}/${object.name}`))
    }
  }
}
