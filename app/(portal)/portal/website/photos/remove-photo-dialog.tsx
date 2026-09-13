'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

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

import { removeSiteImageAction } from './actions'
import type { PhotoSlotView } from './photo-sections'

/**
 * Taking a photograph off the website (capability F7).
 *
 * The confirmation design.md asks for: plain sentences about what will happen —
 * a placeholder comes back, the file is gone for good, the record stays — and
 * the safe choice worded as the thing itself. It stays open when the removal is
 * refused, because the answer belongs at the button that asked.
 */
export function RemovePhotoDialog({
  slot,
  imageId,
  onClose,
}: {
  slot: PhotoSlotView
  imageId: string
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function remove() {
    setError(null)

    startTransition(async () => {
      const data = new FormData()

      data.set('imageId', imageId)

      const outcome = await removeSiteImageAction({ status: 'idle' }, data)

      if (outcome.status !== 'done') {
        setError(outcome.message ?? 'That photo could not be removed.')
        return
      }

      toast({ tone: 'positive', title: 'Photo removed' })
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Take the {slot.name} photo off the website?</DialogTitle>
          <DialogDescription>
            The website shows a grey placeholder in its place until a new photo is added. The file
            is deleted and cannot be recovered; the record that it was there stays in the audit log.
          </DialogDescription>
        </DialogHeader>

        {error ? <FieldError message={error} /> : null}

        <DialogFooter>
          <Button type="button" variant="tertiary" onClick={onClose}>
            Keep photo
          </Button>
          <Button type="button" variant="destructive" onClick={remove} disabled={isPending}>
            {isPending ? 'Removing…' : 'Remove photo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
