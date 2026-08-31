'use client'

import { Fragment, useState, useTransition } from 'react'
import { Lock } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
  TableRowHead,
} from '@/components/ui/table'
import { toast } from '@/components/ui/toast-store'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Permission } from '@/lib/auth/permissions'
import type { RoleWithPermissions, StaffAccount } from '@/lib/db/staff'

import { setRolePermissionsAction, type RoleAdminState } from './actions'
import { PERMISSION_GROUPS, PERMISSION_LABELS } from './permission-labels'

/**
 * The Roles tab (capability F2): what each role may do, editable without a
 * developer.
 *
 * **A matrix, because the question is comparative.** Permissions are rows and
 * roles are columns, on the portal's signature table. The screen exists to
 * answer "who can verify a payment?" and "does Housekeeping see identity
 * documents?" — questions a one-role-at-a-time switcher could only answer by
 * being visited five times and remembered. Sixteen permissions across five
 * roles is eighty cells of fixed, comparable data; it fits on one screen, so it
 * belongs on one screen. The switcher this replaces also stacked a second
 * segmented control directly under the page's own, where the second one was
 * really a column header in disguise.
 *
 * **Every draft is visible, which is the point.** The previous shape kept a
 * draft per role but showed one at a time, so edits to a hidden role could be
 * lost with no warning — ticked, switched away from, and gone on the next
 * navigation. Here nothing is hidden: the status line names every changed role
 * and Save writes all of them.
 *
 * **Each role is still its own write.** Save loops the dirty roles and calls
 * `setRolePermissionsAction` once per role, so each lands as one transaction
 * with its own audit event (migration 001100) exactly as before — a matrix
 * that saved all five in one call would be the thing that could half-apply.
 * The trade is that a failure part-way leaves the earlier roles saved; that is
 * reported rather than swallowed, and the roles that failed stay dirty.
 *
 * Save is dirty-gated: it only enables once a draft differs from what the
 * server holds, so an idle click cannot fire a no-op write and its audit
 * event. It stays secondary — the screen's single primary fill is "New staff
 * account" in the tab row above (design.md — one primary per region).
 */

const PERMISSION_COUNT = PERMISSION_GROUPS.reduce(
  (total, group) => total + group.permissions.length,
  0,
)

/** Only ever a no-op write away from the guard in lib/auth/role-guards.ts. */
function isLockedCell(role: RoleWithPermissions, permission: Permission): boolean {
  return role.slug === 'admin' && permission === 'config.manage'
}

function draftsFromRoles(
  roles: readonly RoleWithPermissions[],
): ReadonlyMap<string, ReadonlySet<string>> {
  return new Map(roles.map((role) => [role.id, new Set(role.permissions)]))
}

function isDraftDirty(draft: ReadonlySet<string> | undefined, saved: readonly string[]): boolean {
  if (!draft) {
    return false
  }

  return draft.size !== saved.length || saved.some((permission) => !draft.has(permission))
}

/** "Front Office", "Front Office and Finance", "Front Office, Finance and Admin". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? ''
  }

  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

interface RolesTabProps {
  roles: readonly RoleWithPermissions[]
  /** For the head count under each role — how many people this edit reaches. */
  staff: readonly StaffAccount[]
}

