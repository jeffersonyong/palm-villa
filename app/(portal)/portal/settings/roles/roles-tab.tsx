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
 * a developer. One card: the role switcher sits where a heading would — the
 * selected segment already names the role — over a single permission list.
 * Every role's form stays mounted (`forceMount`, hidden when inactive) so
 * switching away and back keeps unsaved ticks and a save's outcome message;
 * each role is still its own form, so a save cannot half-apply across roles.
 *
 * Saves are secondary buttons and live at the form's foot, inside the form
 * they submit — a shared header button could not carry per-role pending
 * state. The screen's single primary fill is "New staff account" in the tab
 * row above (design.md — one primary per region).
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
    <Card>
      <Tabs defaultValue={firstRole.id}>
        <TabsList aria-label="Role">
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
            <RoleForm role={role} />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  )
}

function RoleForm({ role }: { role: RoleWithPermissions }) {
  const [state, formAction, isPending] = useActionState(setRolePermissionsAction, initialState)
  const isAdminRole = role.slug === 'admin'

  return (
    <form action={formAction}>
      <input type="hidden" name="roleId" value={role.id} />

      {/* The visible role name lives on the segment chip; screen-reader users
          browsing by heading still get it inside the panel. */}
      <h2 className="sr-only">What {role.name} staff can do</h2>

      <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="mt-lg flex flex-wrap items-center gap-lg">
        {state.status === 'error' && state.message ? (
          <p
            role="alert"
            className="rounded-md bg-negative-tint px-md py-sm text-body-sm text-negative-deep"
          >
            {state.message}
          </p>
        ) : null}

        {state.status === 'done' ? (
          <p className="text-body-sm text-positive-deep">
            Saved. Everyone holding this role has the new permissions from their next action.
          </p>
        ) : null}

        <Button
          type="submit"
          variant="secondary"
          disabled={isPending}
          className="ml-auto"
        >
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
