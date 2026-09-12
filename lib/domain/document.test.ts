import { describe, expect, test } from 'vitest'

import { PERMISSIONS, type Permission } from '@/lib/auth/permissions'

import {
  ACCEPTED_MIME_TYPES,
  ATTACH_PERMISSION,
  BUCKET_FOR_KIND,
  CUSTOMER_ATTACHABLE_KINDS,
  DOCUMENT_KIND_LABELS,
  DOCUMENT_KINDS,
  MAX_BYTES_FOR_KIND,
  MAX_DOCUMENT_BYTES,
  MAX_FILENAME_LENGTH,
  acceptAttributeFor,
  bucketFor,
  checkUpload,
  formatByteSize,
  isDocumentKind,
  isExpired,
  mayCustomerAttach,
  uploaderFor,
  mayAttach,
  mayOpen,
  mayRemove,
  oversizedFiles,
  sanitiseFilename,
  storageKeyFor,
} from './document'

/**
 * What may be stored, and who may see it.
 *
 * Mandatory coverage, for the reason the module's own header gives: prd.md §13
 * is a commitment under Brunei's PDPO, and these functions are the whole of the
 * difference between keeping it and breaching it. Two of the cases below are
 * the ones that actually matter in the wild — a file whose name lies about what
 * it is, and a role that can reach a document it should not.
 */

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

/** The shortest byte sequences each sniffable format can be recognised from. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

/** A real capture from an iPhone, which this product does not store. */
const HEIC = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
])

function permissions(...held: Permission[]): ReadonlySet<Permission> {
  return new Set(held)
}

/* ── The vocabulary ───────────────────────────────────────────────────────── */

describe('the document kinds', () => {
  test.each(DOCUMENT_KINDS)('%s is a kind', (kind) => {
    expect(isDocumentKind(kind)).toBe(true)
  })

  test('anything else is refused rather than coerced', () => {
    expect(isDocumentKind('passport')).toBe(false)
    expect(isDocumentKind('Identity')).toBe(false)
    expect(isDocumentKind('')).toBe(false)
  })

  test('every kind has a label, so no screen renders a raw enum value', () => {
    for (const kind of DOCUMENT_KINDS) {
      expect(DOCUMENT_KIND_LABELS[kind]).toBeTruthy()
    }
  })

  test('every kind has its own bucket, and no two share one', () => {
    const buckets = DOCUMENT_KINDS.map(bucketFor)

    expect(new Set(buckets).size).toBe(DOCUMENT_KINDS.length)
    // The four architecture.md §8 names them, and the migration CHECKs the pair.
    expect(buckets).toEqual(['identity-docs', 'payment-slips', 'inspection-photos', 'packs'])
    expect(BUCKET_FOR_KIND.identity).toBe('identity-docs')
  })

  test('every kind accepts at least one type, or nothing could ever be attached', () => {
    for (const kind of DOCUMENT_KINDS) {
      expect(ACCEPTED_MIME_TYPES[kind].length).toBeGreaterThan(0)
    }
  })

  test('the accept attribute lists the kind’s own types and no wildcard', () => {
    expect(acceptAttributeFor('inspection_photo')).toBe('image/jpeg,image/png,image/webp')
    expect(acceptAttributeFor('identity')).toContain('application/pdf')
    // A wildcard is what lets iOS hand over a HEIC the sniffer then refuses.
    expect(acceptAttributeFor('identity')).not.toContain('*')
  })
})

/* ── What may be uploaded ─────────────────────────────────────────────────── */

