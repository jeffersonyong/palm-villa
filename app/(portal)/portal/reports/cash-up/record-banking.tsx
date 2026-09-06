'use client'

import { Landmark } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Notice } from '@/components/ui/notice'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import { formatStayRange, type StayDate } from '@/lib/domain/dates'
import { formatCents } from '@/lib/domain/money'

import { recordBankingAction, type RecordBankingState } from './actions'

/**
 * Recording a trip to the bank (capability E4).
 *
 * A dialog rather than a row of fields on the screen, which is the register
 * every consequential act in this portal uses: this writes a record that
 * cannot be edited afterwards, and the copy has to be able to say so before
 * the click rather than after it.
 *
 * **The business day is a field, and it defaults to the day being read.** An
 * evening's cash goes to the bank the next morning; filing it under the
 * morning would leave every day short and the next day over. The field cannot
 * reach past today — the database refuses a future business date, and offering
 * a day the server will reject is a worse control than one that does not
 * offer it.
 */

const initialState: RecordBankingState = { status: 'idle' }

interface RecordBankingProps {
  /** The day the dialog opens on — the one being looked at. */
  defaultDate: StayDate
  /** Today in Brunei, the latest day cash can be banked against. */
  today: StayDate
  /** The screen's own day, revalidated alongside the day being banked. */
  viewing?: StayDate
}

export function RecordBanking({ defaultDate, today, viewing }: RecordBankingProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Landmark aria-hidden />
        Record banking
      </Button>

      {/* Mounted only while open, so it opens with fresh action state. */}
      {isOpen ? (
        <RecordBankingDialog
          defaultDate={defaultDate}
          today={today}
          viewing={viewing}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  )
}

function RecordBankingDialog({
  defaultDate,
  today,
  viewing,
  onClose,
}: RecordBankingProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(recordBankingAction, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'done' && state.recorded) {
      toast({
        tone: 'positive',
        title: `BND ${formatCents(state.recorded.amount)} banked`,
        description: `Against ${formatStayRange(state.recorded.businessDate, state.recorded.businessDate)}`,
      })
      onClose()
      router.refresh()
    }
  }, [state.status, state.recorded, onClose, router])

  const submitted = state.submitted

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Record banking</DialogTitle>
          <DialogDescription>
            Cash taken to the bank, against the day it was collected — not the day it was banked.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          {viewing ? <input type="hidden" name="viewing" value={viewing} /> : null}

          <div className="grid gap-sm">
            <Label htmlFor="businessDate">Cash taken on</Label>
            <DateField
              id="businessDate"
              name="businessDate"
              defaultValue={submitted?.businessDate || defaultDate}
              max={today}
              invalid={Boolean(state.fieldErrors?.businessDate)}
              describedBy="businessDate-hint"
              className="w-[200px]"
            />
            {state.fieldErrors?.businessDate ? (
              <FieldError id="businessDate-hint" message={state.fieldErrors.businessDate} />
            ) : (
              <p id="businessDate-hint" className="text-caption text-muted-foreground">
                The day the notes were taken at the desk. Yesterday&apos;s cash banked this morning
                belongs to yesterday.
              </p>
            )}
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="banked-amount">Amount banked</Label>
            <div className="flex items-center gap-sm">
              <span className="text-body-sm text-muted-foreground">BND</span>
              <Input
                id="banked-amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                required
                autoComplete="off"
                autoFocus
                className="w-[160px] tabular-nums"
                defaultValue={submitted?.amount ?? ''}
                aria-invalid={Boolean(state.fieldErrors?.amount)}
              />
            </div>
            {state.fieldErrors?.amount ? (
              <FieldError message={state.fieldErrors.amount} />
            ) : (
              <p className="text-caption text-muted-foreground">
                What actually went in. It does not have to match the day — a difference is what the
                cash-up is for.
              </p>
            )}
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="banking-note">Note (optional)</Label>
            <Textarea
              id="banking-note"
              name="note"
              maxLength={280}
              placeholder="Morning run to BIBD; the rest goes tomorrow."
              defaultValue={submitted?.note ?? ''}
            />
          </div>

          <Notice>
            Recorded as banked by you, now, against the day you choose. It cannot be edited
            afterwards — a correction is a second entry, and both stay on the day.
          </Notice>

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Recording…' : 'Record banking'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
