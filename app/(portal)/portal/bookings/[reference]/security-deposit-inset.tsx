import Link from 'next/link'

import { DepositFigureTable, DepositMark, FigureRow } from '@/components/portal/deposit-figures'
import { DepositStageBadge } from '@/components/portal/deposit-stage-badge'
import { Card } from '@/components/ui/card'
import type { Deposit } from '@/lib/db/deposits'
import { formatTimestamp } from '@/lib/domain/dates'
import type { Cents } from '@/lib/domain/money'
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
 *
 * The inset is one of four gray panels on this screen, so it wears the
 * deposit's mark and shows the deposit screen's own table — the reasoning is
 * on `deposit-figures.tsx`. The stage chip sits on the mark's line here because
 * nothing else on the booking screen carries it.
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
        <DepositMark className="mb-sm" />
        <FigureRow label="Due at check-in" value={quoted} />
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

  return (
    <DepositFigureTable
      figures={deposit.figures}
      release={deposit.release}
      className="mt-lg"
      header={<DepositMark badge={<DepositStageBadge stage={deposit.stage} />} />}
    >
      <p className="mt-md text-caption text-muted-foreground">
        Taken in {PAYMENT_METHOD_LABELS[deposit.method].toLowerCase()} on{' '}
        {formatTimestamp(deposit.collectedAt)}
      </p>
      <p className="mt-xs text-caption">
        <Link
          href={`/portal/deposits/${reference}`}
          className="text-foreground underline underline-offset-2"
        >
          View the deposit
        </Link>
      </p>
    </DepositFigureTable>
  )
}
