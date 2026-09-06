'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip } from 'lucide-react'

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
import { toast } from '@/components/ui/toast-store'
import { oversizedFiles, type DocumentKind } from '@/lib/domain/document'

import { attachDocumentAction } from './actions'

/**
 * Attaching a file, for all three kinds (capabilities B10, B4, C2).
 *
 * One dialog rather than three, because the act is the same one three times —
 * choose a file, send it, hear whether it landed. What differs is the wording
 * and whether several files may be chosen at once, and both are props.
 *
 * ── Why several files are sent one at a time ──────────────────────────────
 *
 * Vercel caps a function's request body at 4.5 MB, so a submission carrying
 * five photographs would fail on the third with a message from the
 * infrastructure rather than from this product. Sending them one per request
 * also means one bad file among five does not lose the other four: each is
 * reported on its own line, and the ones that worked stay attached.
 *
 * The loop is deliberately sequential. Five parallel uploads from a phone on
 * site is how a slow connection becomes five timeouts instead of one slow
 * success.
 */

interface AttachDocumentProps {
  kind: DocumentKind
  bookingId: string
  /** Set for a slip. */
  paymentId?: string
  /** Set for an inspection photograph. */
  inspectionId?: string
  /** The trigger's label — "Attach ID", "Attach slip", "Add photographs". */
  label: string
  title: string
  description: string
  /** Photographs, plural. An IC and a slip are one file each. */
  multiple?: boolean
  variant?: 'tertiary' | 'secondary'
}

export function AttachDocument(props: AttachDocumentProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant={props.variant ?? 'tertiary'} onClick={() => setIsOpen(true)}>
        <Paperclip aria-hidden />
        {props.label}
      </Button>

      {/* Mounted only while open, so it opens with nothing chosen and no
          stale refusal from last time. */}
      {isOpen ? <AttachDialog {...props} onClose={() => setIsOpen(false)} /> : null}
    </>
  )
}

function AttachDialog({
  kind,
  bookingId,
  paymentId,
  inspectionId,
  title,
  description,
  multiple,
  onClose,
}: AttachDocumentProps & { onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [failures, setFailures] = useState<readonly string[]>([])
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const oversized = oversizedFiles(files)

  function submit() {
    setFailures([])

    startTransition(async () => {
      const refused: string[] = []
      let attached = 0

      for (const file of files) {
        const data = new FormData()

        data.set('kind', kind)
        data.set('bookingId', bookingId)

        if (paymentId) {
          data.set('paymentId', paymentId)
        }

        if (inspectionId) {
          data.set('inspectionId', inspectionId)
        }

        data.set('file', file)

        const result = await attachDocumentAction({ status: 'idle' }, data)

        if (result.status === 'done') {
          attached += 1
        } else {
          refused.push(`${file.name} — ${result.fieldErrors?.file ?? result.message ?? 'refused'}`)
        }
      }

      if (attached > 0) {
        toast({
          tone: 'positive',
          title: attached === 1 ? 'File attached' : `${attached} files attached`,
          description:
            refused.length > 0 ? 'Some files were not attached. See the dialog.' : undefined,
        })
        router.refresh()
      }

      // Only close when everything landed. A dialog that closes over an error
      // makes the reader hunt for what went wrong.
      if (refused.length === 0) {
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
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-lg">
          <FileField
            id="document-file"
            kind={kind}
            label={multiple ? 'Photographs' : 'File'}
            files={files}
            multiple={multiple}
            onChange={(chosen) => {
              setFiles(chosen)
              setFailures([])
            }}
          />

          {failures.length > 0 ? (
            <div className="grid gap-xs">
              {failures.map((failure) => (
                <FieldError key={failure} message={failure} />
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || files.length === 0 || oversized.length > 0}
          >
            {isPending ? 'Attaching…' : multiple && files.length > 1 ? 'Attach files' : 'Attach'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
