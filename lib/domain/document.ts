import { hasPermission, type Permission } from '@/lib/auth/permissions'

/**
 * The document vocabulary (architecture.md §8, capabilities B10, G2–G4).
 *
 * One module owns what a stored file *is*: which kinds exist, which bucket each
 * lives in, what may be uploaded, what a stored object is called, when it stops
 * being kept, and who may attach or open one. Pure and I/O-free, so every rule
 * deciding whether a guest's identity document reaches somebody's screen is
 * unit-testable without a database or a storage stack behind it.
 *
 * architecture.md §2 makes coverage mandatory for the modules carrying the
 * correctness risk. This is one of them by the same argument: prd.md §13 is a
 * data-protection commitment under Brunei's PDPO, and the difference between
 * honouring it and breaching it is the two dozen lines below.
 *
 * ── Why this imports from lib/auth ────────────────────────────────────────
 *
 * `lib/auth/permissions.ts` is pure — the vocabulary and the set logic over it,
 * with the session and the database composed on top elsewhere — so importing it
 * costs this module nothing it was avoiding. The permission table at the foot
 * of this file has to live in exactly one place: a screen deciding to render an
 * Open link and a route handler deciding to issue a signed URL must reach the
 * same answer, or the link is a promise the handler breaks — or worse, keeps.
 */

/**
 * What a stored file is for.
 *
 * Four kinds, and they are the four architecture.md §8 names as buckets. Each
 * has a different owner, a different permission and a different retention
 * period, which is what makes them a vocabulary rather than a folder:
 *
 * - `identity` — the guest's IC (prd.md §13 [C]). The sensitive one.
 * - `payment_slip` — the transfer screenshot (prd.md §10.4). Evidence, never
 *   verification: staff still check the bank.
 * - `inspection_photo` — what Housekeeping found (prd.md §11 requirement 2).
 * - `accounting_pack` — the assembled PDF (capability G5). Written by
 *   lib/db/packs.ts after a payment is verified, and never uploaded by hand;
 *   what it contains is lib/domain/pack.ts.
 *
 * Mirrored by a CHECK constraint on `document.kind`, the relationship
 * lib/domain/inspection.ts has to its table: widening this is a code change and
 * a migration, together.
 */
export const DOCUMENT_KINDS = [
  'identity',
  'payment_slip',
  'inspection_photo',
  'accounting_pack',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

/** Screen-facing labels. The portal never renders a raw enum value. */
export const DOCUMENT_KIND_LABELS: Readonly<Record<DocumentKind, string>> = {
  identity: 'Identity document',
  payment_slip: 'Transfer slip',
  inspection_photo: 'Inspection photograph',
  accounting_pack: 'Accounting pack',
}

export function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value)
}

/**
 * The private bucket each kind is stored in (architecture.md §8).
 *
 * A kind maps to exactly one bucket and always the same one, which is why the
 * database can CHECK the pair rather than trusting whatever a caller passed: a
 * slip written into `identity-docs` would be a payment screenshot behind the
 * identity permission, retained on the identity schedule, and invisible to the
 * queue that needs it.
 */
export const BUCKET_FOR_KIND: Readonly<Record<DocumentKind, string>> = {
  identity: 'identity-docs',
  payment_slip: 'payment-slips',
  inspection_photo: 'inspection-photos',
  accounting_pack: 'packs',
}

export function bucketFor(kind: DocumentKind): string {
  return BUCKET_FOR_KIND[kind]
}

/** Every type this product can store, whatever the kind. */
export const STORABLE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export type StorableMimeType = (typeof STORABLE_MIME_TYPES)[number]

/**
 * What each kind accepts.
 *
 * An IC arrives as a photograph or a scan, and both are ordinary. A slip is a
 * screenshot or a bank's PDF receipt. A **photograph is an image and nothing
 * else** — a PDF where a picture of a broken door should be is either a mistake
 * or somebody filing paperwork into the evidence, and refusing it costs a
 * sentence where accepting it costs a dispute. A pack is a PDF by construction.
 */
export const ACCEPTED_MIME_TYPES: Readonly<Record<DocumentKind, readonly StorableMimeType[]>> = {
  identity: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  payment_slip: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  inspection_photo: ['image/jpeg', 'image/png', 'image/webp'],
  accounting_pack: ['application/pdf'],
}

