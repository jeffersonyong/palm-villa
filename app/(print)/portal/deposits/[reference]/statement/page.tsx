import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EmptyState } from '@/components/portal/empty-state'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listDepositCharges } from '@/lib/db/deposit-charges'
import { getDepositByBookingReference } from '@/lib/db/deposits'
import { listStaff } from '@/lib/db/staff'
import { formatStayDates, formatTimestamp, todayInBrunei } from '@/lib/domain/dates'
import { formatStayDate } from '@/lib/domain/dates'
import { INSPECTION_OUTCOME_LABELS, isInspectionOutcome } from '@/lib/domain/inspection'
import { formatCents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS } from '@/lib/domain/payment'

interface PageProps {
  params: Promise<{ reference: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params

  return { title: `Deposit statement ${decodeURIComponent(reference).toUpperCase()}` }
}

/**
 * The shareable statement (capability E3).
 *
 * scope-of-capabilities.md E3: "where charges exceed the deposit, the balance
 * is tracked as an amount owed with a shareable statement". This is the
 * shareable part, and it is deliberately a page rather than a generated file:
 * every browser prints to PDF, staff already forward things over WhatsApp as
 * images, and a document that is also a URL is one a colleague can open. The
 * accounting pack (architecture.md §8) is where a generated PDF earns its
 * dependency — assembling a slip, an identity document and a booking with
 * nobody standing in front of it.
 *
 * **It renders only once a release has been approved.** Before that there is
 * nothing to state: the figures could still move, and a statement whose numbers
 * change after it was sent is worse than none. That is the same reason the
 * approval freezes the charges.
 *
 * The figures are the *approved* ones, read off the deposit rather than
 * recomputed — what a guest was told is what somebody signed.
 */
export default async function StatementPage({ params }: PageProps) {
  const { reference: encoded } = await params
  const reference = decodeURIComponent(encoded).toUpperCase()
  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'booking.view')) {
    return (
      <EmptyState
        title="You don't have access to this statement"
        description={
          'Seeing a deposit needs the "View bookings" permission. Ask an administrator if this is part of your job.'
        }
      />
    )
  }

  const deposit = await getDepositByBookingReference(reference)

  if (!deposit) {
    notFound()
  }

  const { release } = deposit

  if (!release) {
    return (
      <EmptyState
        title="Nothing to state yet"
        description="A statement is produced once the release has been approved, because that is when the figures stop moving."
        action={
          <Button asChild variant="tertiary">
            <Link href={`/portal/deposits/${deposit.bookingReference}`}>Open the deposit</Link>
          </Button>
        }
      />
    )
  }

  const [charges, staff] = await Promise.all([listDepositCharges(deposit.id), listStaff()])

  const actorNames = new Map(staff.map((account) => [account.id, account.displayName]))
  const standing = charges.filter((charge) => charge.waived === null)
  const owes = release.owed > 0
  const outcome =
    deposit.inspection && isInspectionOutcome(deposit.inspection.outcome)
      ? INSPECTION_OUTCOME_LABELS[deposit.inspection.outcome]
      : null

  return (
    <article className="text-body-sm text-copy">
      <header className="border-b border-divider pb-lg">
        <p className="micro-label text-muted-foreground">Palm Villa</p>
        <h1 className="mt-xs text-display-sm text-foreground">Security deposit statement</h1>
        <p className="mt-sm font-mono text-body-md text-foreground tabular-nums">
          {deposit.bookingReference}
        </p>
      </header>

      <dl className="mt-lg grid gap-md sm:grid-cols-2">
        <Line label="Guest" value={deposit.guestName} />
        <Line label="Unit" value={deposit.stay?.unitRef ?? 'No unit'} />
        <Line
          label="Stay"
          value={
            deposit.stay
              ? formatStayDates(deposit.stay.range.start, deposit.stay.range.end)
              : 'Occupies no unit'
          }
        />
        <Line
          label="Deposit taken"
          value={`${formatTimestamp(deposit.collectedAt)}, in ${PAYMENT_METHOD_LABELS[
            deposit.method
          ].toLowerCase()}`}
        />
      </dl>

      <section className="mt-xl" aria-labelledby="inspection-heading">
        <h2 id="inspection-heading" className="micro-label text-muted-foreground">
          Inspection
        </h2>
        {deposit.inspection ? (
          <>
            <p className="mt-sm text-foreground">
              {outcome ?? deposit.inspection.outcome} — {formatTimestamp(deposit.inspection.inspectedAt)}
            </p>
            {deposit.inspection.notes ? (
              <p className="mt-xs whitespace-pre-line">{deposit.inspection.notes}</p>
            ) : null}
          </>
        ) : (
          <p className="mt-sm">No inspection was recorded.</p>
        )}
      </section>

      <section className="mt-xl" aria-labelledby="charges-heading">
        <h2 id="charges-heading" className="micro-label text-muted-foreground">
          Charges
        </h2>

        {standing.length === 0 ? (
          <p className="mt-sm">Nothing was charged against this deposit.</p>
        ) : (
          <table className="mt-sm w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-divider">
                <th scope="col" className="pb-xs font-medium text-muted-foreground">
                  What for
                </th>
                <th scope="col" className="pb-xs text-right font-medium text-muted-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {standing.map((charge) => (
                <tr key={charge.id} className="border-b border-divider last:border-0">
                  <td className="py-sm pr-lg align-top text-foreground">{charge.reason}</td>
                  <td className="py-sm text-right align-top tabular-nums text-foreground">
                    {formatCents(charge.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* The arithmetic, in the order a bill is read: what was held, what came
          off it, what is left — and only ever one of the last two lines. */}
      <section className="mt-xl border-t border-divider pt-lg" aria-labelledby="totals-heading">
        <h2 id="totals-heading" className="sr-only">
          Totals
        </h2>

        <Total label="Deposit held" value={deposit.amount} />
        <Total label="Less charges" value={release.chargesTotal} />
        <div className="mt-sm border-t border-divider pt-sm">
          <Total
            label={owes ? 'Amount owed by guest' : 'Returned to guest'}
            value={owes ? release.owed : release.releasedAmount}
            strong
          />
        </div>
      </section>

      <section className="mt-xl" aria-labelledby="approval-heading">
        <h2 id="approval-heading" className="micro-label text-muted-foreground">
          Approved
        </h2>
        <p className="mt-sm">
          {formatTimestamp(release.at)} by{' '}
          {release.by === null ? 'the system' : (actorNames.get(release.by) ?? 'a colleague')}.
        </p>
        {release.note ? <p className="mt-xs">&ldquo;{release.note}&rdquo;</p> : null}
        {deposit.settlement ? (
          <p className="mt-xs">
            The amount owed was settled on {formatTimestamp(deposit.settlement.at)}, in{' '}
            {PAYMENT_METHOD_LABELS[deposit.settlement.method].toLowerCase()}.
          </p>
        ) : null}
      </section>

      <footer className="mt-2xl border-t border-divider pt-lg text-caption text-muted-foreground">
        Prepared {formatStayDate(todayInBrunei())}. Figures are in Brunei dollars.
      </footer>
    </article>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="micro-label text-muted-foreground">{label}</dt>
      <dd className="mt-xs text-foreground">{value}</dd>
    </div>
  )
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-lg">
      <span className={strong ? 'text-body-md text-foreground' : undefined}>{label}</span>
      <span
        className={
          strong
            ? 'text-body-md text-foreground tabular-nums'
            : 'text-foreground tabular-nums'
        }
      >
        BND {formatCents(value)}
      </span>
    </div>
  )
}
