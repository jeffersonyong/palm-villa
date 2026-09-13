'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatInstantAsDate } from '@/lib/domain/dates'
import { cn } from '@/lib/utils'

import { EditPhotoDialog } from './edit-photo-dialog'
import { PHOTO_ASPECT_CLASSES, PhotoFrame } from './photo-frame'
import type { PhotoSlotView } from './photo-sections'
import { PlacePhotoDialog } from './place-photo-dialog'
import { RemovePhotoDialog } from './remove-photo-dialog'

/** A card's preview is a quarter of the panel on a wide screen, half on a tablet. */
const PREVIEW_SIZES = '(min-width: 1024px) 260px, (min-width: 640px) 45vw, 90vw'

/**
 * One place on the website and the photograph in it (capability F7).
 *
 * A place with a photograph shows it at the site's own crop, what it is
 * described as, and who put it up, with Replace, Edit and Remove. An empty
 * place is the recessed panel design.md gives absence — no hairline, because
 * there is nothing to draw — with the one action that fills it.
 */
export function PhotoSlot({ slot }: { slot: PhotoSlotView }) {
  const [open, setOpen] = useState<'place' | 'edit' | 'remove' | null>(null)
  const { current } = slot
  const close = () => setOpen(null)

  return (
    <div className="grid content-start gap-sm">
      {current ? (
        <PhotoFrame
          src={current.url}
          alt={current.altText}
          aspect={slot.aspect}
          focus={current.focus}
          sizes={PREVIEW_SIZES}
        />
      ) : (
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-sm rounded-md bg-muted px-md text-center',
            PHOTO_ASPECT_CLASSES[slot.aspect],
          )}
        >
          <p className="text-caption text-muted-foreground">
            No photo yet — the website shows a placeholder
          </p>
          <Button variant="tertiary" onClick={() => setOpen('place')}>
            <Plus aria-hidden />
            Add photo
          </Button>
        </div>
      )}

      <div className="min-w-0">
        <p className="text-body-sm-strong text-foreground">{slot.name}</p>
        {current ? (
          <>
            <p className="line-clamp-2 text-caption text-muted-foreground">{current.altText}</p>
            <p className="text-caption text-muted-foreground">
              Added {formatInstantAsDate(current.uploadedAt)} by {current.uploadedBy}
            </p>
          </>
        ) : null}
      </div>

      {current ? (
        <div className="flex flex-wrap gap-xs">
          <Button variant="tertiary" onClick={() => setOpen('place')}>
            Replace
          </Button>
          <Button variant="tertiary" onClick={() => setOpen('edit')}>
            Edit
          </Button>
          <Button variant="destructive-tertiary" onClick={() => setOpen('remove')}>
            Remove
          </Button>
        </div>
      ) : null}

      {open === 'place' ? <PlacePhotoDialog slot={slot} onClose={close} /> : null}
      {open === 'edit' && current ? (
        <EditPhotoDialog slot={slot} current={current} onClose={close} />
      ) : null}
      {open === 'remove' && current ? (
        <RemovePhotoDialog slot={slot} imageId={current.id} onClose={close} />
      ) : null}
    </div>
  )
}
