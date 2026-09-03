'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

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
import type { Document } from '@/lib/db/documents'
import { formatStayDate } from '@/lib/domain/dates'
import { formatByteSize } from '@/lib/domain/document'

import { removeDocumentAction } from './actions'

/**
 * One stored file, wherever it appears (capabilities B10, G2, G3).
 *
 * ── The Open link is a plain anchor, and that is load-bearing ─────────────
 *
 * `next/link` prefetches on viewport entry in production. The href behind it
 * writes an audit row — capability G3 is "every access to an identity document
 * is logged" — so a panel listing six documents would record six views the
 * moment somebody scrolled past it. An `<a>` fetches when it is clicked, which
 * is the only thing that should count as somebody looking.
 *
 * `target="_blank"` because the file is not this application: a PDF or a
 * photograph replacing the booking screen would lose the reader their place,
 * and the signed URL behind it is dead within a minute of being issued.
 *
 * ── What the row says when the reader may not open it ─────────────────────
 *
 * The row still renders, without the link. **Existence is not content**: a
 * guard who can see that an IC was collected is being told something useful and
 * shown nothing (see the permission table in lib/domain/document.ts). A screen
 * that hid the row entirely would make "did anyone take it?" unanswerable by
 * exactly the people whose job it is to ask.
 */

interface DocumentRowProps {
  document: Document
  /** Whether this reader may open the file itself. */
  mayOpen: boolean
  /** Whether this reader may delete it. */
  mayRemove: boolean
  /** Who attached it, resolved to a name by the screen. */
  attachedBy: string
}

export function DocumentRow({ document, mayOpen, mayRemove, attachedBy }: DocumentRowProps) {
  const [isConfirming, setIsConfirming] = useState(false)

  return (
    <div className="flex items-start justify-between gap-md py-sm">
      <div className="min-w-0">
        <p className="truncate text-body-sm text-foreground">{document.filename}</p>
        <p className="text-caption text-muted-foreground">
          {formatByteSize(document.byteSize)} · {attachedBy} · kept until{' '}
          {formatStayDate(document.retainUntil.slice(0, 10))}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-xs">
        {mayOpen ? (
          <Button asChild variant="tertiary">
            {/* Never next/link — see the note above. */}
            <a href={`/portal/documents/${document.id}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              Open
            </a>
          </Button>
        ) : null}

        {mayRemove ? (
          <Button variant="destructive-tertiary" onClick={() => setIsConfirming(true)}>
            Remove
          </Button>
        ) : null}
      </div>

      {isConfirming ? (
        <RemoveDialog document={document} onClose={() => setIsConfirming(false)} />
      ) : null}
    </div>
  )
}

/**
 * The confirmation, per design.md: plain sentences about what will happen
 * rather than "are you sure", and the safe choice worded as the thing itself.
 */
function RemoveDialog({ document, onClose }: { document: Document; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function remove() {
    setError(null)

    startTransition(async () => {
      const data = new FormData()

      data.set('documentId', document.id)

      const result = await removeDocumentAction({ status: 'idle' }, data)

      if (result.status === 'error') {
        setError(result.message ?? 'That document could not be removed.')
        return
      }

      toast({ tone: 'positive', title: 'Document removed' })
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Remove {document.filename}?</DialogTitle>
          <DialogDescription>
            The file is deleted from storage and cannot be recovered. The record that it existed,
            who attached it and who removed it stays in this booking&rsquo;s history.
          </DialogDescription>
        </DialogHeader>

        {error ? <FieldError message={error} /> : null}

        <DialogFooter>
          <Button type="button" variant="tertiary" onClick={onClose}>
            Keep document
          </Button>
          <Button type="button" variant="destructive" onClick={remove} disabled={isPending}>
            {isPending ? 'Removing…' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
