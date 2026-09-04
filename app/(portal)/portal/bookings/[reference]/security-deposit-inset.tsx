import Link from 'next/link'

import { DepositStageBadge } from '@/components/portal/deposit-stage-badge'
import { Card } from '@/components/ui/card'
import type { Deposit } from '@/lib/db/deposits'
import { formatTimestamp } from '@/lib/domain/dates'
import { formatCents, type Cents } from '@/lib/domain/money'
import { PAYMENT_METHOD_LABELS } from '@/lib/domain/payment'

/**
 * The security deposit, on the booking's Money card.
 *
 * Never summed into the total. prd.md §11 makes the deposit a refundable
 * liability held against the booking rather than revenue, and folding it in
 * would misstate both the price and the deposit ledger — which is why it sits
 * in the gray inset below the total rather than as a line in it.
 *
 * What changed with the deposits slice is that this stopped being a quote. It
 * used to read `booking.security_deposit_cents` and say "collected on arrival",
 * which was a claim about money nobody had recorded taking. Now it says which
 * of the two it is: what the booking *quotes* before check-in, and what is
 * actually *held* afterwards — with the stage, so the difference between money
 * sitting in the safe and money already given back is on the screen rather than
 * inferred from a date.
 */

interface SecurityDepositInsetProps {
  reference: string
  /** What the booking quotes. Shown before anything has been collected. */
  quoted: Cents
  /** The deposit actually taken, once the guest has checked in. */
  deposit: Deposit | null
}

export function SecurityDepositInset({ reference, quoted, deposit }: SecurityDepositInsetProps) {
  if (!deposit) {
    return (
      <Card surface="inset" className="mt-lg">
        <Row label="Security deposit" value={`BND ${formatCents(quoted)}`} />
        {/* How a deposit is held is the Money card's hint; only the exception
            is worth a sentence here. */}
        {quoted === 0 ? (
          <p className="mt-xs text-caption text-muted-foreground">
            This booking quotes no security deposit, so nothing is collected at check-in.
          </p>
        ) : null}
      </Card>
    )
  }

  const { figures, release } = deposit

  return (
    <Card surface="inset" className="mt-lg">
      <div className="flex items-baseline justify-between gap-lg">
        <span className="text-body-sm text-muted-foreground">Security deposit</span>
        <span className="text-body-sm text-foreground tabular-nums">
          BND {formatCents(deposit.amount)}
        </span>
      </div>

      <div className="mt-sm flex flex-wrap items-center gap-sm">
        <DepositStageBadge stage={deposit.stage} />
        <span className="text-caption text-muted-foreground">
          Taken in {PAYMENT_METHOD_LABELS[deposit.method].toLowerCase()} on{' '}
          {formatTimestamp(deposit.collectedAt)}
        </span>
      </div>

      {/* Only where there is something to say. A deposit with nothing against
          it does not need a "Charges 0.00" line — a zero on a money screen
          invites a second look and there is nothing there to find. */}
      {figures.chargesTotal > 0 ? (
        <Row className="mt-md" label="Charges" value={`BND ${formatCents(figures.chargesTotal)}`} />
      ) : null}

      {release ? (
        <Row
          className="mt-xs"
          label={figures.owed > 0 ? 'Owed by guest' : 'Returned'}
          value={`BND ${formatCents(figures.owed > 0 ? figures.owed : figures.releasable)}`}
          strong
        />
      ) : null}

      <p className="mt-md text-caption">
        <Link
          href={`/portal/deposits/${reference}`}
          className="text-foreground underline underline-offset-2"
        >
          View the deposit
        </Link>
      </p>
    </Card>
  )
}

function Row({
  label,
  value,
  strong,
  className,
}: {
  label: string
  value: string
  strong?: boolean
  className?: string
}) {
  return (
    <div className={`flex items-baseline justify-between gap-lg ${className ?? ''}`}>
      <span
        className={
          strong ? 'text-body-sm-strong text-foreground' : 'text-body-sm text-muted-foreground'
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? 'text-body-sm-strong text-foreground tabular-nums'
            : 'text-body-sm text-foreground tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  )
}
