'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MAX_DEPOSIT_WAIVER_REASON_LENGTH } from '@/lib/domain/deposit-waiver'
import { formatCents, type Cents } from '@/lib/domain/money'

/**
 * The deposit waiver control on the walk-in form (capability B15).
 *
 * A checkbox in its own section at the foot of the form — a "by the way" the
 * desk needs rarely, kept off the price card — and ticking it opens a dialog
 * rather than revealing a field. Everything else in
 * the portal with a consequence (check-in, check-out, cancel) opens a dialog
 * to say in plain sentences what is about to happen, and deciding that BND 100
 * is not taken is the same class of act. An inline checkbox that quietly
 * unfolded a textarea was the wrong register for it (the first build).
 *
 * ── The reason is typed IN the dialog ─────────────────────────────────────
 *
 * So confirming means the decision and its justification arrive together, and
 * the form never holds a half-typed reason from a clerk who changed their mind.
 * The confirm button is disabled until something is typed: a dialog that can be
 * confirmed empty is a speed bump, not a decision. Cancel, close or Escape
 * leaves the box unticked and records nothing.
 *
 * Unticking clears the waiver at once, with no dialog — undoing should be
 * cheap. To change the reason, untick and tick again.
 *
 * ── What it submits ───────────────────────────────────────────────────────
 *
 * Two hidden inputs, on every save: `waiveDeposit` as `true`/`false`, so an
 * unticked box is a decision rather than an absence, and the reason. The
 * server action re-checks both the permission and the reason; this is the
 * affordance, never the gate. Rendered only for a staff member holding
 * `deposit.waive`.
 */

export interface DepositWaiverValue {
  waived: boolean
  reason: string
}

export const NO_WAIVER: DepositWaiverValue = { waived: false, reason: '' }

interface DepositWaiverControlProps {
  value: DepositWaiverValue
  onChange: (next: DepositWaiverValue) => void
  /** What the booking would otherwise quote, so the row can name the figure. */
  amount: Cents
  /** The server's objection to the reason, if it had one. */
  error?: string
  className?: string
}

export function DepositWaiverControl({
  value,
  onChange,
  amount,
  error,
  className,
}: DepositWaiverControlProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className={className}>
      <input type="hidden" name="waiveDeposit" value={value.waived ? 'true' : 'false'} />
      <input type="hidden" name="depositWaiverReason" value={value.reason} />

      <div className="flex items-start gap-sm">
        <Checkbox
          id="waiveDeposit"
          checked={value.waived}
          className="mt-[3px]"
          // Ticking asks first; unticking just undoes.
          onCheckedChange={(checked) => {
            if (checked === true) {
              setIsOpen(true)
            } else {
              onChange(NO_WAIVER)
            }
          }}
        />
        <div className="grid min-w-0 gap-xxs">
          <Label htmlFor="waiveDeposit">Waive the security deposit</Label>
          {value.waived ? (
            <p className="text-caption text-copy">Waived — &ldquo;{value.reason}&rdquo;</p>
          ) : (
            <p className="text-caption text-muted-foreground">
              BND {formatCents(amount)}, collected at check-in and held until the unit has been
              inspected.
            </p>
          )}
          <FieldError message={error} />
        </div>
      </div>

      {/* Mounted only while open, so it opens with an empty draft every time. */}
      {isOpen ? (
        <WaiveDepositDialog
          amount={amount}
          onCancel={() => setIsOpen(false)}
          onConfirm={(reason) => {
            onChange({ waived: true, reason })
            setIsOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}

function WaiveDepositDialog({
  amount,
  onCancel,
  onConfirm,
}: {
  amount: Cents
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [draft, setDraft] = useState('')
  const reason = draft.trim()

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Waive the BND {formatCents(amount)} security deposit?</DialogTitle>
          <DialogDescription>
            No deposit will be held against this stay. Waive it only when a deposit is already held
            under another booking, or the owner has agreed.
          </DialogDescription>
        </DialogHeader>

        {/* Not a <form>: this sits inside the booking form's React tree, and
            the decision is carried back to it as state rather than submitted
            from here. Every button is type="button" for the same reason. */}
        <div className="grid gap-sm">
          <Label htmlFor="depositWaiverDraft">Why — and which booking holds the deposit</Label>
          <Textarea
            id="depositWaiverDraft"
            value={draft}
            placeholder="Extends PV-1234 — the deposit is already held on that booking"
            maxLength={MAX_DEPOSIT_WAIVER_REASON_LENGTH}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
          />
          <p className="text-caption text-muted-foreground">
            Recorded in the booking&rsquo;s history with your name — the guest never sees it. Up to{' '}
            {MAX_DEPOSIT_WAIVER_REASON_LENGTH} characters.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="tertiary" onClick={onCancel}>
            Keep the deposit
          </Button>
          <Button type="button" disabled={reason.length === 0} onClick={() => onConfirm(reason)}>
            Waive the deposit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
