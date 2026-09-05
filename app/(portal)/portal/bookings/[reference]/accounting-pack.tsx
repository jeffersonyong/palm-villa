'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { SectionCard } from '@/components/portal/section-card'
import { ActivityBar } from '@/components/ui/activity-bar'
import { Card } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { TextAction } from '@/components/ui/text-action'
import { toast } from '@/components/ui/toast-store'
import type { Document } from '@/lib/db/documents'
import { cn } from '@/lib/utils'

import { DocumentRow } from '../../documents/document-row'

import { latestAccountingPackIdAction, rebuildAccountingPackAction } from './actions'

/**
 * The booking's accounting pack (capability G5).
 *
 * scope-of-capabilities.md G5: "generated automatically per booking — no more
 * manual PDF assembly". This is where staff find it: the newest live pack as a
 * document row like any other, with Open behind `booking.view` and no Remove,
 * because nobody attaches a pack and nobody deletes one (lib/domain/document.ts
 * — a pack is replaced, and the replaced one stays on the history).
 *
 * It owns its `SectionCard` rather than being dropped into one, because the
 * rebuild control belongs on the title line — "the one control that acts on
 * the section as a whole" — and whether to draw it depends on state that lives
 * in here.
 *
 * ── Two different questions, which this used to conflate ──────────────────
 *
 * **Is the pack behind?** (`pendingSince`) — anything it records has moved:
 * the booking, a verification, a slip or an IC attached or removed. The
 * database answers this now, with the same function the nightly due-list uses
 * (`accountingPackChangedAt`). It drives the "out of date" line and the button.
 *
 * **Is an assembly happening right now?** (`verifiedSince`) — a payment was
 * verified moments ago and `after()` is rendering the PDF. Only a verification
 * schedules that; attaching a slip does not.
 *
 * They were one prop, computed from verifications alone, and the cost was both
 * halves being wrong: a slip attached after a pack was built showed nothing at
 * all, and had the prop merely been widened, every stale pack would have sat
 * there polling for an assembly that was never scheduled.
 *
 * ── Why this waits, and how it knows to stop ──────────────────────────────
 *
 * A pack is assembled by `after()` once the verification's response is on its
 * way (schedule-accounting-pack.ts), so the clerk's screen re-renders a second
 * or two before the file exists. While the pack is behind the newest
 * verification, the panel polls for the pack's id and re-renders the route the
 * moment it changes — the same route render, with the file in it.
 *
 * The wait is bounded. An assembly that fails is retried by the nightly job,
 * and a panel that polled until then would be polling for a file it already
 * knows is not coming; so past `ASSEMBLY_WAIT_MS` from the verification the
 * panel stops. A screen opened hours later lands on that state straight away —
 * and now finds a button rather than only a sentence about tonight.
 */

const POLL_MS = 3_000
const ASSEMBLY_WAIT_MS = 2 * 60_000

const HINT =
  'Built when a payment is verified, and rebuilt overnight after any change to the booking, its payments or its documents — or now, from Rebuild. Earlier versions stay on the history. The identity document is referenced, not copied in.'

interface AccountingPackProps {
  bookingId: string
  /** The newest live pack, or null. */
  pack: Document | null
  mayOpen: boolean
  hasVerifiedPayment: boolean
  /** When the pack fell behind anything it records, or null when it is current. */
  pendingSince: string | null
  /** A verification the pack does not carry — an assembly is expected. */
  verifiedSince: string | null
  mayRebuild: boolean
}

