// Assembles the accounting packs the demo seed cannot write itself.
//
// Run against the local stack, with the dev server up:
//
//   node --env-file=.env.local scripts/assemble-demo-packs.mjs
//   (it runs automatically as the second half of `npm run db:seed-demo`)
//
// ── Why the seed cannot do this on its own ────────────────────────────────
//
// supabase/seeds/demo.sql builds every booking through the real functions —
// create_walk_in_booking(), transition_booking(), record_inspection() — so
// nothing exists in the demo database that the product could not itself
// produce. A pack breaks that rule, not by choice: it is a rendered PDF that
// is uploaded to Storage, and SQL can do neither.
//
// The visible cost of leaving it out was a screen telling a lie. The booking
// screen infers "a pack is being assembled" from a verification too recent for
// one to have landed yet — true after a clerk verifies a payment, because that
// path schedules the assembly, and false after a seed, because nothing did.
// Every settled demo booking therefore claimed to be mid-assembly for two
// minutes and then settled on "built overnight", and no demo booking ever had
// the pack that capability G5 exists to show.
//
// So the seed hands off to the nightly job's own route rather than growing a
// second assembly path to keep in step with the first: same function, same
// caps, same refusals.
//
// ── Failure is a note, not an error ───────────────────────────────────────
//
// Seeding with the dev server down is an ordinary thing to do, and it must
// leave the database seeded. A pack that could not be assembled is recoverable
// from the portal — the deposits and bookings screens both offer "Rebuild now"
// once a pack is behind — so this reports what happened and exits 0.

const BASE_URL = process.env.DEMO_PACK_BASE_URL ?? 'http://localhost:3000'
const ENDPOINT = `${BASE_URL}/api/cron/accounting-packs`

// `runPackAssembly` caps a run at 25 bookings, which is the nightly job's
// backlog policy rather than a limit worth defeating here. The demo set is
// well under it; the loop exists so a grown seed still finishes, and stops the
// moment a run assembles nothing.
const MAX_RUNS = 5

function note(message) {
  process.stdout.write(`${message}\n`)
}

async function main() {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    note('CRON_SECRET is not set, so the demo packs were not assembled.')
    note('Set it in .env.local (see .env.example) and re-run `npm run db:seed-demo`.')

    return
  }

  let assembled = 0

  for (let run = 0; run < MAX_RUNS; run += 1) {
    let response

    try {
      response = await fetch(ENDPOINT, { headers: { authorization: `Bearer ${secret}` } })
    } catch {
      note('The dev server is not running, so the demo packs were not assembled.')
      note('Start it and run `npm run db:seed-demo` again, or rebuild a pack from its booking.')

      return
    }

    if (!response.ok) {
      note(`The pack route answered ${response.status}, so the demo packs were not assembled.`)

      return
    }

    const result = await response.json()

    assembled += result.assembled ?? 0

    if (!result.assembled) {
      break
    }
  }

  note(
    assembled === 0
      ? 'No accounting packs were due.'
      : `Assembled ${assembled} accounting pack${assembled === 1 ? '' : 's'}.`,
  )
}

await main()
