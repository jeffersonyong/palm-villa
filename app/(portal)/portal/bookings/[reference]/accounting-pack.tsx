'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ActivityBar } from '@/components/ui/activity-bar'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Document } from '@/lib/db/documents'

import { DocumentRow } from '../../documents/document-row'

import { latestAccountingPackIdAction } from './actions'

/**
 * The booking's accounting pack (capability G5).
 *
 * scope-of-capabilities.md G5: "generated automatically per booking — no more
 * manual PDF assembly". This is where staff find it: the newest live pack as a
 * document row like any other, with Open behind `booking.view` and no Remove,
 * because nobody attaches a pack and nobody deletes one (lib/domain/document.ts
 * — a pack is replaced, and the replaced one stays on the history).
 *
 * ── Why this waits, and how it knows to stop ──────────────────────────────
 *
 * A pack is assembled by `after()` once the verification's response is on its
 * way (schedule-accounting-pack.ts), so the clerk's screen re-renders a second
 * or two before the file exists. It used to say "being assembled" and leave
 * them to refresh. Now, while the pack is behind the newest verification, the
 * panel polls for the pack's id and re-renders the route the moment it
 * changes — the same route render, with the file in it.
 *
 * The wait is bounded. An assembly that fails is retried by the nightly job,
 * and a panel that polled until then would be polling for a file it already
 * knows is not coming; so past `ASSEMBLY_WAIT_MS` from the verification the
 * panel stops and says what happens overnight. A screen opened hours later
 * lands on that state straight away.
 *
 * `pendingSince` is the server's word for "behind": the newest verification
 * the live pack does not yet reflect, or null when it does. The comparison is
 * the server's because it is the server's clock both timestamps came from.
 */

const POLL_MS = 3_000
const ASSEMBLY_WAIT_MS = 2 * 60_000

interface AccountingPackProps {
  bookingId: string
  /** The newest live pack, or null. */
  pack: Document | null
  mayOpen: boolean
  hasVerifiedPayment: boolean
  /** When the pack fell behind — the newest verification it does not carry. */
  pendingSince: string | null
}

export function AccountingPack({
  bookingId,
  pack,
  mayOpen,
  hasVerifiedPayment,
  pendingSince,
}: AccountingPackProps) {
  const isAssembling = useAssemblyWatch({ bookingId, packId: pack?.id ?? null, pendingSince })

  if (!pack) {
    return (
      <Card surface="inset">
        {isAssembling ? (
          <AssemblingRow />
        ) : (
          <p className="text-body-sm text-muted-foreground">
            {hasVerifiedPayment
              ? 'Not assembled yet. It is built overnight.'
              : 'No pack yet. One is assembled automatically once a payment has been verified.'}
          </p>
        )}
      </Card>
    )
  }

  return (
    <Card surface="inset">
      <div className="divide-y divide-border">
        <DocumentRow
          document={pack}
          mayOpen={mayOpen}
          mayRemove={false}
          attachedBy="Assembled by the system"
        />
      </div>
      {isAssembling ? (
        /* The bar spans the inset, under the row it is about. The ellipsis
           went with it: three dots were the whole of the old signal, and next
           to something that visibly moves they are a tic. */
        <div className="mt-md grid gap-xs" aria-busy>
          <ActivityBar />
          <p className="text-caption text-muted-foreground" aria-live="polite">
            Rebuilding to include the latest payment
          </p>
        </div>
      ) : pendingSince ? (
        <p className="mt-sm text-caption text-muted-foreground">
          A newer payment has been verified. The pack is rebuilt overnight.
        </p>
      ) : null}
    </Card>
  )
}

/**
 * The row's shape, while the file is on its way. The bars take the card fill
 * rather than the skeleton's default `muted`, because this sits on the gray
 * inset — an object is whichever tone is a step away from what it sits on,
 * and a muted bar on a muted panel is not there at all.
 */
function AssemblingRow() {
  return (
    <div className="grid gap-xs py-sm" aria-live="polite" aria-busy>
      <Skeleton className="h-4 w-[220px] bg-card" />
      <Skeleton className="h-3 w-[300px] bg-card" />
      <span className="sr-only">Assembling the accounting pack</span>
      <p className="mt-xs text-caption text-muted-foreground">Being assembled…</p>
    </div>
  )
}

/**
 * True while the pack is behind and still within the window a live assembly
 * could land in. Polls in that state, and refreshes the route when the pack's
 * id moves; a refresh that lands a current pack makes `pendingSince` null on
 * the next render, which ends the watch.
 */
function useAssemblyWatch({
  bookingId,
  packId,
  pendingSince,
}: {
  bookingId: string
  packId: string | null
  pendingSince: string | null
}): boolean {
  const router = useRouter()
  const deadline = pendingSince ? new Date(pendingSince).getTime() + ASSEMBLY_WAIT_MS : null
  // Initialised from the clock so a screen opened long after the verification
  // renders the overnight copy at once, rather than a skeleton for one frame.
  const [hasExpired, setHasExpired] = useState(() => deadline !== null && Date.now() > deadline)

  useEffect(() => {
    if (deadline === null || Date.now() > deadline) {
      return
    }

    let isCancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      if (isCancelled) {
        return
      }

      try {
        const latest = await latestAccountingPackIdAction(bookingId)

        if (isCancelled) {
          return
        }

        if (latest !== packId) {
          router.refresh()
          return
        }
      } catch {
        // A failed poll is tried again on the next tick; nothing to tell the
        // reader, who is watching for a file rather than for this.
      }

      if (Date.now() > deadline!) {
        setHasExpired(true)
        return
      }

      timer = setTimeout(poll, POLL_MS)
    }

    timer = setTimeout(poll, POLL_MS)

    return () => {
      isCancelled = true
      clearTimeout(timer)
    }
  }, [bookingId, packId, deadline, router])

  return deadline !== null && !hasExpired
}
