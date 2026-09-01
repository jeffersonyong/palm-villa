import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { Button } from '@/components/ui/button'
import { getUnitTypes } from '@/lib/db/inventory'
import { listUnitRegistry } from '@/lib/db/units'

import { RegistryEditor } from './registry-editor'

export const metadata: Metadata = {
  title: 'Unit registry',
}

/**
 * What the units are called, and how many there are (capability F6).
 *
 * ── Why this screen exists ────────────────────────────────────────────────
 *
 * Two of the open questions in docs/open-questions.md were blocking a screen
 * rather than a decision: N10 ("how are the units labelled on the actual
 * doors?") and N1 ("how many 2-bedroom units are there?"). The seed answers
 * neither — its `3B-01` scheme is provisional and carries a `TODO(client)`, and
 * the 2-bedroom type is seeded with zero units. Every week they stayed
 * unanswered was a week the system did not match the building.
 *
 * This turns both into settings. Neither question is *answered* by building it
 * — a number nobody has agreed is still not a fact, and both stay open in the
 * register — but answering them is now typing rather than a migration, which is
 * what F3 already promises for every other piece of property configuration.
 *
 * ── Why it lives under settings ───────────────────────────────────────────
 *
 * Two reasons, and the second is the load-bearing one. It sits with Pricing and
 * Roles because it is configuration and is gated on the same `config.manage`.
 * And putting it at `/portal/units/manage` would have made `manage` a word no
 * unit could be called, because it would shadow `/portal/units/[ref]` — a
 * constraint on the client's own vocabulary, imposed by a routing decision.
 */

export default async function UnitRegistryPage() {
  const actor = await getActor()

  // Not `unit.manage`. prd.md §4 gives Housekeeping that one "(status only)",
  // and renumbering the building is not a thing a cleaner does — see the
  // action's own note for why this did not become a new permission.
  if (!actor || !hasPermission(actor.permissions, 'config.manage')) {
    return (
      <>
        <PageHeader title="Unit registry" />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Naming and adding units needs the "Edit settings & roles" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const [registry, unitTypes] = await Promise.all([listUnitRegistry(), getUnitTypes()])

  const units = registry.map((unit) => ({
    id: unit.id,
    ref: unit.ref,
    unitTypeId: unit.unitTypeId,
    hasHistory: unit.hasHistory,
  }))

  return (
    <>
      {/* The way back, above the title rather than beside it. This screen is
          reached from the units board and from a different nav group, so
          leaving it needs an obvious exit — and a header action would compete
          with the h1 for a control that is not an action at all. `ghost`,
          because a way out is not a thing to advertise. The amend screen
          already does this; nothing new is being invented. */}
      <div className="mb-md">
        <Button asChild variant="ghost">
          <Link href="/portal/units">
            <ArrowLeft aria-hidden />
            Back to units
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Unit registry"
        description="What the units are called, and how many of each type the building has."
      />

      <div className="mt-xl">
        <RegistryEditor
          units={units}
          unitTypes={unitTypes.map((type) => ({ id: type.id, name: type.name }))}
        />
      </div>
    </>
  )
}
