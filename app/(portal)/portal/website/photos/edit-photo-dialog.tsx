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
import type { SiteImageFocus } from '@/lib/domain/site-image'

import { updateSiteImageAction, type PhotoActionState } from './actions'
import { DescriptionField } from './description-field'
import { FocusPicker } from './focus-picker'
import { PhotoFrame } from './photo-frame'
import type { CurrentPhotoView, PhotoSlotView } from './photo-sections'

/**
 * Changing how a photograph is described and framed, without replacing it
 * (capability F7).
 *
 * **Save is dirty-gated** (design.md, Buttons): it stays disabled until the
 * draft differs from what is on the site, so an idle click can write nothing
 * and record nothing. The comparison folds whitespace the way the server does,
 * so a trailing space is not a change.
 */
export function EditPhotoDialog({
  slot,
  current,
  onClose,
}: {
  slot: PhotoSlotView
  current: CurrentPhotoView
  onClose: () => void
}) {
  const [altText, setAltText] = useState(current.altText)
  const [focus, setFocus] = useState<SiteImageFocus>(current.focus)
  const [result, setResult] = useState<PhotoActionState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const tidied = altText.replace(/\s+/g, ' ').trim()
  const isDirty = tidied !== current.altText || focus !== current.focus

  function save() {
    startTransition(async () => {
      const data = new FormData()

      data.set('imageId', current.id)
      data.set('altText', altText)
      data.set('focus', focus)

      const outcome = await updateSiteImageAction({ status: 'idle' }, data)

      if (outcome.status !== 'done') {
        setResult(outcome)
        return
      }

      toast({ tone: 'positive', title: 'Photo updated' })
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit the {slot.name} photo</DialogTitle>
          <DialogDescription>
            Change how it is described and which part stays in view. The photo itself stays the
            same.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-lg">
          <div className="grid gap-lg sm:grid-cols-[1fr_auto] sm:items-start">
            <PhotoFrame
              src={current.url}
              alt={current.altText}
              aspect={slot.aspect}
              focus={focus}
              sizes="320px"
            />
            <FocusPicker
              name="site-photo-edit-focus"
              value={focus}
              onChange={setFocus}
              disabled={isPending}
            />
          </div>

          <DescriptionField
            id="site-photo-edit-description"
            value={altText}
            onChange={setAltText}
            error={result.fieldErrors?.altText}
            disabled={isPending}
          />

          {result.status === 'error' && result.message ? (
            <FieldError message={result.message} />
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={isPending || !isDirty || tidied === ''}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
