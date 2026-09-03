'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip } from 'lucide-react'

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
import {
  acceptAttributeFor,
  formatByteSize,
  MAX_DOCUMENT_BYTES,
  type DocumentKind,
} from '@/lib/domain/document'

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
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const oversized = files.filter((file) => file.size > MAX_DOCUMENT_BYTES)

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

      setFailures(refused)
      setFiles([])

      if (inputRef.current) {
        inputRef.current.value = ''
      }
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
          <div className="grid gap-sm">
            {/* A span rather than a `Label`, and the input is pointed at it by
                `aria-labelledby`. The visible trigger below has to be a real
                `<label>` — that is the only element that opens a file picker
                without script — so a second labelling `<label>` here would give
                the control two names and have a screen reader read both. */}
            <span id="document-file-label" className="text-body-sm-strong text-foreground">
              {multiple ? 'Photographs' : 'File'}
            </span>

            {/* The native control is the input, and it keeps the keyboard and
                the operating system's own picker. What is drawn is a label
                styled as a tertiary button, because a bare file input carries
                a browser's chrome rather than this product's. */}
            <div className="flex flex-wrap items-center gap-md">
              <label
                htmlFor="document-file"
                className="inline-flex h-[32px] cursor-pointer items-center gap-xs rounded-md border border-border bg-card px-md text-button-md text-foreground transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted"
              >
                {multiple ? 'Choose files' : 'Choose file'}
              </label>
              <input
                ref={inputRef}
                id="document-file"
                type="file"
                aria-labelledby="document-file-label"
                accept={acceptAttributeFor(kind)}
                multiple={multiple}
                className="sr-only"
                onChange={(event) => {
                  setFiles(Array.from(event.target.files ?? []))
                  setFailures([])
                }}
              />
              <span className="text-body-sm text-muted-foreground">
                {files.length === 0
                  ? 'No file chosen'
                  : files.length === 1
                    ? `${files[0]!.name} · ${formatByteSize(files[0]!.size)}`
                    : `${files.length} files`}
              </span>
            </div>

            {oversized.length > 0 ? (
              <FieldError
                message={`${oversized.length === 1 ? oversized[0]!.name : `${oversized.length} files`} is larger than ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB. A photograph taken on a phone is usually well under it.`}
              />
            ) : (
              <p className="text-caption text-muted-foreground">
                JPEG, PNG, WebP{kind === 'inspection_photo' ? '' : ' or PDF'}, up to{' '}
                {Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB each. Stored privately and
                deleted automatically when its retention period ends.
              </p>
            )}
          </div>

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
