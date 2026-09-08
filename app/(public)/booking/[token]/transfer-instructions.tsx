'use client'

import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
import { Notice } from '@/components/ui/notice'
import { formatCents } from '@/lib/domain/money'
import type { TransferChoice, TransferPlan } from '@/lib/domain/public-booking'
import type { BankAccountSettings } from '@/lib/domain/settings'
import { cn } from '@/lib/utils'

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
 *
 * **A stay offers two amounts, and both are the client's own words.** Asked
 * what a guest transfers when booking, he named the deposit only or the full
 * amount with the deposit (N29), and the second was recorded and never built.
 * The deposit is the default because it is the smaller commitment and the one
 * the policy is written around; paying everything is one radio away for the
 * guests who would rather be done with it. It is not a part payment — that is
 * still [N16](../../../docs/open-questions.md) and still out — because the
 * stay is settled in full either way, only sooner.
 */

const initialState: SubmitTransferState = { status: 'idle' }

export function TransferInstructions({
  token,
  reference,
  depositOnly,
  everything,
  accounts,
}: {
  token: string
  reference: string
  /** The default: what secures the booking. */
  depositOnly: TransferPlan
  /** The same booking settled outright. Ignored where there is no choice. */
  everything: TransferPlan
  accounts: readonly BankAccountSettings[]
}) {
  const [state, formAction, isPending] = useActionState(submitTransferAction, initialState)
  const [choice, setChoice] = useState<TransferChoice>('deposit_only')

  const plan = choice === 'everything' ? everything : depositOnly

  return (
    <Card className="mt-xl">
      <p className="micro-label text-muted-foreground">
        {depositOnly.choosable ? 'What would you like to send now?' : 'Transfer the payment'}
      </p>

      {depositOnly.choosable ? (
        <div className="mt-md grid gap-sm">
          <TransferOption
            id="deposit_only"
            checked={choice === 'deposit_only'}
            onSelect={() => setChoice('deposit_only')}
            title={`Just the deposit — BND ${formatCents(depositOnly.total)}`}
            detail={`Secures your unit. The BND ${formatCents(depositOnly.stay || everything.stay)} for the stay is paid when you arrive.`}
          />
          <TransferOption
            id="everything"
            checked={choice === 'everything'}
            onSelect={() => setChoice('everything')}
            title={`Everything now — BND ${formatCents(everything.total)}`}
            detail={`The BND ${formatCents(everything.deposit)} deposit and the BND ${formatCents(everything.stay)} for the stay together, so there is nothing to settle on arrival.`}
          />
        </div>
      ) : (
        <>
          <p className="mt-md text-display-sm text-foreground tabular-nums">
            BND {formatCents(plan.total)}
          </p>
          <p className="mt-xs text-body-sm text-muted-foreground">
            The full price of your day pass.
          </p>
        </>
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
          Send{' '}
          <strong className="text-body-sm-strong tabular-nums">
            BND {formatCents(plan.total)}
          </strong>{' '}
          in one transfer, and put{' '}
          <strong className="font-mono text-body-sm-strong">{reference}</strong> in the description
          so we can match it to your booking. Your unit is held until we confirm the transfer —
          there is no time limit, but the sooner you send it the sooner it is confirmed.
        </p>
      </Notice>

      {state.status === 'error' && state.message ? (
        <Callout tone="negative" placement="nested" className="mt-lg" role="alert">
          {state.message}
        </Callout>
      ) : null}

      <form action={formAction} className="mt-lg">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="choice" value={choice} />
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Telling the team…' : 'I have made the transfer'}
        </Button>
      </form>

      <p className="mt-sm text-caption text-muted-foreground">
        Confirm here once you have sent it. This will confirm your booking upon verification.
      </p>
    </Card>
  )
}

/**
 * One of the two amounts, as a labelled card rather than a bare radio.
 *
 * The figure is the thing being chosen between, so it belongs in the label at
 * a size somebody can read across a phone — a radio with "Everything now" and
 * the amount somewhere else would make the customer look in two places to
 * answer one question. Selected takes the hairline and the accent fill the
 * unit-type chooser on the booking form uses, so the two read as the same kind
 * of choice.
 */
function TransferOption({
  id,
  checked,
  onSelect,
  title,
  detail,
}: {
  id: string
  checked: boolean
  onSelect: () => void
  title: string
  detail: string
}) {
  return (
    <label
      htmlFor={`choice-${id}`}
      className={cn(
        'flex cursor-pointer items-start gap-md rounded-md border px-lg py-md transition-colors',
        checked ? 'border-primary bg-accent' : 'border-border bg-card hover:bg-muted',
      )}
    >
      <input
        type="radio"
        id={`choice-${id}`}
        name="transferChoice"
        checked={checked}
        onChange={onSelect}
        className="mt-[3px] size-4 accent-primary"
      />
      <span className="min-w-0">
        <span
          className={cn(
            'block text-body-md-strong tabular-nums',
            checked ? 'text-accent-foreground' : 'text-foreground',
          )}
        >
          {title}
        </span>
        <span className="mt-xxs block text-caption text-muted-foreground">{detail}</span>
      </span>
    </label>
  )
}
