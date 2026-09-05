'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck } from 'lucide-react'

import { FileField } from '@/components/portal/file-field'
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
import { oversizedFiles } from '@/lib/domain/document'
import {
  INSPECTION_OUTCOME_LABELS,
  MAX_INSPECTION_NOTES_LENGTH,
  type InspectionOutcome,
} from '@/lib/domain/inspection'

import { attachDocumentAction } from '../../documents/actions'

import { recordInspectionAction } from './actions'

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
 * ── Photographs are part of this, not a second errand ─────────────────────
 *
 * They used to be: the dialog recorded the inspection and a notice sent you
 * back to the card to attach them, because a `document` row hangs off an
 * `inspection_id` and there is nothing to attach to until the inspection
 * exists. That is the schema's order, not the work's. prd.md §11 requirement 2
 * reads "Inspection records outcome, notes, **and photographs**" — one record —
 * and somebody walks the unit once, with the photographs already on the phone
 * they are typing this on. Splitting it made the cheapest evidence in a
 * dispute the easiest step to skip.
 *
 * So the dependency is honoured by *sequencing* rather than by two visits: the
 * action returns the inspection it just wrote, and the files go up against
 * that id. Two consequences worth stating, because both are visible:
 *
 * - **The inspection is written first and is never rewritten.** It has no
 *   update path (`lib/db/inspections.ts`), so once it lands, a failure
 *   attaching photograph three of five cannot be retried by resubmitting the
 *   form. The dialog switches into a photographs-only state instead, freezes
 *   the outcome and notes, and says so.
 * - **Photographs stay optional.** Requiring one is a rule nobody has agreed;
 *   the PRD asks that they be recorded, not that they be compulsory.
 *
 * One permission covers both halves — `ATTACH_PERMISSION.inspection_photo` is
 * `inspection.record`, the string that gates this dialog — so anybody who can
 * open it can attach, and there is no half-usable state to design for.
 *
 * **This is still not the phone screen.** C2 proper is a housekeeping field
 * surface and belongs to phase two; what this does is give the fact somewhere
 * to live, and give that screen a write path shaped the way it will need it.
 */

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

      {/* Mounted only while open, so it opens with nothing chosen and no stale
          refusal from last time. */}
      {isOpen ? <InspectionDialog {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

interface Refusal {
  message?: string
  fieldErrors?: Record<string, string>
}

function InspectionDialog({
  bookingId,
  reference,
  unitRef,
  onClose,
}: RecordInspectionProps & { onClose: () => void }) {
  // Controlled throughout. The submit is orchestrated here rather than by
  // `useActionState`, because it is two server calls in order and the second
  // one repeats per file — see the note on this module.
  const [outcome, setOutcome] = useState<InspectionOutcome>('clean')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [failures, setFailures] = useState<readonly string[]>([])
  /** Set once the inspection is written. From here the dialog is about files. */
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'recording' | 'attaching'>('idle')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const unit = unitRef ?? reference
  const needsNotes = outcome === 'issues_found'
  const isRecorded = inspectionId !== null
  const oversized = oversizedFiles(files)

  /**
   * Closes, refreshing first if anything was written.
   *
   * The refresh is deliberately here and not at the moment the inspection
   * lands. This dialog is rendered by the card's "nobody has inspected it yet"
   * branch, so refreshing while it is open replaces that branch with the
   * recorded inspection — and takes the dialog, and the list of photographs
   * that failed, with it. Refreshing on the way out is the same screen a
   * moment later, without pulling the rug.
   */
  function close() {
    if (inspectionId !== null) {
      router.refresh()
    }

    onClose()
  }

  function submit() {
    setRefusal(null)
    setFailures([])

    // Captured before the write, because `inspectionId` below is this render's
    // value and `setInspectionId` will not change it — which is exactly what
    // is wanted, but only reads that way if it is named.
    const wasRecorded = inspectionId !== null

    startTransition(async () => {
      let id = inspectionId

      if (id === null) {
        setStep('recording')

        const result = await recordInspectionAction(
          { status: 'idle' },
          formDataOf({ bookingId, reference, outcome, notes }),
        )

        if (result.status !== 'done' || !result.inspectionId) {
          setStep('idle')
          setRefusal({ message: result.message, fieldErrors: result.fieldErrors })

          return
        }

        id = result.inspectionId
        setInspectionId(id)
      }

      setStep('attaching')

      const { attached, refused } = await attachPhotographs(files, bookingId, id)

      setStep('idle')
      announce({ recordedNow: !wasRecorded, unit, attached, refused })

      if (refused.length === 0) {
        router.refresh()
        onClose()

        return
      }

      // Emptying the selection empties the picker too — see FileField. The
      // ones that landed are attached; re-sending them would duplicate them.
      setFailures(refused)
      setFiles([])
    })
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {isRecorded ? `Photographs of ${unit}` : `Record the inspection of ${unit}`}
          </DialogTitle>
          <DialogDescription>
            {isRecorded
              ? 'The inspection is recorded. What is left is the photographs that did not go up.'
              : 'What is recorded here is what the release is approved against, and it cannot be changed afterwards. Charges are added separately, and can be raised whether or not anything was found.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-lg">
          <div className="grid gap-sm">
            <Label htmlFor="outcome">How was the unit found?</Label>
            <Select
              value={outcome}
              disabled={isRecorded}
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
            {refusal?.fieldErrors?.outcome ? (
              <FieldError message={refusal.fieldErrors.outcome} />
            ) : null}
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="notes">{needsNotes ? 'What was found?' : 'Notes (optional)'}</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={4}
              required={needsNotes}
              disabled={isRecorded}
              maxLength={MAX_INSPECTION_NOTES_LENGTH}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={
                needsNotes
                  ? 'Shower screen cracked, bottom left. Two towels missing.'
                  : 'Anything worth knowing about the unit.'
              }
              aria-invalid={Boolean(refusal?.fieldErrors?.notes)}
            />
            {refusal?.fieldErrors?.notes ? (
              <FieldError message={refusal.fieldErrors.notes} />
            ) : (
              <p className="text-caption text-muted-foreground">
                {needsNotes
                  ? 'Recorded with your name and the time. A charge against this deposit will be read against it.'
                  : 'Recorded with your name and the time.'}
              </p>
            )}
          </div>

          {/* prd.md §11 requirement 2: photographs are part of the inspection
              rather than a record beside it, so they are chosen here — while
              whoever walked the unit still has them in hand. Optional, and
              deliberately not required when something was found: that is a
              rule the client has not been asked for. */}
          <FileField
            id="inspection-photographs"
            kind="inspection_photo"
            label="Photographs (optional)"
            files={files}
            multiple
            onChange={(chosen) => {
              setFiles(chosen)
              setFailures([])
            }}
          />

          {isRecorded ? (
            <Notice>
              The inspection cannot be changed now it is recorded. Choose these again to retry them,
              or close and add them from the inspection card at any time.
            </Notice>
          ) : null}

          {failures.length > 0 ? (
            <div className="grid gap-xs">
              {failures.map((failure) => (
                <FieldError key={failure} message={failure} />
              ))}
            </div>
          ) : null}

          {refusal?.message && !refusal.fieldErrors ? (
            <FieldError message={refusal.message} />
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="tertiary" onClick={close}>
            {isRecorded ? 'Close' : 'Not yet'}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || oversized.length > 0 || (isRecorded && files.length === 0)}
          >
            {buttonLabel({ step, isRecorded, files: files.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── The pieces the dialog leans on ───────────────────────────────────────── */

function formDataOf(fields: Record<string, string>): FormData {
  const data = new FormData()

  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value)
  }

  return data
}

/**
 * Sends the chosen files, one request each.
 *
 * The same loop the attach dialog runs, and for the same two reasons: Vercel
 * caps a function's request body at 4.5 MB, so five photographs in one
 * submission would fail on the third with a message from the infrastructure
 * rather than from this product — and one bad file among five does not lose
 * the other four. Sequential on purpose: five parallel uploads from a phone on
 * site is how a slow connection becomes five timeouts instead of one slow
 * success.
 */
async function attachPhotographs(
  files: readonly File[],
  bookingId: string,
  inspectionId: string,
): Promise<{ attached: number; refused: readonly string[] }> {
  const refused: string[] = []
  let attached = 0

  for (const file of files) {
    const data = formDataOf({ kind: 'inspection_photo', bookingId, inspectionId })

    data.set('file', file)

    const result = await attachDocumentAction({ status: 'idle' }, data)

    if (result.status === 'done') {
      attached += 1
    } else {
      refused.push(`${file.name} — ${result.fieldErrors?.file ?? result.message ?? 'refused'}`)
    }
  }

  return { attached, refused }
}

/**
 * What the toast says.
 *
 * Two different events share this dialog, and conflating them would misreport
 * one of them: the first pass records an inspection (and may attach files),
 * while a retry after a partial failure only attaches. An inspection that
 * landed is stated even when every photograph failed — it is the thing the
 * release is gated on, and a toast that stayed silent about it would send
 * somebody looking for a record that is already there.
 */
function announce({
  recordedNow,
  unit,
  attached,
  refused,
}: {
  recordedNow: boolean
  unit: string
  attached: number
  refused: readonly string[]
}): void {
  if (!recordedNow && attached === 0) {
    return
  }

  const photographs =
    attached === 0
      ? ''
      : attached === 1
        ? ' One photograph attached.'
        : ` ${attached} photographs attached.`

  toast({
    tone: 'positive',
    title: recordedNow
      ? `${unit} inspected`
      : attached === 1
        ? 'Photograph attached'
        : `${attached} photographs attached`,
    description: recordedNow
      ? `The deposit can now be released.${photographs}${refused.length > 0 ? ' Some photographs were not attached — see the dialog.' : ''}`
      : refused.length > 0
        ? 'Some photographs were not attached — see the dialog.'
        : undefined,
  })
}

function buttonLabel({
  step,
  isRecorded,
  files,
}: {
  step: 'idle' | 'recording' | 'attaching'
  isRecorded: boolean
  files: number
}): string {
  if (step === 'recording') {
    return 'Recording…'
  }

  if (step === 'attaching') {
    return 'Attaching…'
  }

  if (isRecorded) {
    return files === 1 ? 'Attach photograph' : 'Attach photographs'
  }

  return files === 0 ? 'Record inspection' : 'Record and attach'
}