/**
 * The `accept` attribute for a kind's file input.
 *
 * Set explicitly rather than left to a wildcard: iOS Safari transcodes a HEIC
 * capture to JPEG only when the accept list excludes HEIC, and a wildcard
 * invites the browser to hand over a file `sniffMimeType` will then refuse at
 * the desk. Narrowing the picker is the difference between a photograph that
 * uploads and a photograph that produces an error message.
 */
export function acceptAttributeFor(kind: DocumentKind): string {
  return ACCEPTED_MIME_TYPES[kind].join(',')
}

/**
 * The ceiling on one upload, in bytes.
 *
 * **4 MiB, and the number is a platform constraint rather than a preference.**
 * A file reaches the server through a server action, and Vercel caps a
 * function's request body at 4.5 MB — a limit `serverActions.bodySizeLimit`
 * cannot raise, because it is enforced in front of the function. A 10 MB
 * allowance would work on a laptop and fail in production, which is the worst
 * shape a limit can have.
 *
 * It costs little today: phase-one files are WhatsApp screenshots and phone
 * photographs of an IC, which land far below this. What it will not survive is
 * a camera-original photograph from the housekeeping field screen (C2), and the
 * upgrade path is recorded in architecture.md §8 — a signed upload URL issued
 * after the permission check, with the browser sending the bytes to Storage
 * directly and the server sniffing what arrived.
 */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024

/**
 * The chosen files an upload would refuse for being too large.
 *
 * The predicate rather than the boolean, because every caller has the same two
 * jobs: disable the button, and name what is wrong. It lives here rather than
 * in the picker so the number and the rule stay in the same file — a second
 * copy of `size > MAX_DOCUMENT_BYTES` in a component is how a limit ends up
 * being raised in one place and not the other.
 *
 * Structurally typed on `size` alone so the unit suite can check it without a
 * DOM `File`.
 */
export function oversizedFiles<T extends { size: number }>(files: readonly T[]): readonly T[] {
  return files.filter((file) => file.size > MAX_DOCUMENT_BYTES)
}

/**
 * The ceiling on one stored file, by kind.
 *
 * Three kinds arrive through a server action and take the upload ceiling
 * above. An accounting pack does not: it is assembled on the server and goes
 * straight to Storage, never crossing the request-body boundary the 4 MiB
 * number exists for — and it carries copies of the slips, so it can be larger
 * than any one of them. Its figure is the `packs` bucket's own
 * `file_size_limit` (25 MiB, migration 20260907000100), so the check here and
 * the check in Storage agree on the number.
 */
export const MAX_BYTES_FOR_KIND: Readonly<Record<DocumentKind, number>> = {
  identity: MAX_DOCUMENT_BYTES,
  payment_slip: MAX_DOCUMENT_BYTES,
  inspection_photo: MAX_DOCUMENT_BYTES,
  accounting_pack: 25 * 1024 * 1024,
}

/** The longest filename kept for display. Longer names are truncated, not refused. */
export const MAX_FILENAME_LENGTH = 120

/**
 * What the bytes actually are.
 *
 * The browser's declared content type is a claim by whoever is uploading, and a
 * bucket's `allowed_mime_types` checks that same claim — so neither is a
 * control. This reads the file's own header, and it is the only thing the
 * stored `mime_type` is ever set from.
 *
 * Four signatures, matching STORABLE_MIME_TYPES. Anything else returns null and
 * is refused: a permissive sniffer that guessed at unknown bytes would be
 * storing arbitrary content behind a permission that promises identity
 * documents.
 */
export function sniffMimeType(bytes: Uint8Array): StorableMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg'
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }

  // RIFF....WEBP — the four bytes between the two markers are the length of the
  // file itself and carry no signature, so both ends are checked and the middle
  // is skipped.
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    matchesAt(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'image/webp'
  }

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'application/pdf'
  }

  return null
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return matchesAt(bytes, 0, signature)
}

function matchesAt(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (bytes.length < offset + signature.length) {
    return false
  }

  return signature.every((byte, index) => bytes[offset + index] === byte)
}

/**
 * The extension a stored object is given.
 *
 * Derived from the sniffed type, never from the uploaded filename: the name is
 * whatever the guest's phone called it, and it is display text from the moment
 * it arrives. `.jpg` rather than `.jpeg` because that is what a browser and an
 * operating system both offer when the file is saved again.
 */
export const EXTENSION_FOR_MIME: Readonly<Record<StorableMimeType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export function extensionFor(mimeType: StorableMimeType): string {
  return EXTENSION_FOR_MIME[mimeType]
}

export type UploadErrorCode = 'empty' | 'too_large' | 'unreadable_type' | 'not_allowed_for_kind'