export function RolesTab({ roles, staff }: RolesTabProps) {
  const [drafts, setDrafts] = useState(() => draftsFromRoles(roles))
  const [failures, setFailures] = useState<readonly string[]>([])
  const [isSaving, startSaving] = useTransition()

  if (roles.length === 0) {
    // Roles are seeded with the property, so this is a data problem, not a
    // fresh-install state.
    return (
      <EmptyState
        title="No roles found"
        description="Roles are created with the property. If this persists, something is wrong with the property setup."
      />
    )
  }

  const dirtyRoles = roles.filter((role) => isDraftDirty(drafts.get(role.id), role.permissions))

  const headCountByRoleId = new Map(
    roles.map((role) => [
      role.id,
      staff.filter((account) => account.roles.some((held) => held.id === role.id)).length,
    ]),
  )

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

  const save = () => {
    // Snapshot the targets: `dirtyRoles` is derived from props that the
    // revalidation below will change underneath the loop.
    const targets = dirtyRoles.map((role) => ({
      id: role.id,
      name: role.name,
      permissions: [...(drafts.get(role.id) ?? [])],
    }))

    startSaving(async () => {
      const saved: string[] = []
      const refused: string[] = []

      for (const target of targets) {
        const formData = new FormData()

        formData.set('roleId', target.id)
        for (const permission of target.permissions) {
          formData.append('permissions', permission)
        }

        const idle: RoleAdminState = { status: 'idle' }
        const result = await setRolePermissionsAction(idle, formData)

        if (result.status === 'done') {
          saved.push(target.name)
        } else {
          refused.push(`${target.name}: ${result.message ?? 'Could not save this role.'}`)
        }
      }

      setFailures(refused)

      if (saved.length > 0) {
        toast({
          tone: 'positive',
          title: saved.length === 1 ? 'Permissions saved' : `${saved.length} roles saved`,
          description: `Everyone holding ${listNames(saved)} has them from their next action.`,
        })
      }
    })
  }

  return (
    <TooltipProvider>
      {/* One width for the whole cluster, declared once here and inherited by
          every block inside it: the status line, Save, the failure callout and
          the table all share the matrix's right edge. Save was previously in a
          full-width `justify-between` row, which pinned it to the *panel's*
          edge while the table stopped short of it — two different rulers, and
          the button read as floating loose of the thing it acts on. 962 is the
          declared columns (280 + 5 × 136) plus the container's two hairlines,
          since a bordered box is measured border-box. */}
      <div className="w-[962px] max-w-full">
        <div className="flex flex-wrap items-center justify-between gap-lg pb-lg">
          <p className="text-body-sm text-muted-foreground">
            {dirtyRoles.length === 0
              ? `${PERMISSION_COUNT} permissions across ${roles.length} roles.`
              : `Unsaved changes to ${listNames(dirtyRoles.map((role) => role.name))}.`}
          </p>

          <Button variant="secondary" onClick={save} disabled={dirtyRoles.length === 0 || isSaving}>
            {isSaving
              ? 'Saving…'
              : dirtyRoles.length > 1
                ? `Save ${dirtyRoles.length} roles`
                : 'Save'}
          </Button>
        </div>

        {failures.length > 0 ? (
          <Callout role="alert" className="mb-lg">
            <span>
              {failures.map((failure) => (
                <span key={failure} className="block">
                  {failure}
                </span>
              ))}
            </span>
          </Callout>
        ) : null}

        {/* The matrix is a dense object, not a full-bleed list. Auto layout hands
            the slack to the widest column — the permission names took ~550px of a
            1500px panel and left every tick a hand's width from the label it
            belongs to — so the columns are declared and the layout is fixed at
            280 + 5 × 136 = 960, inside the cluster width above. `max-w-full`
            there is what makes the columns scroll when the panel really is too
            narrow, and the identifying column pins while they do. */}
        <Table scrollX className="w-[960px] table-fixed" containerClassName="w-full">
          <TableHeader>
            <TableHeaderRow>
              <TableHead className="sticky left-0 z-10 w-[280px] bg-muted">Permission</TableHead>
              {roles.map((role) => (
                <TableHead
                  key={role.id}
                  className="w-[136px] px-sm text-center align-bottom whitespace-nowrap"
                >
                  <span className="block text-foreground">{role.name}</span>
                  <span className="mt-xxs block text-caption font-normal tracking-normal whitespace-nowrap normal-case tabular-nums">
                    {headCountByRoleId.get(role.id) === 1
                      ? '1 person'
                      : `${headCountByRoleId.get(role.id) ?? 0} people`}
                  </span>
                </TableHead>
              ))}
            </TableHeaderRow>
          </TableHeader>

          <TableBody>
            {PERMISSION_GROUPS.map((group) => (
              <Fragment key={group.label}>
                {/* The group's name in the labelling voice, on white with the
                    divider above it — FormSection's grammar, not a second gray
                    strip (design.md — no band alternation). `border-b-0` because
                    `divide-y` rules each row along its *bottom*: left alone, the
                    label would carry a rule under it as well as the one above and
                    read as a boxed heading rather than a heading. */}
                <TableRow className="border-b-0 hover:bg-transparent">
                  <TableRowHead
                    scope="rowgroup"
                    className="sticky left-0 z-10 bg-card pt-lg pb-xs micro-label text-muted-foreground"
                  >
                    {group.label}
                  </TableRowHead>
                  <TableCell colSpan={roles.length} className="pt-lg pb-xs" />
                </TableRow>

                {group.permissions.map((permission) => (
                  <TableRow key={permission} className="group">
                    <TableRowHead className="sticky left-0 z-10 bg-card group-hover:bg-muted/60">
                      {PERMISSION_LABELS[permission]}
                    </TableRowHead>

                    {roles.map((role) => {
                      const isLocked = isLockedCell(role, permission)

                      return (
                        <TableCell key={role.id} className="px-md text-center">
                          {isLocked ? (
                            <Tooltip>
                              <TooltipTrigger
                                // Focusable so the reason is reachable from the
                                // keyboard, but not a control — there is nothing
                                // to toggle.
                                className="inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                                aria-label={`${PERMISSION_LABELS[permission]} — ${role.name}, always granted`}
                              >
                                <Lock className="size-4 text-muted-foreground" aria-hidden />
                              </TooltipTrigger>
                              <TooltipContent>
                                Admin always keeps this — without it, nobody could undo a change
                                here.
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Checkbox
                              checked={drafts.get(role.id)?.has(permission) ?? false}
                              onCheckedChange={(checked) =>
                                togglePermission(role.id, permission, checked === true)
                              }
                              aria-label={`${PERMISSION_LABELS[permission]} — ${role.name}`}
                            />
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}
