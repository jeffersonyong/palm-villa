'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { RoleWithPermissions, StaffAccount } from '@/lib/db/staff'

import { RolesTab } from './roles-tab'
import { NewStaffDialog, StaffTab } from './staff-tab'

/**
 * The screen's two tabs and the row they share: the Staff/Roles switcher on
 * the left, "New staff account" — the screen's single primary fill — on the
 * right of the same line, shown only while the Staff tab is active so the
 * Roles tab never carries a primary that acts on the other tab. Controlled
 * tabs, because the button's visibility hangs off the active value.
 */

interface RolesStaffTabsProps {
  staff: readonly StaffAccount[]
  roles: readonly RoleWithPermissions[]
  currentUserId: string
}

export function RolesStaffTabs({ staff, roles, currentUserId }: RolesStaffTabsProps) {
  const [activeTab, setActiveTab] = useState('staff')
  const [isNewStaffOpen, setIsNewStaffOpen] = useState(false)

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-xl">
      <div className="flex flex-wrap items-center justify-between gap-lg">
        <TabsList aria-label="Staff or roles">
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        {activeTab === 'staff' ? (
          <Button onClick={() => setIsNewStaffOpen(true)}>
            <Plus aria-hidden />
            New staff account
          </Button>
        ) : null}
      </div>

      <TabsContent value="staff">
        <StaffTab staff={staff} roles={roles} currentUserId={currentUserId} />
      </TabsContent>

      <TabsContent value="roles">
        <RolesTab roles={roles} />
      </TabsContent>

      {/* Not gated on activeTab: the dialog is modal, so the tab cannot
          change while it is open — only the trigger button is tab-scoped. */}
      {isNewStaffOpen ? (
        <NewStaffDialog roles={roles} onClose={() => setIsNewStaffOpen(false)} />
      ) : null}
    </Tabs>
  )
}
