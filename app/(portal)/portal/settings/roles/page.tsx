import type { Metadata } from 'next'

import { EmptyState } from '@/components/portal/empty-state'
import { ExportCsvButton } from '@/components/portal/export-csv'
import { PageHeader } from '@/components/portal/page-header'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { exportGroup } from '@/lib/db/export'
import { listRolesWithPermissions, listStaff } from '@/lib/db/staff'

import { RolesStaffTabs } from './roles-staff-tabs'

export const metadata: Metadata = {
  title: 'Roles & staff',
}

/**
 * Staff accounts and what each role may do (capabilities F1/F2).
 *
 * Render-gated on `config.manage` (architecture.md §3: render is additionally
 * gated per-permission server-side): without it the screen shows a quiet
 * no-access card and fetches nothing. The gate that matters is still on every
 * server action — this one only spares a staff member a screen they cannot
 * use.
 */
export default async function RolesSettingsPage() {
  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'config.manage')) {
    return (
      <>
        <PageHeader title="Roles & staff" description="Staff accounts and what each role may do." />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Managing staff and roles needs the "Edit settings & roles" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const [staff, roles] = await Promise.all([listStaff(), listRolesWithPermissions()])

  return (
    <>
      {/* The screen has no control line of its own — it is two tabs — so the
          export sits in the header's action slot. Ungated here: the whole
          screen already answers to `config.manage`. */}
      <PageHeader
        title="Roles & staff"
        description="Staff accounts and what each role may do. One person can hold several roles."
        actions={<ExportCsvButton tables={exportGroup('staff')} />}
      />

      <RolesStaffTabs staff={staff} roles={roles} currentUserId={actor.userId} />
    </>
  )
}