export function AccountingPack({
  bookingId,
  pack,
  mayOpen,
  hasVerifiedPayment,
  pendingSince,
  verifiedSince,
  mayRebuild,
}: AccountingPackProps) {
  const isAssembling = useAssemblyWatch({
    bookingId,
    packId: pack?.id ?? null,
    pendingSince: verifiedSince,
  })
  const [isRebuilding, startRebuild] = useTransition()
  const [failure, setFailure] = useState<string | null>(null)
  const router = useRouter()

  const isBusy = isAssembling || isRebuilding
  const isBehind = pendingSince !== null

  function rebuild() {
    setFailure(null)

    startRebuild(async () => {
      const result = await rebuildAccountingPackAction(bookingId)

      if (result.status === 'error') {
        setFailure(result.message ?? 'The pack could not be rebuilt.')

        return
      }

      toast({
        tone: 'positive',
        title: 'Accounting pack rebuilt',
        description: 'It now carries everything on the booking.',
      })
      router.refresh()
    })
  }

  return (
    <SectionCard
      id="pack-heading"
      title="Accounting pack"
      hint={HINT}
      className="mt-xl"
      actions={
        /* Only when there is something to rebuild. A control that is always
           there invites a click that changes nothing, and the pack is current
           almost all of the time. Hidden while an assembly is already running,
           for the same reason.

           Text rather than a button: it sits on a `micro` title line beside a
           tooltip glyph, and a bordered rectangle there reads as chrome the
           section has grown rather than as the offer it is. */
        mayRebuild && isBehind && !isBusy ? (
          <TextAction onClick={rebuild}>Rebuild now</TextAction>
        ) : null
      }
    >
      {pack ? (
        <Card surface="inset">
          <div className="divide-y divide-border">
            <DocumentRow
              document={pack}
              mayOpen={mayOpen}
              mayRemove={false}
              attachedBy="Assembled by the system"
            />
          </div>
          <PackState
            isBusy={isBusy}
            isRebuilding={isRebuilding}
            isBehind={isBehind}
            mayRebuild={mayRebuild}
            failure={failure}
          />
        </Card>
      ) : (
        <Card surface="inset">
          {isBusy ? (
            <Working label="Assembling the pack" />
          ) : (
            <p className="text-body-sm text-muted-foreground">
              {hasVerifiedPayment
                ? 'Not assembled yet. It is built overnight.'
                : 'No pack yet. One is assembled automatically once a payment has been verified.'}
            </p>
          )}
          {failure ? <FieldError message={failure} /> : null}
        </Card>
      )}
    </SectionCard>
  )
}

/**
 * The line under the pack row: working, behind, or nothing at all.
 *
 * "Behind" no longer says *payment*. It is as often a slip attached after the
 * fact, and naming the wrong cause is worse than naming none — the reader goes
 * looking for a payment that did not change.
 */
function PackState({
  isBusy,
  isRebuilding,
  isBehind,
  mayRebuild,
  failure,
}: {
  isBusy: boolean
  isRebuilding: boolean
  isBehind: boolean
  mayRebuild: boolean
  failure: string | null
}) {
  if (isBusy) {
    return (
      <Working
        className="mt-md"
        label={isRebuilding ? 'Rebuilding the pack' : 'Rebuilding to include the latest payment'}
      />
    )
  }

  if (failure) {
    return (
      <div className="mt-sm">
        <FieldError message={failure} />
      </div>
    )
  }

  if (!isBehind) {
    return null
  }

  return (
    <p className="mt-sm text-caption text-muted-foreground">
      The booking has changed since this was assembled.{' '}
      {mayRebuild
        ? 'Rebuild it now, or leave it — it is rebuilt overnight.'
        : 'It is rebuilt overnight.'}
    </p>
  )
}

/**
 * The panel is working. One construction for both cases.
 *
 * It used to be two: a `Skeleton` row while the first pack was assembled, and
 * the activity bar while an existing one was rebuilt. Same job, two idioms,
 * and a reader who verified a payment and then watched a pack rebuild saw the
 * screen answer the same question two different ways.
 *
 * The activity bar wins both because a skeleton is the wrong claim here. A
 * skeleton stands in for content that already exists and is on its way — the
 * shape of a row being fetched. A pack does not exist yet; it is being
 * *manufactured*, and nothing is in flight to stand in for. The honest
 * distinction is **fetching against generating**, not absent against present,
 * and generating is what the bar was built to say (design.md §Components).
 */
function Working({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('grid gap-xs', className)} aria-busy>
      <ActivityBar />
      <p className="text-caption text-muted-foreground" aria-live="polite">
        {label}
      </p>
    </div>
  )
}

/**
 * True while a verification the pack does not carry is recent enough that an
 * assembly could still land. Polls in that state, and refreshes the route when
 * the pack's id moves; a refresh that lands a current pack makes `pendingSince`
 * null on the next render, which ends the watch.
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
  // renders the settled copy at once, rather than a skeleton for one frame.
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
