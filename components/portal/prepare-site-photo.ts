import { MAX_SITE_IMAGE_BYTES, fitWithin } from '@/lib/domain/site-image'

/**
 * A photograph made ready for the public site, in the browser (capability F7).
 *
 * A camera original is routinely larger than the 4 MB a server action can
 * receive on Vercel, and far larger than the site ever shows. So before it is
 * sent it is drawn onto a canvas at no more than 2400px on its long edge and
 * re-encoded as a JPEG — which does three things at once, with no dependency:
 *
 * - it fits under the ceiling, for any photograph a phone or camera produces;
 * - it is turned the right way up, because the browser applies the EXIF
 *   orientation when it decodes;
 * - it carries **no EXIF at all** afterwards — no GPS position, no camera
 *   serial — which matters for a file that is about to be public.
 *
 * The server still reads the bytes' own header and refuses anything that is not
 * an image (lib/domain/site-image.ts): this is a convenience for the person
 * uploading, never a control.
 */

export interface PreparedSitePhoto {
  file: File
  /** The size the photograph was chosen at, for the "may look soft" note. */
  originalWidth: number
  originalHeight: number
}

export type PrepareSitePhotoResult =
  { ok: true; photo: PreparedSitePhoto } | { ok: false; message: string }

/** Tried in order: the first that fits under the ceiling is used. */
const JPEG_QUALITIES = [0.85, 0.72] as const

const UNREADABLE =
  'That photo could not be opened in this browser. Save it as a JPEG and choose it again.'

export async function prepareSitePhoto(file: File): Promise<PrepareSitePhotoResult> {
  const source = await decode(file)

  if (!source) {
    return { ok: false, message: UNREADABLE }
  }

  const original = sizeOf(source)
  const size = fitWithin(original.width, original.height)
  const canvas = document.createElement('canvas')
  const context = size ? canvas.getContext('2d') : null

  if (!size || !context) {
    release(source)

    return { ok: false, message: UNREADABLE }
  }

  canvas.width = size.width
  canvas.height = size.height
  // A JPEG has no transparency, and a transparent PNG drawn straight onto a
  // canvas encodes those pixels as black. White is what a page behind it is.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size.width, size.height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, size.width, size.height)
  release(source)

  for (const quality of JPEG_QUALITIES) {
    const blob = await toJpeg(canvas, quality)

    if (blob && blob.size <= MAX_SITE_IMAGE_BYTES) {
      return {
        ok: true,
        photo: {
          file: new File([blob], 'photo.jpg', { type: 'image/jpeg' }),
          originalWidth: original.width,
          originalHeight: original.height,
        },
      }
    }
  }

  return {
    ok: false,
    message: 'That photo is still larger than 4 MB after resizing. Try a smaller one.',
  }
}

/**
 * The decoded image, or null if this browser cannot read it.
 *
 * `createImageBitmap` first, asking for the EXIF orientation to be applied. An
 * `<img>` decode is the fallback for the browsers that refuse a Blob there; it
 * applies orientation by default in every current engine. A HEIC the operating
 * system did not convert fails both on Chrome, which is the refusal above.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Fall through to the element decoder.
  }

  const url = URL.createObjectURL(file)
  const image = new Image()

  image.src = url

  try {
    await image.decode()

    return image
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

function sizeOf(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height }
}

function release(source: ImageBitmap | HTMLImageElement): void {
  if (!(source instanceof HTMLImageElement)) {
    source.close()
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}
