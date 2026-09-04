import type { Document } from '@/lib/db/documents'

import { DocumentRow } from '../../documents/document-row'

/**
 * The booking's accounting pack (capability G5).
 *
 * scope-of-capabilities.md G5: "generated automatically per booking — no more
 * manual PDF assembly". This is where staff find it: the newest live pack as a
 * document row like any other, with Open behind `booking.view` and no Remove,
 * because nobody attaches a pack and nobody deletes one (lib/domain/document.ts
 * — a pack is replaced, and the replaced one stays on the history).
 *
 * ── What the two empty states say ─────────────────────────────────────────
 *
 * A booking with no verified payment has nothing to record, and the panel says
 * when that changes. A booking with a verified payment and no pack is the
 * seconds between a verification and its `after()` finishing — or an assembly
 * that failed and is waiting for tonight — and the panel says that too, rather
 * than reading as a feature that did not work.
 */

interface AccountingPackProps {
  /** The newest live pack, or null. */
  pack: Document | null
  mayOpen: boolean
  hasVerifiedPayment: boolean
}

export function AccountingPack({ pack, mayOpen, hasVerifiedPayment }: AccountingPackProps) {
  if (!pack) {
    return (
      <p className="text-body-sm text-muted-foreground">
        {hasVerifiedPayment
          ? 'Being assembled. It appears here within a moment of a payment being verified; if it has not, it is built overnight.'
          : 'No pack yet. One is assembled automatically once a payment has been verified.'}
      </p>
    )
  }

  return (
    <>
      <div className="divide-y divide-border">
        <DocumentRow
          document={pack}
          mayOpen={mayOpen}
          mayRemove={false}
          attachedBy="Assembled by the system"
        />
      </div>
      <p className="mt-md text-caption text-muted-foreground">
        Assembled automatically after a payment is verified, and rebuilt overnight whenever a slip
        or identity document is attached or removed, a payment is verified, or the booking changes.
        Earlier versions stay on the history. The identity document is referenced in the pack, not
        copied into it.
      </p>
    </>
  )
}
