import { Card } from '@/components/ui/card'
import type { Document } from '@/lib/db/documents'

import { AttachDocument } from '../../documents/attach-document'
import { DocumentRow } from '../../documents/document-row'

/**
 * The guest's identity document, on the booking's Guest & stay card
 * (capability B10, scope G2–G4).
 *
 * prd.md §2 records what this replaces: a copy of the guest's IC collected over
 * WhatsApp and kept in a folder on a computer, indefinitely, with no access
 * control. prd.md §13 [C] makes the copy required for registration, which is
 * why the absence below is stated rather than left blank — a booking with no IC
 * on file is a gap somebody should close, not an empty region of a screen.
 *
 * ── Three readers, three different screens ────────────────────────────────
 *
 * The panel renders for anyone who may view the booking, and what it offers
 * depends on what they hold (the table lives in lib/domain/document.ts):
 *
 * - **Admin and Front Office** see the files and can open, attach and remove.
 * - **Finance, Housekeeping, Security** see *that* an IC is on file, with no
 *   way to open it. That is the point rather than a compromise: prd.md §4 keeps
 *   identity documents away from those roles, and knowing the document exists
 *   is what lets a guard stop asking for it at the gate.
 * - Someone who may attach but not open — possible only under a role an
 *   administrator configures, not under any seeded one — gets the attach
 *   control and no Open links. Flagged as **[A]** in open-questions.md N23.
 */

interface IdentityDocumentsProps {
  bookingId: string
  guestName: string
  documents: readonly Document[]
  mayOpen: boolean
  mayAttach: boolean
  /** Resolves an uploader's id to a name, as every history panel does. */
  actorNames: Map<string, string>
}

export function IdentityDocuments({
  bookingId,
  guestName,
  documents,
  mayOpen,
  mayAttach,
  actorNames,
}: IdentityDocumentsProps) {
  return (
    <Card surface="inset" className="mt-lg">
      <div className="flex items-baseline justify-between gap-lg">
        <span className="text-micro text-muted-foreground">Identity</span>
        {documents.length > 0 ? (
          <span className="text-caption text-muted-foreground">
            {documents.length === 1 ? '1 document' : `${documents.length} documents`}
          </span>
        ) : null}
      </div>

      {/* The absence and the way to end it share a line — the sentence on the
          left, the control on the right, bottoms level — so the panel is one
          row rather than a caption with a button stacked under it. With files
          on file the control keeps that right edge, under the list. */}
      {documents.length === 0 ? (
        <div className="mt-sm flex items-end justify-between gap-md">
          <p className="text-body-sm text-muted-foreground">No identity document on file.</p>
          {mayAttach ? <AttachIdentity bookingId={bookingId} guestName={guestName} /> : null}
        </div>
      ) : (
        <>
          <div className="mt-xs divide-y divide-border">
            {documents.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                mayOpen={mayOpen}
                mayRemove={mayAttach}
                attachedBy={nameOf(document.uploadedBy, actorNames)}
              />
            ))}
          </div>
          {mayAttach ? (
            <div className="mt-md flex justify-end">
              <AttachIdentity bookingId={bookingId} guestName={guestName} another />
            </div>
          ) : null}
        </>
      )}

      {!mayOpen && documents.length > 0 ? (
        <p className="mt-md text-caption text-muted-foreground">
          Identity documents are opened only by staff with permission to view them.
        </p>
      ) : null}
    </Card>
  )
}

function AttachIdentity({
  bookingId,
  guestName,
  another,
}: {
  bookingId: string
  guestName: string
  another?: boolean
}) {
  return (
    <AttachDocument
      kind="identity"
      bookingId={bookingId}
      label={another ? 'Attach another' : 'Attach ID'}
      title={`Attach ${guestName}'s identity document`}
      description="Stored privately, opened only by staff who are allowed to, and every time somebody opens it is recorded. Deleted automatically twelve months after the guest checks out."
    />
  )
}

function nameOf(actorId: string | null, actorNames: Map<string, string>): string {
  if (!actorId) {
    return 'Attached by the system'
  }

  return actorNames.get(actorId) ?? 'A former colleague'
}
