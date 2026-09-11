'use client'

import { Check } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import {
  acceptAttributeFor,
  formatByteSize,
  MAX_DOCUMENT_BYTES,
  oversizedFiles,
  type CustomerAttachableKind,
} from '@/lib/domain/document'

import { uploadDocumentAction, type UploadState } from './actions'

/**
 * The guest sends us a file (capabilities A6 and A7).
 *
 * One component for both, because from the customer's side they are the same
 * act — choose a photograph, press send — and the only thing that differs is
 * what the surrounding sentence asks for. A6 is the transfer slip they would
 * otherwise send over WhatsApp; A7 is the IC the desk would otherwise ask for
 * at the door.
 *
 * ── Why this is not the portal's `AttachDocument` ──────────────────────────
 *
 * That component calls a server action gated by `requirePermission`, which a
 * customer can never satisfy. The *rules* are shared and are not restated here
 * — `acceptAttributeFor`, `oversizedFiles` and the 4 MiB ceiling all come from
 * `lib/domain/document.ts`, so the limit cannot be raised in one place and not
 * the other. What is not shared is the chrome: `FileField` is built at the
 * operations register's 32px, and this is a customer on a phone.
 *
 * ── What it shows once a file is on file ───────────────────────────────────
 *
 * That there is one, and when it arrived. Never the filename, and never a way
 * to open it — this link travels in forwarded WhatsApp messages, and
 * `lib/domain/document.ts` carries the argument at length. A guest who sends a
 * second file replaces their own; the copy says so, because otherwise "send a
 * different one" reads as though we will end up with two.
 *
 * ── The retention period is not stated, deliberately ───────────────────────
 *
 * prd.md §13 is explicit: the period is configuration edited on Property
 * settings (F3), and copy that names a number is a second copy of that setting
 * in the one place nobody will think to update. So this says a file is held
 * privately and deleted when its retention period ends, which stays true
 * whatever Jason sets it to.
 */
interface SendAFileProps {
  token: string
  kind: CustomerAttachableKind
  /** The heading. */
  title: string
  /** Why we are asking, in the guest's terms. */
  description: string
  /** When this kind is already on file, the instant it arrived. */
  onFileSince: string | null
}

export function SendAFile({ token, kind, title, description, onFileSince }: SendAFileProps) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadDocumentAction, {
    status: 'idle',
  })
  const [files, setFiles] = useState<readonly File[]>([])
  const [seen, setSeen] = useState(state)
  const inputId = `send-${kind}`

  // A completed send forgets the file that was chosen, so the control returns
  // to its resting state rather than sitting there naming one that has already
  // gone. React 19 resets the `<input>` itself once a form action settles, so
  // the only thing left to clear is what we remembered about it.
  //
  // Adjusted during render rather than in an effect — the pattern React
  // documents for "state that depends on a prop changing", and the reason is
  // the ordinary one: an effect would render the stale filename once, then
  // render again without it.
  if (seen !== state) {
    setSeen(state)

    if (state.status === 'done') {
      setFiles([])
    }
  }

  const chosen = files[0] ?? null
  const oversized = oversizedFiles(files).length > 0
  const held = state.status === 'done' || onFileSince !== null

  return (
    <section className="mt-xl border-t border-border pt-xl">
      <h2 className="text-body-lg-strong text-foreground">{title}</h2>
      <p className="mt-xs text-body text-copy">{description}</p>

      {held ? (
        <p className="mt-md inline-flex items-center gap-xs text-body-sm text-copy">
          <Check aria-hidden className="size-4 text-positive-deep" />
          {state.status === 'done'
            ? 'Received, thank you.'
            : `Received ${formatArrival(onFileSince!)}.`}
        </p>
      ) : null}

      <form action={action} className="mt-md grid gap-md">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="kind" value={kind} />

        <div className="flex flex-wrap items-center gap-md">
          <label
            htmlFor={inputId}
            className="inline-flex h-control cursor-pointer items-center gap-sm rounded-md border border-border bg-card px-lg text-button-md text-foreground transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted"
          >
            {held ? 'Choose a different file' : 'Choose a file'}
          </label>
          <input
            id={inputId}
            type="file"
            name="file"
            accept={acceptAttributeFor(kind)}
            className="sr-only"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />

          {chosen ? (
            <span className="text-body-sm text-copy">
              {chosen.name} · {formatByteSize(chosen.size)}
            </span>
          ) : null}
        </div>

        {oversized ? (
          <p className="text-body-sm text-destructive">
            That file is larger than {megabytes()} MB. A photograph taken on a phone is usually well
            under it.
          </p>
        ) : (
          <p className="text-caption text-muted-foreground">
            JPEG, PNG, WebP or PDF, up to {megabytes()} MB. Held privately, shown only to our staff,
            and deleted when its retention period ends.
            {held ? ' Sending another replaces the one we have.' : ''}
          </p>
        )}

        {state.status === 'error' ? (
          <Callout tone="negative" placement="nested">
            {state.message}
          </Callout>
        ) : null}

        <div>
          <Button type="submit" disabled={pending || chosen === null || oversized}>
            {pending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function megabytes(): number {
  return Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))
}

/**
 * When a file arrived, in the register a guest reads rather than the portal's.
 *
 * A date and no time: "we have it" is the whole of what this tells them, and a
 * timestamp to the minute invites a question about which of two uploads it was.
 */
function formatArrival(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
