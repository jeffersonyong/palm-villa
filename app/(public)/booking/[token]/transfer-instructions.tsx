'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
import { Notice } from '@/components/ui/notice'
import type { BankAccountSettings } from '@/lib/domain/settings'
import { formatCents, type Cents } from '@/lib/domain/money'

import { submitTransferAction, type SubmitTransferState } from './actions'

/**
 * How to pay, and the one button on the screen (capability A5's display half,
 * and prd.md §10.3 corrected).
 *
 * The bank accounts come from Property settings rather than from page copy,
 * which is the whole reason capability F3 put them in the database: the day a
 * number changes is the day every transfer instruction has to change with it,
 * and a number pasted into marketing copy is the one nobody remembers to
 * update.
 *
 * **Two accounts, and nothing routes on which one is used.** A Bruneian
 * customer already banks with one or the other and transfers within their own
 * bank without a fee — it is a convenience, not two products (prd.md §10.1).
 * The number alone is shown, with no account name, which is what the client
 * gave and what a transfer form actually asks for.
 *
 * **The button is a claim, not a payment.** Pressing it says "I have sent it",
 * which starts the clock in the staff verification queue — the queue measures
 * how long somebody has been left waiting, not how long they spent filling in
 * a form. Nothing about the money is known until a person opens the bank app.
 */

const initialState: SubmitTransferState = { status: 'idle' }

export function TransferInstructions({
  token,
  reference,
  amount,
  kind,
  total,
  accounts,
}: {
  token: string
  reference: string
  amount: Cents
  /** A deposit secures a stay; anything else is paid for in full. */
  kind: 'deposit' | 'payment'
  total: Cents
  accounts: readonly BankAccountSettings[]
}) {
  const [state, formAction, isPending] = useActionState(submitTransferAction, initialState)

  return (
    <Card className="mt-xl">
      <p className="micro-label text-muted-foreground">
        {kind === 'deposit' ? 'Transfer the deposit' : 'Transfer the payment'}
      </p>

      <p className="mt-md text-display-sm text-foreground tabular-nums">
        BND {formatCents(amount)}
      </p>

      {kind === 'deposit' ? (
        <p className="mt-xs text-body-sm text-muted-foreground">
          The refundable security deposit, which secures your unit. The BND {formatCents(total)} for
          the stay is paid when you arrive.
        </p>
      ) : (
        <p className="mt-xs text-body-sm text-muted-foreground">The full price of your day pass.</p>
      )}

      {accounts.length > 0 ? (
        <dl className="mt-lg divide-y divide-divider border-y border-divider">
          {accounts.map((account) => (
            <div key={account.id} className="flex items-baseline justify-between gap-lg py-md">
              <dt className="text-body-md text-muted-foreground">{account.bankName}</dt>
              <dd className="font-mono text-body-md text-foreground">{account.accountNumber}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Callout tone="negative" placement="nested" className="mt-lg">
          We cannot show the bank details right now. Please call us and we will give them to you.
        </Callout>
      )}

      <Notice placement="nested" className="mt-lg">
        <p className="text-body-sm">
          Put <strong className="font-mono text-body-sm-strong">{reference}</strong> in the transfer
          description, so we can match it to your booking. Your unit is held until we confirm the
          transfer — there is no time limit, but the sooner you send it the sooner it is confirmed.
        </p>
      </Notice>

      {state.status === 'error' && state.message ? (
        <Callout tone="negative" placement="nested" className="mt-lg" role="alert">
          {state.message}
        </Callout>
      ) : null}

      <form action={formAction} className="mt-lg">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Telling the team…' : 'I have made the transfer'}
        </Button>
      </form>

      <p className="mt-sm text-caption text-muted-foreground">
        Press this once you have sent it. Somebody checks the bank and confirms your booking.
      </p>
    </Card>
  )
}
