'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
import { Notice } from '@/components/ui/notice'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast-store'
import {
  INSPECTION_OUTCOME_LABELS,
  MAX_INSPECTION_NOTES_LENGTH,
  type InspectionOutcome,
} from '@/lib/domain/inspection'

import { recordInspectionAction, type DepositActionState } from './actions'

/**
 * Housekeeping's half of the release (capability C2, portal).
 *
 * The gate prd.md §11 requirement 4 describes is this: nothing can be approved
 * until somebody has looked at the unit. The dialog therefore collects the one
 * thing an approver reads — how it was found — and the notes that a charge
 * against this deposit will be read against.
 *
 * Notes are required when something was found and optional when nothing was,
 * which is `checkInspectionNotes()` in lib/domain and is enforced three times
 * over: the button relabels here, the server action refuses, and a CHECK
 * constraint refuses last.
 *
 * **This is not the phone screen.** C2 proper is a housekeeping field surface
 * and belongs to phase two; what this does is give the fact somewhere to live
 * so the deposits flow is complete now, and give that screen a write path to
 * reuse when it lands.
 */

const initialState: DepositActionState = { status: 'idle' }

interface RecordInspectionProps {
  bookingId: string
  reference: string
  unitRef: string | null
}

export function RecordInspection(props: RecordInspectionProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        <ClipboardCheck aria-hidden />
        Record inspection
      </Button>

      {/* Mounted only while open, so it opens with fresh action state. */}
      {isOpen ? <InspectionDialog {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function InspectionDialog({
  bookingId,
  reference,
  unitRef,
  onClose,
}: RecordInspectionProps & { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(recordInspectionAction, initialState)
  // Controlled, because React resets an uncontrolled form the moment its
  // action returns — and a refusal about the notes would otherwise take the
  // outcome with it.
  const [outcome, setOutcome] = useState<InspectionOutcome>('clean')
  const [notes, setNotes] = useState('')
  const router = useRouter()

  const needsNotes = outcome === 'issues_found'

  useEffect(() => {
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: `${unitRef ?? reference} inspected`,
        description: 'The deposit can now be released.',
      })
      onClose()
      router.refresh()
    }
  }, [state.status, unitRef, reference, onClose, router])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Record the inspection{unitRef ? ` of ${unitRef}` : ''}</DialogTitle>
          <DialogDescription>
            What is recorded here is what the release is approved against, and it cannot be changed
            afterwards. Charges are added separately, and can be raised whether or not anything was
            found.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="reference" value={reference} />
          <input type="hidden" name="outcome" value={outcome} />

          <div className="grid gap-sm">
            <Label htmlFor="outcome">How was the unit found?</Label>
            <Select
              value={outcome}
              onValueChange={(value) => setOutcome(value as InspectionOutcome)}
            >
              <SelectTrigger id="outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clean">{INSPECTION_OUTCOME_LABELS.clean}</SelectItem>
                <SelectItem value="issues_found">
                  {INSPECTION_OUTCOME_LABELS.issues_found}
                </SelectItem>
              </SelectContent>
            </Select>
            {state.fieldErrors?.outcome ? <FieldError message={state.fieldErrors.outcome} /> : null}
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="notes">{needsNotes ? 'What was found?' : 'Notes (optional)'}</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={4}
              required={needsNotes}
              maxLength={MAX_INSPECTION_NOTES_LENGTH}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={
                needsNotes
                  ? 'Shower screen cracked, bottom left. Two towels missing.'
                  : 'Anything worth knowing about the unit.'
              }
              aria-invalid={Boolean(state.fieldErrors?.notes)}
            />
            {state.fieldErrors?.notes ? (
              <FieldError message={state.fieldErrors.notes} />
            ) : (
              <p className="text-caption text-muted-foreground">
                {needsNotes
                  ? 'Recorded with your name and the time. A charge against this deposit will be read against it.'
                  : 'Recorded with your name and the time.'}
              </p>
            )}
          </div>

          {/* Said here rather than left to be discovered: prd.md §11 asks for
              photographs and this build cannot take them. */}
          <Notice>
            Photographs are not recorded yet. They arrive with document storage, which is when
            evidence can be kept privately and deleted on schedule.
          </Notice>

          {state.status === 'error' && !state.fieldErrors ? (
            <FieldError message={state.message} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Recording…' : 'Record inspection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