export interface UploadError {
  code: UploadErrorCode
  message: string
}

export type UploadCheck =
  { ok: true; mimeType: StorableMimeType; extension: string } | { ok: false; error: UploadError }

/**
 * Whether these bytes may be stored under this kind.
 *
 * The order matters. Size is checked before content, because an oversized file
 * has a different answer for the person holding it — "send a smaller photo" —
 * than an unreadable one, and reading the header of something about to be
 * refused anyway is work for nothing.
 *
 * Every refusal carries a sentence a staff member at a desk can act on. The
 * database refuses last on the same facts — the bucket CHECK, the kind's
 * pointer constraint and the bucket's own size limit — so a write arriving from
 * anywhere else is still bounded.
 */
export function checkUpload(kind: DocumentKind, bytes: Uint8Array): UploadCheck {
  if (bytes.length === 0) {
    return {
      ok: false,
      error: { code: 'empty', message: 'That file is empty. Choose the file again.' },
    }
  }

  const ceiling = MAX_BYTES_FOR_KIND[kind]

  if (bytes.length > ceiling) {
    return {
      ok: false,
      error: {
        code: 'too_large',
        message: `That file is larger than ${formatMegabytes(ceiling)}. A photograph taken on a phone is usually well under it.`,
      },
    }
  }

  const mimeType = sniffMimeType(bytes)

  if (!mimeType) {
    return {
      ok: false,
      error: {
        code: 'unreadable_type',
        message: 'That is not a JPEG, PNG, WebP or PDF. Attach a photograph or a PDF.',
      },
    }
  }

  if (!ACCEPTED_MIME_TYPES[kind].includes(mimeType)) {
    return {
      ok: false,
      error: {
        code: 'not_allowed_for_kind',
        message:
          kind === 'inspection_photo'
            ? 'A photograph has to be an image. Attach a JPEG, PNG or WebP.'
            : `A ${DOCUMENT_KIND_LABELS[kind].toLowerCase()} cannot be stored as that kind of file.`,
      },
    }
  }

  return { ok: true, mimeType, extension: extensionFor(mimeType) }
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

/**
 * A human-readable byte size, for the line under a filename.
 *
 * Whole numbers below a megabyte and one decimal above it: "812 KB" and
 * "1.4 MB" are both what somebody would say out loud, and "0.8 MB" is not.
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The first printable code point. Anything below it is a control character. */
const FIRST_PRINTABLE_CODE_POINT = 0x20

/** DEL, which is printable-adjacent and belongs in a filename no more than a tab does. */
const DELETE_CODE_POINT = 0x7f

/** Forward slash and backslash, named by code point so neither needs escaping here. */
const PATH_SEPARATORS: readonly string[] = [String.fromCharCode(0x2f), String.fromCharCode(0x5c)]

/**
 * The uploaded name, made safe to store and to render.
 *
 * It never becomes part of a storage key or a path — `storageKeyFor` builds
 * those from a uuid — so this is not sanitising a filesystem operation. It is
 * making sure the string a screen prints is a filename, and not a path, a run
 * of control characters, or three kilobytes of something. An empty result falls
 * back to the kind's own label rather than to a blank row, because a document
 * with no visible name is one nobody can refer to on the phone.
 *
 * Written as a code-point pass rather than a regular expression because the
 * characters being removed are ones that cannot be typed into source safely in
 * the first place.
 */
export function sanitiseFilename(name: string, kind: DocumentKind): string {
  const cleaned = Array.from(name)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0

      return code >= FIRST_PRINTABLE_CODE_POINT && code !== DELETE_CODE_POINT
    })
    .map((character) => (PATH_SEPARATORS.includes(character) ? ' ' : character))
    .join('')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
    .trim()

  return cleaned === '' ? DOCUMENT_KIND_LABELS[kind] : cleaned
}

/**
 * Where the object lives in its bucket.
 *
 * `{propertyId}/{documentId}.{ext}` — **flat under the property, deliberately.**
 * A key nested by booking reads better and costs more than it looks: Storage's
 * `list()` is prefix-only and does not recurse, so a nested layout turns the
 * retention job's orphan sweep and the test suite's cleanup into one call per
 * booking. Nothing is lost, because the `document` row already carries the
 * booking and the bucket already carries the kind — the key's only jobs are to
 * be unique and to name its property.
 *
 * The uuid rather than the filename means two guests uploading `IMG_0001.jpg`
 * are two objects, and that a key can never be guessed from anything a customer
 * knows. The bucket is private regardless; this is the second lock.
 */
