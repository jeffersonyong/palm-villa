'use client'

import { useActionState, useState } from 'react'

import { EmptyState } from '@/components/portal/empty-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Permission } from '@/lib/auth/permissions'
import type { RoleWithPermissions } from '@/lib/db/staff'

import { setRolePermissionsAction, type RoleAdminState } from './actions'
import { PERMISSION_GROUPS, PERMISSION_LABELS } from './permission-labels'

/**
 * The Roles tab (capability F2): each role's permission set, editable without
 * a developer. One card: the role switcher sits where a heading would — the
 * selected segment already names the role — with Save on the far right of the
 * same row. Every role's form stays mounted (`forceMount`, hidden when
 * inactive) so switching away and back keeps unsaved ticks; each role is
 * still its own form, so a save cannot half-apply across roles.
 *
 * Save is dirty-gated: it only enables once the draft differs from what the
 * server holds, so an idle click cannot fire a no-op write (and its audit
 * event). The checkboxes are controlled and the drafts live here so the
 * shared header Save — wired to the active role's form via the `form`
 * attribute — can know whether that role changed. Save stays secondary: the
 * screen's single primary fill is "New staff account" in the tab row above
 * (design.md — one primary per region).
 */

const initialState: RoleAdminState = { status: 'idle' }

function draftsFromRoles(
  roles: readonly RoleWithPermissions[],
): ReadonlyMap<string, ReadonlySet<string>> {
  return new Map(roles.map((role) => [role.id, new Set(role.permissions)]))
}

function isDraftDirty(
  draft: ReadonlySet<string> | undefined,
  saved: readonly string[],
): boolean {
  if (!draft) {
    return false
  }

  return draft.size !== saved.length || saved.some((permission) => !draft.has(permission))
}

function roleFormId(roleId: string): string {
  return `role-form-${roleId}`
}

export function RolesTab({ roles }: { roles: readonly RoleWithPermissions[] }) {
  const firstRole = roles[0]

  const [activeRoleId, setActiveRoleId] = useState(firstRole?.id ?? '')
  // One action state shared by every role's form: only one can submit at a
  // time, and `submittedRoleId` scopes the outcome message to the form that
  // produced it.
  const [state, formAction, isPending] = useActionState(setRolePermissionsAction, initialState)
  const [submittedRoleId, setSubmittedRoleId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState(() => draftsFromRoles(roles))

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

  const activeRole = roles.find((role) => role.id === activeRoleId)
  const isActiveDirty = activeRole
    ? isDraftDirty(drafts.get(activeRole.id), activeRole.permissions)
    : false

  const togglePermission = (roleId: string, permission: Permission, checked: boolean) => {
    setDrafts((previous) => {
      const draft = new Set(previous.get(roleId))

      if (checked) {
        draft.add(permission)
      } else {
        draft.delete(permission)
      }

      return new Map(previous).set(roleId, draft)
    })
  }

  return (
    <Card>
      <Tabs value={activeRoleId} onValueChange={setActiveRoleId}>
        <div className="flex flex-wrap items-center justify-between gap-lg">
          <TabsList aria-label="Role">
            {roles.map((role) => (
              <TabsTrigger key={role.id} value={role.id}>
                {role.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <Button
            type="submit"
            form={roleFormId(activeRoleId)}
            variant="secondary"
            disabled={!isActiveDirty || isPending}
          >
            {isPending && submittedRoleId === activeRoleId ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {roles.map((role) => (
          <TabsContent
            key={role.id}
            value={role.id}
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <RoleForm
              role={role}
              draft={drafts.get(role.id) ?? new Set()}
              result={submittedRoleId === role.id ? state : null}
              formAction={formAction}
              onSubmit={() => setSubmittedRoleId(role.id)}
              onToggle={togglePermission}
            />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  )
}

interface RoleFormProps {
  role: RoleWithPermissions
  draft: ReadonlySet<string>
  /** The shared action state, or null when another role submitted last. */
  result: RoleAdminState | null
  formAction: (formData: FormData) => void
  onSubmit: () => void
  onToggle: (roleId: string, permission: Permission, checked: boolean) => void
}

function RoleForm({ role, draft, result, formAction, onSubmit, onToggle }: RoleFormProps) {
  const isAdminRole = role.slug === 'admin'

  return (
    <form id={roleFormId(role.id)} action={formAction} onSubmit={onSubmit}>
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
                      checked={isLocked || draft.has(permission)}
                      onCheckedChange={(checked) =>
                        onToggle(role.id, permission, checked === true)
                      }
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

      {result?.status === 'error' && result.message ? (
        <p
          role="alert"
          className="mt-lg rounded-md bg-negative-tint px-md py-sm text-body-sm text-negative-deep"
        >
          {result.message}
        </p>
      ) : null}

      {result?.status === 'done' ? (
        <p className="mt-lg text-body-sm text-positive-deep">
          Saved. Everyone holding this role has the new permissions from their next action.
        </p>
      ) : null}
    </form>
  )
}
