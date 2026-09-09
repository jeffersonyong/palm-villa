import type { Metadata } from 'next'

import { EmptyState } from '@/components/portal/empty-state'
import { ExportCsvButton } from '@/components/portal/export-csv'
import { PageHeader } from '@/components/portal/page-header'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { exportGroup } from '@/lib/db/export'
import { readPropertySettings } from '@/lib/db/settings'

import { PropertySettingsTabs } from './property-settings-tabs'
import { isPropertyTab } from './property-tabs'

export const metadata: Metadata = {
  title: 'Property settings',
}

/**
 * The figures the business runs on (capability F3).
 *
 * Render-gated on `config.manage` — architecture.md §3's per-permission render
 * gate — so a staff member without it gets a quiet card and this fetches
 * nothing. The gate that matters is on every action in ./actions.ts; this one
 * only spares somebody a screen they cannot use.
 *
 * The tab is a search param so a link can point at one — the audit log's
 * "Record" column links straight to the tab a settings event came from.
 */

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function PropertySettingsPage({ searchParams }: PageProps) {
  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'config.manage')) {
    return (
      <>
        <PageHeader
          title="Property settings"
          description="Rates, day-pass pricing, facilities, document retention and bank accounts."
        />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Changing the property settings needs the "Edit settings, roles & the unit registry" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const { tab } = await searchParams
  const settings = await readPropertySettings()

  return (
    <>
      {/* Every rate, price, period and account on one sheet — the tabs below
          are the same settings arranged for editing. Ungated: the screen
          already answers to `config.manage`. */}
      <PageHeader
        title="Property settings"
        description="What the property charges, what a day pass admits, how long documents are kept, and where customers transfer to. Every change is recorded."
        actions={<ExportCsvButton tables={exportGroup('settings')} />}
      />

      <PropertySettingsTabs
        settings={settings}
        initialTab={tab && isPropertyTab(tab) ? tab : 'pricing'}
      />
    </>
  )
}
