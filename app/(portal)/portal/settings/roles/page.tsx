import type { Metadata } from 'next'

import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { listRolesWithPermissions, listStaff } from '@/lib/db/staff'

import { RolesTab } from './roles-tab'
import { StaffTab } from './staff-tab'

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
        <PageHeader
          title="Roles & staff"
          description="Staff accounts and what each role may do."
        />
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
      <PageHeader
        title="Roles & staff"
        description="Staff accounts and what each role may do. One person can hold several roles."
      />

      <Tabs defaultValue="staff" className="mt-xl">
        <TabsList>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          <StaffTab staff={staff} roles={roles} currentUserId={actor.userId} />
        </TabsContent>

        <TabsContent value="roles">
          <RolesTab roles={roles} />
        </TabsContent>
      </Tabs>
    </>
  )
}
