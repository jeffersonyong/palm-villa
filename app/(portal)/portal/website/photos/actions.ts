'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePermission } from '@/lib/auth/require-permission'
import {
  placeSiteImage,
  removeSiteImage,
  updateSiteImage,
  type SiteImageWriteError,
} from '@/lib/db/site-images'
import { MAX_SITE_IMAGE_BYTES, SITE_IMAGE_FOCUS, parsePlacementKey } from '@/lib/domain/site-image'

/**
 * Adding, replacing, reframing and removing the site's photographs
 * (capability F7).
 *
 * **The permission is checked before anything is read.** It is the same string
 * for every photograph — `site_image.manage` — so unlike the document actions,
 * which have to read a document to learn which permission applies, there is
 * nothing to look up first (architecture.md §4).
 *
 * Each action revalidates two paths: this screen, and the landing page, which
 * is static and would otherwise keep serving the old photograph until its
 * hourly regeneration.
 *
 * One photograph per call. The dialog has already shrunk it to under 4 MB in
 * the browser; the check here is for a request that did not come through it.
 */

type PhotoField = 'file' | 'altText'

export interface PhotoActionState {
  status: 'idle' | 'error' | 'done'
  message?: string
  fieldErrors?: Partial<Record<PhotoField, string>>
}

const placeSchema = z.object({
  placement: z.string(),
  // An empty place is sent as an empty string, which is what an unset field submits.
  expectedCurrentId: z.union([z.uuid(), z.literal('')]),
  altText: z.string(),
  focus: z.enum(SITE_IMAGE_FOCUS),
})

const updateSchema = z.object({
  imageId: z.uuid(),
  altText: z.string(),
  focus: z.enum(SITE_IMAGE_FOCUS),
})

const removeSchema = z.object({
  imageId: z.uuid(),
})

export async function placeSiteImageAction(
  _previous: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  const actor = await requirePermission('site_image.manage')

  const parsed = placeSchema.safeParse({
    placement: formData.get('placement'),
    expectedCurrentId: formData.get('expectedCurrentId') ?? '',
    altText: formData.get('altText') ?? '',
    focus: formData.get('focus'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'That photo could not be saved.' }
  }

  const placement = parsePlacementKey(parsed.data.placement)

  if (!placement) {
    return { status: 'error', message: 'That place is not on the website.' }
  }

  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', fieldErrors: { file: 'Choose a photo.' } }
  }

  // Before the bytes are read: a body this size is refused by the platform in
  // production anyway, and reading it into memory to then refuse it is waste.
  if (file.size > MAX_SITE_IMAGE_BYTES) {
    return {
      status: 'error',
      fieldErrors: {
        file: 'That photo is still larger than 4 MB after resizing. Try a smaller one.',
      },
    }
  }

  const result = await placeSiteImage({
    placement,
    bytes: new Uint8Array(await file.arrayBuffer()),
    altText: parsed.data.altText,
    focus: parsed.data.focus,
    expectedCurrentId: parsed.data.expectedCurrentId === '' ? null : parsed.data.expectedCurrentId,
    actorId: actor.userId,
  })

  if (!result.ok) {
    return refused(result.error)
  }

  revalidateWebsite()

  return { status: 'done' }
}

export async function updateSiteImageAction(
  _previous: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  const actor = await requirePermission('site_image.manage')

  const parsed = updateSchema.safeParse({
    imageId: formData.get('imageId'),
    altText: formData.get('altText') ?? '',
    focus: formData.get('focus'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'That photo could not be saved.' }
  }

  const result = await updateSiteImage({ ...parsed.data, actorId: actor.userId })

  if (!result.ok) {
    return refused(result.error)
  }

  if (result.changed) {
    revalidateWebsite()
  }

  return { status: 'done' }
}

export async function removeSiteImageAction(
  _previous: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  const actor = await requirePermission('site_image.manage')

  const parsed = removeSchema.safeParse({ imageId: formData.get('imageId') })

  if (!parsed.success) {
    return { status: 'error', message: 'That photo could not be removed.' }
  }

  const result = await removeSiteImage({ imageId: parsed.data.imageId, actorId: actor.userId })

  if (!result.ok) {
    return refused(result.error)
  }

  revalidateWebsite()

  return { status: 'done' }
}

/** A refusal belongs under the field it is about, where the dialog has one. */
const FIELD_FOR_CODE: Readonly<Record<string, PhotoField>> = {
  empty: 'file',
  too_large: 'file',
  not_an_image: 'file',
  carries_metadata: 'file',
  object_missing: 'file',
  object_empty: 'file',
  alt_text_invalid: 'altText',
}

function refused(error: SiteImageWriteError): PhotoActionState {
  const field = FIELD_FOR_CODE[error.code]

  return field
    ? { status: 'error', fieldErrors: { [field]: error.message } }
    : { status: 'error', message: error.message }
}

function revalidateWebsite(): void {
  revalidatePath('/')
  revalidatePath('/portal/website/photos')
}