describe('checkUpload', () => {
  test('accepts an ordinary photograph of an IC', () => {
    const result = checkUpload('identity', JPEG)

    expect(result).toEqual({ ok: true, mimeType: 'image/jpeg', extension: 'jpg' })
  })

  test('accepts a PDF where a PDF makes sense', () => {
    expect(checkUpload('identity', PDF)).toMatchObject({ ok: true, extension: 'pdf' })
    expect(checkUpload('payment_slip', PDF)).toMatchObject({ ok: true, extension: 'pdf' })
    expect(checkUpload('accounting_pack', PDF)).toMatchObject({ ok: true, extension: 'pdf' })
  })

  test('a photograph has to be an image', () => {
    const result = checkUpload('inspection_photo', PDF)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.error.code).toBe('not_allowed_for_kind')
      expect(result.error.message).toContain('image')
    }
  })

  test('a pack has to be a PDF', () => {
    expect(checkUpload('accounting_pack', JPEG)).toMatchObject({
      ok: false,
      error: { code: 'not_allowed_for_kind' },
    })
  })

  test('an empty file is refused with something the clerk can act on', () => {
    const result = checkUpload('identity', new Uint8Array())

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.error.code).toBe('empty')
    }
  })

  test('a file over the ceiling is refused, and the ceiling is the platform’s', () => {
    // 4 MiB, because Vercel caps a function's request body at 4.5 MB and
    // `bodySizeLimit` cannot raise it — see the constant's own note.
    expect(MAX_DOCUMENT_BYTES).toBe(4 * 1024 * 1024)

    const oversized = new Uint8Array(MAX_DOCUMENT_BYTES + 1)
    oversized.set(JPEG)

    const result = checkUpload('identity', oversized)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.error.code).toBe('too_large')
      expect(result.error.message).toContain('4 MB')
    }
  })

  test('a file exactly at the ceiling is accepted', () => {
    const exact = new Uint8Array(MAX_DOCUMENT_BYTES)
    exact.set(JPEG)

    expect(checkUpload('identity', exact).ok).toBe(true)
  })

  test('a pack has the bucket’s ceiling, not the upload’s, because it never crosses the request boundary', () => {
    // 25 MiB, the `packs` bucket's own file_size_limit. The three uploaded
    // kinds keep the 4 MiB the platform imposes on a request body.
    expect(MAX_BYTES_FOR_KIND.accounting_pack).toBe(25 * 1024 * 1024)
    expect(MAX_BYTES_FOR_KIND.identity).toBe(MAX_DOCUMENT_BYTES)
    expect(MAX_BYTES_FOR_KIND.payment_slip).toBe(MAX_DOCUMENT_BYTES)
    expect(MAX_BYTES_FOR_KIND.inspection_photo).toBe(MAX_DOCUMENT_BYTES)

    const large = new Uint8Array(MAX_DOCUMENT_BYTES + 1)
    large.set(PDF)

    expect(checkUpload('accounting_pack', large).ok).toBe(true)
    expect(checkUpload('payment_slip', large).ok).toBe(false)

    const beyond = new Uint8Array(MAX_BYTES_FOR_KIND.accounting_pack + 1)
    beyond.set(PDF)
    const result = checkUpload('accounting_pack', beyond)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.error.code).toBe('too_large')
      expect(result.error.message).toContain('25 MB')
    }
  })

  test('an unreadable file is refused before it reaches storage', () => {
    const result = checkUpload('identity', HEIC)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.error.code).toBe('unreadable_type')
    }
  })

  test('size is answered before content, because the two need different sentences', () => {
    // Oversized AND unreadable. The person holding it needs to be told to send
    // a smaller file, not that the format is wrong.
    const oversized = new Uint8Array(MAX_DOCUMENT_BYTES + 1)

    const result = checkUpload('identity', oversized)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.error.code).toBe('too_large')
    }
  })
})

describe('the stored extension', () => {
  test('a JPEG stays a JPEG however the file was named', () => {
    // The case this exists for: a phone photograph renamed `passport.pdf`. The
    // extension comes from the bytes, so the stored object is `.jpg` and a
    // browser opening it later renders an image rather than a broken PDF.
    const result = checkUpload('identity', JPEG)

    expect(result).toMatchObject({ ok: true, extension: 'jpg' })
  })
})

/* ── Names, keys and sizes ────────────────────────────────────────────────── */

describe('sanitiseFilename', () => {
  test('an ordinary name is left alone', () => {
    expect(sanitiseFilename('IMG_0421.jpg', 'identity')).toBe('IMG_0421.jpg')
  })

  test('path separators cannot survive into something a screen prints', () => {
    const withPath = ['..', '..', 'etc', 'passwd'].join(String.fromCharCode(0x2f))

    expect(sanitiseFilename(withPath, 'identity')).not.toContain(String.fromCharCode(0x2f))
    expect(sanitiseFilename(withPath, 'identity')).not.toContain(String.fromCharCode(0x5c))
  })

  test('control characters are stripped', () => {
    const noisy = `slip${String.fromCharCode(0x00)}${String.fromCharCode(0x1b)}.png`

    expect(sanitiseFilename(noisy, 'payment_slip')).toBe('slip.png')
  })

  test('a very long name is truncated rather than refused', () => {
    const long = `${'a'.repeat(400)}.jpg`

    expect(sanitiseFilename(long, 'identity').length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH)
  })

  test('a name that sanitises to nothing falls back to the kind, never a blank row', () => {
    expect(sanitiseFilename('   ', 'identity')).toBe('Identity document')
    expect(sanitiseFilename(String.fromCharCode(0x07), 'inspection_photo')).toBe(
      'Inspection photograph',
    )
  })
})

