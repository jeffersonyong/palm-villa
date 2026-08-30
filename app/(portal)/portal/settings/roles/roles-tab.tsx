'use client'

import { useActionState } from 'react'

import { EmptyState } from '@/components/portal/empty-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { RoleWithPermissions } from '@/lib/db/staff'

import { setRolePermissionsAction, type RoleAdminState } from './actions'
import { PERMISSION_GROUPS, PERMISSION_LABELS } from './permission-labels'

/**
 * The Roles tab (capability F2): each role's permission set, editable without
 * a developer. One permission list with a role switcher above it — roles
 * differ only in which boxes are ticked, so a single list the eye already
 * knows beats five cards of the same checkboxes. Every role's form stays
 * mounted (`forceMount`, hidden when inactive) so switching away and back
 * keeps unsaved ticks and a save's outcome message; each role is still its
 * own form, so a save cannot half-apply across roles.
 *
 * Saves are secondary buttons: the screen's single primary fill lives on the
 * Staff tab's "New staff account" (design.md — one primary per region).
 */

const initialState: RoleAdminState = { status: 'idle' }

export function RolesTab({ roles }: { roles: readonly RoleWithPermissions[] }) {
  const firstRole = roles[0]

  if (!firstRole) {
    // Roles are seeded with the property, so this is a data problem, not a
    // fresh-install state.
    return (
      <EmptyState
        title="No roles found"
        description="Roles are created with the property. If this persists, something is wrong with the property setup."
      />
    )
  }

  return (
    <Tabs defaultValue={firstRole.id}>
      <TabsList>
        {roles.map((role) => (
          <TabsTrigger key={role.id} value={role.id}>
            {role.name}
          </TabsTrigger>
        ))}
      </TabsList>

      {roles.map((role) => (
        <TabsContent
          key={role.id}
          value={role.id}
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <RoleCard role={role} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function RoleCard({ role }: { role: RoleWithPermissions }) {
  const [state, formAction, isPending] = useActionState(setRolePermissionsAction, initialState)
  const isAdminRole = role.slug === 'admin'

  return (
    <Card>
      <form action={formAction}>
        <input type="hidden" name="roleId" value={role.id} />

        <div className="flex items-baseline justify-between gap-lg">
          <h2 className="text-body-md-strong text-foreground">
            What {role.name} staff can do
          </h2>
          <Button type="submit" variant="secondary" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="mt-lg grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.label}>
              <legend className="micro-label text-muted-foreground">{group.label}</legend>
              <div className="mt-sm grid gap-sm">
                {group.permissions.map((permission) => {
                  const isLocked = isAdminRole && permission === 'config.manage'
                  const id = `${role.id}-${permission}`

                  return (
                    <div key={permission} className="flex items-center gap-sm">
                      {/* A disabled control submits nothing, so the locked
                          permission rides a hidden input instead. */}
                      {isLocked ? (
                        <input type="hidden" name="permissions" value={permission} />
                      ) : null}
                      <Checkbox
                        id={id}
                        name="permissions"
                        value={permission}
                        defaultChecked={role.permissions.includes(permission)}
                        // The Admin role always keeps role administration —
                        // enforced server-side too (lib/auth/role-guards.ts).
                        disabled={isLocked}
                      />
                      <Label
                        htmlFor={id}
                        className={isLocked ? 'text-muted-foreground' : undefined}
                      >
                        {PERMISSION_LABELS[permission]}
                      </Label>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>

        {state.status === 'error' && state.message ? (
          <p
            role="alert"
            className="mt-lg rounded-md bg-negative-tint p-md text-body-sm text-negative-deep"
          >
            {state.message}
          </p>
        ) : null}

        {state.status === 'done' ? (
          <p className="mt-lg text-body-sm text-positive-deep">
            Saved. Everyone holding this role has the new permissions from their next action.
          </p>
        ) : null}
      </form>
    </Card>
  )
}
