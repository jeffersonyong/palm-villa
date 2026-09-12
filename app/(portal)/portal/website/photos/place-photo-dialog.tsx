'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { FileField } from '@/components/portal/file-field'
import { prepareSitePhoto, type PreparedSitePhoto } from '@/components/portal/prepare-site-photo'
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
  DEFAULT_FOCUS,
  SITE_IMAGE_ACCEPT,
  isSoftPhoto,
  type SiteImageFocus,
} from '@/lib/domain/site-image'

import { placeSiteImageAction, type PhotoActionState } from './actions'
import { DescriptionField } from './description-field'
import { FocusPicker } from './focus-picker'
import { PhotoFrame } from './photo-frame'
import type { PhotoSlotView } from './photo-sections'

/**
 * The largest original a browser is asked to open and shrink.
 *
 * Not the 4 MB the server accepts — that applies to what is sent, after the
 * shrink (lib/domain/site-image.ts). This bounds only what a phone is asked to
 * decode, and a photograph from any camera sits under it.
 */
const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024

/**
 * Adding a photograph to an empty place, or replacing the one there
 * (capability F7).
 *
 * The photo is shrunk in the browser as soon as it is chosen, and previewed at
 * the slot's own shape with its framing, so the person saving it sees what the
 * site will show. **A replacement starts with an empty description**: the old
 * one describes the old photograph, and a pre-filled field is one a busy person
 * saves unread.
 */
export function PlacePhotoDialog({ slot, onClose }: { slot: PhotoSlotView; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [prepared, setPrepared] = useState<{ photo: PreparedSitePhoto; url: string } | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [altText, setAltText] = useState('')
  const [focus, setFocus] = useState<SiteImageFocus>(DEFAULT_FOCUS)
  const [result, setResult] = useState<PhotoActionState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()
  const attempt = useRef(0)
  const router = useRouter()
  const isReplacing = slot.current !== null

  function forgetPreview() {
    if (prepared) {
      URL.revokeObjectURL(prepared.url)
    }

    setPrepared(null)
  }

  function close() {
    forgetPreview()
    onClose()
  }

  async function choose(chosen: File[]) {
    const [file] = chosen
    // A second choice made while the first is still shrinking wins; the first
    // result is dropped when it arrives.
    const thisAttempt = ++attempt.current

    setFiles(chosen)
    setResult({ status: 'idle' })
    forgetPreview()

    if (!file || file.size > MAX_ORIGINAL_BYTES) {
      // Nothing chosen, or too large to open — the picker says which.
      return
    }

    setIsPreparing(true)
    const outcome = await prepareSitePhoto(file)

    if (thisAttempt !== attempt.current) {
      return
    }

    setIsPreparing(false)

    if (!outcome.ok) {
      setResult({ status: 'error', fieldErrors: { file: outcome.message } })
      return
    }

    setPrepared({ photo: outcome.photo, url: URL.createObjectURL(outcome.photo.file) })
  }

  function save() {
    if (!prepared) {
      return
    }

    startTransition(async () => {
      const data = new FormData()

      data.set('placement', slot.key)
      data.set('expectedCurrentId', slot.current?.id ?? '')
      data.set('altText', altText)
      data.set('focus', focus)
      data.set('file', prepared.photo.file)

      const outcome = await placeSiteImageAction({ status: 'idle' }, data)

      if (outcome.status !== 'done') {
        setResult(outcome)
        return
      }

      toast({
        tone: 'positive',
        title: isReplacing ? 'Photo replaced' : 'Photo added',
        description: `${slot.name} shows the new photo on the website.`,
      })
      close()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {isReplacing ? `Replace the ${slot.name} photo` : `Add a photo — ${slot.name}`}
          </DialogTitle>
          <DialogDescription>
            {isReplacing
              ? 'The new photo takes the old one’s place on the website as soon as you save, and the old file is deleted.'
              : 'The photo appears on the website as soon as you save.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-lg">
          <FileField
            id="site-photo-file"
            label="Photo"
            accept={SITE_IMAGE_ACCEPT}
            maxBytes={MAX_ORIGINAL_BYTES}
            formats="JPEG, PNG or WebP"
            files={files}
            onChange={(chosen) => void choose(chosen)}
            disabled={isPending}
            hint="JPEG, PNG or WebP. Large photos are made smaller before they are sent. It will be public on the website, so don’t choose one where a guest can be recognised without their permission."
          />

          {isPreparing ? (
            <p className="text-caption text-muted-foreground" aria-live="polite">
              Preparing the photo…
            </p>
          ) : null}

          {result.fieldErrors?.file ? <FieldError message={result.fieldErrors.file} /> : null}

          {prepared ? (
            <div className="grid gap-lg sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="grid gap-xs">
                <PhotoFrame
                  src={prepared.url}
                  alt="The chosen photo, cropped the way the website will show it"
                  aspect={slot.aspect}
                  focus={focus}
                  sizes="320px"
                  unoptimized
                />
                {isSoftPhoto(prepared.photo.originalWidth, prepared.photo.originalHeight) ? (
                  <p className="text-caption text-muted-foreground">
                    This photo is quite small, so it may look soft on a large screen.
                  </p>
                ) : null}
              </div>
              <FocusPicker
                name="site-photo-focus"
                value={focus}
                onChange={setFocus}
                disabled={isPending}
              />
            </div>
          ) : null}

          <DescriptionField
            id="site-photo-description"
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
          <Button type="button" variant="tertiary" onClick={close}>
            {isReplacing ? 'Keep current photo' : 'Cancel'}
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={isPending || isPreparing || !prepared || altText.trim() === ''}
          >
            {isPending ? 'Saving…' : 'Save photo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