describe('storageKeyFor', () => {
  test('is flat under the property, so a bucket lists in one call', () => {
    const key = storageKeyFor({
      propertyId: '11111111-1111-1111-1111-111111111111',
      documentId: '22222222-2222-2222-2222-222222222222',
      extension: 'jpg',
    })

    expect(key).toBe(
      '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg',
    )
    // One separator: the property prefix, then the object. Storage's list() is
    // prefix-only and does not recurse, which is what a nested key would cost.
    expect(key.split(String.fromCharCode(0x2f))).toHaveLength(2)
  })

  test('carries nothing a customer knows', () => {
    const key = storageKeyFor({
      propertyId: 'property',
      documentId: 'document',
      extension: 'pdf',
    })

    expect(key).not.toContain('PV-')
  })
})

describe('formatByteSize', () => {
  test('reads the way somebody would say it out loud', () => {
    expect(formatByteSize(512)).toBe('512 bytes')
    expect(formatByteSize(831488)).toBe('812 KB')
    expect(formatByteSize(1468006)).toBe('1.4 MB')
  })
})

/* ── Retention ────────────────────────────────────────────────────────────── */

describe('isExpired', () => {
  const now = new Date('2026-09-07T04:00:00Z')

  test('a document kept until next year is live', () => {
    expect(isExpired('2027-09-07T04:00:00Z', now)).toBe(false)
  })

  test('a document whose date has passed is expired', () => {
    expect(isExpired('2026-09-06T04:00:00Z', now)).toBe(true)
  })

  test('the boundary expires rather than lingering', () => {
    // Read at every access as well as by the nightly job, so the gap between
    // falling due and being deleted is invisible to a reader.
    expect(isExpired('2026-09-07T04:00:00Z', now)).toBe(true)
  })
})

/* ── Who may do what ──────────────────────────────────────────────────────── */

describe('mayOpen', () => {
  test('an identity document needs its own permission, not booking access', () => {
    expect(mayOpen('identity', permissions('booking.view'))).toBe(false)
    expect(mayOpen('identity', permissions('booking.view', 'document.view_identity'))).toBe(true)
  })

  test('Security and Housekeeping cannot open an IC', () => {
    // prd.md §4: "identity documents and payment verification are the two most
    // sensitive capabilities. Neither is granted to Security or Housekeeping."
    const security = permissions('booking.view')
    const housekeeping = permissions('booking.view', 'inspection.record', 'unit.manage')

    expect(mayOpen('identity', security)).toBe(false)
    expect(mayOpen('identity', housekeeping)).toBe(false)
  })

  test('a slip, a photograph and a pack open to anyone who may view the booking', () => {
    const viewer = permissions('booking.view')

    expect(mayOpen('payment_slip', viewer)).toBe(true)
    expect(mayOpen('inspection_photo', viewer)).toBe(true)
    expect(mayOpen('accounting_pack', viewer)).toBe(true)
  })

  test('somebody with no booking access opens nothing at all', () => {
    const none = permissions()

    for (const kind of DOCUMENT_KINDS) {
      expect(mayOpen(kind, none)).toBe(false)
    }
  })
})

describe('mayAttach and mayRemove', () => {
  test('an identity document is attached under booking.amend', () => {
    expect(mayAttach('identity', permissions('booking.amend'))).toBe(true)
    expect(mayAttach('identity', permissions('booking.view'))).toBe(false)
  })

  test('a slip is attached by whoever verifies payments', () => {
    expect(mayAttach('payment_slip', permissions('payment.verify'))).toBe(true)
    expect(mayAttach('payment_slip', permissions('booking.amend'))).toBe(false)
  })

  test('a photograph is attached by whoever records the inspection', () => {
    expect(mayAttach('inspection_photo', permissions('inspection.record'))).toBe(true)
    expect(mayAttach('inspection_photo', permissions('deposit.approve_release'))).toBe(false)
  })

  test('nobody attaches an accounting pack by hand', () => {
    // Generated server-side by capability G5. A permission that let a person
    // upload one would make the pack something other than what it claims.
    //
    // Every permission the product has, so the assertion is what the sentence
    // above says it is. Built from `ATTACH_PERMISSION`'s keys until review
    // caught it: those are document *kinds*, so the set held no permission at
    // all and the test passed on an empty one.
    const everything = permissions(...PERMISSIONS)

    expect(mayAttach('accounting_pack', everything)).toBe(false)
    expect(mayRemove('accounting_pack', everything)).toBe(false)
    expect(ATTACH_PERMISSION.accounting_pack).toBeNull()
  })

  test('removing is the same decision as attaching', () => {
    for (const kind of DOCUMENT_KINDS) {
      const held = ATTACH_PERMISSION[kind]
      const set = held === null ? permissions() : permissions(held)

      expect(mayRemove(kind, set)).toBe(mayAttach(kind, set))
    }
  })

  test('the [A] consequence to put in front of the client is real', () => {
    // booking.amend without document.view_identity can remove an identity
    // document it cannot open. No seeded role is in that position, and the
    // question is open-questions.md N23 — asserted here so that changing the
    // table is a deliberate act rather than a quiet one.
    const amenderOnly = permissions('booking.view', 'booking.amend')

    expect(mayRemove('identity', amenderOnly)).toBe(true)
    expect(mayOpen('identity', amenderOnly)).toBe(false)
  })
})