export function storageKeyFor(input: {
  propertyId: string
  documentId: string
  extension: string
}): string {
  return `${input.propertyId}/${input.documentId}.${input.extension}`
}

/** The property prefix a bucket is listed by — the sweep's handle, and the tests'. */
export function storagePrefixFor(propertyId: string): string {
  return propertyId
}

/**
 * Whether a document has passed its retention date (capability G4).
 *
 * Read at every access as well as by the nightly job, so a document stops being
 * served the moment it falls due rather than whenever the job next runs. The
 * job hard-deletes the object; this is what makes the gap between the two
 * invisible.
 */
export function isExpired(retainUntil: string, now: Date = new Date()): boolean {
  return new Date(retainUntil).getTime() <= now.getTime()
}

/* ── Who may do what ──────────────────────────────────────────────────────── */

/**
 * Who may open a document, and the table this and `mayAttach` share.
 *
 * Every entry is an **[A]** — recorded in prd.md §13 and open-questions.md N23
 * for the client to confirm. prd.md §4 mints exactly one document permission,
 * `document.view_identity`, and gives it to Admin and Front Office. That
 * settles the sensitive half of the question and leaves three others, answered
 * here by reusing the permission that already means the same job:
 *
 * | Kind | Attach / remove | Open |
 * |---|---|---|
 * | identity | `booking.amend` | `document.view_identity` |
 * | payment_slip | `payment.verify` | `booking.view` |
 * | inspection_photo | `inspection.record` | `booking.view` |
 * | accounting_pack | nobody — assembled by the system (G5) | `booking.view` |
 *
 * **Existence is not content.** Whether a document is on file — its name, when
 * it was attached — is visible to anyone who may view the booking, and only
 * opening it is gated. A guard who can see that an IC was collected is being
 * told something useful and shown nothing; a screen that hid the row entirely
 * would make "did anyone take it?" unanswerable by the people whose job it is.
 *
 * **One consequence to put in front of Jason**, because it is not obvious: the
 * table means somebody holding `booking.amend` without `document.view_identity`
 * could remove an identity document they cannot open. No seeded role is in that
 * position today — Front Office and Admin hold both — so it is a question about
 * a role somebody might configure later rather than a hole in the shipped set.
 */
export function mayOpen(kind: DocumentKind, permissions: ReadonlySet<Permission>): boolean {
  if (kind === 'identity') {
    return hasPermission(permissions, 'document.view_identity')
  }

  return hasPermission(permissions, 'booking.view')
}

export function mayAttach(kind: DocumentKind, permissions: ReadonlySet<Permission>): boolean {
  const permission = ATTACH_PERMISSION[kind]

  return permission === null ? false : hasPermission(permissions, permission)
}

/** Removing is the same decision as attaching. See the table on `mayOpen`. */
export function mayRemove(kind: DocumentKind, permissions: ReadonlySet<Permission>): boolean {
  return mayAttach(kind, permissions)
}

/**
 * The permission each kind's attach and remove is gated by, or null where
 * nobody may.
 *
 * Exported as data rather than hidden inside `mayAttach`, because the server
 * action needs the string itself: architecture.md §4 requires
 * `requirePermission(...)` at the top of every mutation, and a boolean cannot
 * be passed to it.
 *
 * - **identity → `booking.amend`.** Attaching an IC changes what the booking
 *   record holds, which is what that permission already means. Deliberately
 *   NOT limited by the booking's status the way an amendment is: an IC that
 *   turns up after check-out is still the record this system exists to keep,
 *   and a completed stay is exactly when the accounting pack wants one.
 * - **payment_slip → `payment.verify`.** Whoever confirms what the bank shows
 *   is whoever files the evidence beside it (prd.md §10.4).
 * - **inspection_photo → `inspection.record`.** prd.md §11 requirement 2 makes
 *   the photograph part of the inspection, so it takes the inspection's
 *   permission rather than a second one.
 * - **accounting_pack → nobody.** Assembled by the system once a payment has
 *   been verified, and rebuilt when what it records changes (capability G5,
 *   architecture.md §8.2); nothing attaches or removes one by hand. It opens
 *   under `booking.view` because it carries nothing an identity document
 *   does — the IC is referenced in it, never copied into it.
 */
export const ATTACH_PERMISSION: Readonly<Record<DocumentKind, Permission | null>> = {
  identity: 'booking.amend',
  payment_slip: 'payment.verify',
  inspection_photo: 'inspection.record',
  accounting_pack: null,
}