describe('oversizedFiles', () => {
  test('returns the files past the upload ceiling and nothing else', () => {
    // Arrange
    const files = [
      { name: 'ok.jpg', size: MAX_DOCUMENT_BYTES },
      { name: 'huge.jpg', size: MAX_DOCUMENT_BYTES + 1 },
      { name: 'tiny.jpg', size: 1 },
    ]

    // Act
    const refused = oversizedFiles(files)

    // Assert
    expect(refused.map((file) => file.name)).toEqual(['huge.jpg'])
  })

  test('the ceiling itself is allowed, not refused', () => {
    expect(oversizedFiles([{ size: MAX_DOCUMENT_BYTES }])).toEqual([])
  })

  test('nothing chosen is nothing refused', () => {
    expect(oversizedFiles([])).toEqual([])
  })
})

/* ── The customer (capabilities A6, A7) ───────────────────────────────────── */

describe('mayCustomerAttach', () => {
  test('accepts the two things a guest actually holds', () => {
    expect(mayCustomerAttach('payment_slip')).toBe(true)
    expect(mayCustomerAttach('identity')).toBe(true)
  })

  test('refuses an inspection photograph', () => {
    // Housekeeping's record of what they found after the guest left. A guest
    // supplying it would be supplying the evidence against themselves.
    expect(mayCustomerAttach('inspection_photo')).toBe(false)
  })

  test('refuses an accounting pack', () => {
    // Assembled by the system and by nobody by hand (capability G5).
    expect(mayCustomerAttach('accounting_pack')).toBe(false)
  })

  test('every kind has an answer, so a fifth cannot be added silently', () => {
    for (const kind of DOCUMENT_KINDS) {
      expect(typeof mayCustomerAttach(kind)).toBe('boolean')
    }
  })

  test('the allowlist and the predicate cannot drift apart', () => {
    const allowed = DOCUMENT_KINDS.filter(mayCustomerAttach)

    expect([...allowed].sort()).toEqual([...CUSTOMER_ATTACHABLE_KINDS].sort())
  })

  test('a customer may never attach what nobody may attach by hand', () => {
    // The two tables answer different questions and must not contradict each
    // other on the one kind where the answer is "nobody".
    for (const kind of CUSTOMER_ATTACHABLE_KINDS) {
      expect(ATTACH_PERMISSION[kind]).not.toBeNull()
    }
  })
})

describe('uploaderFor', () => {
  test('names the guest where a customer-attachable kind has no actor', () => {
    // Arrange
    const slip = { kind: 'payment_slip', uploadedBy: null, actorName: null } as const

    // Act
    const who = uploaderFor(slip)

    // Assert
    expect(who).toBe('the guest')
  })

  test('names the guest for an identity document with no actor', () => {
    expect(uploaderFor({ kind: 'identity', uploadedBy: null, actorName: null })).toBe('the guest')
  })

  test('names the system for a pack, which a customer can never send', () => {
    expect(uploaderFor({ kind: 'accounting_pack', uploadedBy: null, actorName: null })).toBe(
      'the system',
    )
  })

  test('names the system for a photograph, where a null actor is a fault', () => {
    expect(uploaderFor({ kind: 'inspection_photo', uploadedBy: null, actorName: null })).toBe(
      'the system',
    )
  })

  test('names the staff member where there is one', () => {
    expect(uploaderFor({ kind: 'identity', uploadedBy: 'user-1', actorName: 'Aisyah' })).toBe(
      'Aisyah',
    )
  })

  test('falls back where the account is gone, and never to the guest', () => {
    // An actor id with no name is somebody who has left, not a customer —
    // getting this wrong would attribute a clerk's upload to the guest.
    expect(uploaderFor({ kind: 'identity', uploadedBy: 'user-9', actorName: null })).toBe(
      'a former colleague',
    )
  })
})
