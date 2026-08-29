'use client'

import { useActionState, useEffect, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
} from '@/components/ui/table'
import type { RoleWithPermissions, StaffAccount } from '@/lib/db/staff'

import {
  createStaffAction,
  resetStaffPasswordAction,
  setAccountStatusAction,
  setUserRolesAction,
  type RoleAdminState,
} from './actions'

/**
 * The Staff tab (capability F1): who has an account, what roles they hold,
 * and the account lifecycle — create, re-role, reset password,
 * disable/enable. Client because every row carries dialogs; the data itself
 * arrives server-fetched from page.tsx.
 *
 * Dialogs mount only while open, so each opens with a fresh action state
 * instead of replaying the previous outcome.
 */

const initialState: RoleAdminState = { status: 'idle' }

interface StaffTabProps {
  staff: readonly StaffAccount[]
  roles: readonly RoleWithPermissions[]
  currentUserId: string
}

type RowDialog = 'roles' | 'password' | 'status'

export function StaffTab({ staff, roles, currentUserId }: StaffTabProps) {
  const [isNewStaffOpen, setIsNewStaffOpen] = useState(false)
  const [activeRow, setActiveRow] = useState<{ userId: string; dialog: RowDialog } | null>(null)

  const activeAccount = activeRow
    ? (staff.find((account) => account.id === activeRow.userId) ?? null)
    : null

  return (
    <div className="grid gap-lg">
      <div className="flex justify-end">
        <Button onClick={() => setIsNewStaffOpen(true)}>New staff account</Button>
      </div>

      {staff.length === 0 ? (
        <EmptyState
          title="No staff accounts yet"
          description="Create the first account and hand over its temporary password."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableHeaderRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableHeaderRow>
          </TableHeader>
          <TableBody>
            {staff.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium text-foreground">
                  {account.displayName}
                  {account.id === currentUserId ? (
                    <span className="ml-sm text-caption text-muted-foreground">you</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-copy">{account.email}</TableCell>
                <TableCell>
                  {account.roles.length === 0 ? (
                    <span className="text-body-sm text-muted-foreground">No roles</span>
                  ) : (
                    <span className="flex flex-wrap gap-xs">
                      {account.roles.map((role) => (
                        <Badge key={role.id}>{role.name}</Badge>
                      ))}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {account.disabled ? (
                    <Badge tone="negative">Disabled</Badge>
                  ) : (
                    <Badge tone="positive">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${account.displayName}`}
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setActiveRow({ userId: account.id, dialog: 'roles' })}
                      >
                        Manage roles
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setActiveRow({ userId: account.id, dialog: 'password' })}
                      >
                        Reset password
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant={account.disabled ? 'default' : 'destructive'}
                        disabled={!account.disabled && account.id === currentUserId}
                        onSelect={() => setActiveRow({ userId: account.id, dialog: 'status' })}
                      >
                        {account.disabled ? 'Enable account' : 'Disable account'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {isNewStaffOpen ? (
        <NewStaffDialog roles={roles} onClose={() => setIsNewStaffOpen(false)} />
      ) : null}

      {activeAccount && activeRow?.dialog === 'roles' ? (
        <ManageRolesDialog
          account={activeAccount}
          roles={roles}
          onClose={() => setActiveRow(null)}
        />
      ) : null}

      {activeAccount && activeRow?.dialog === 'password' ? (
        <ResetPasswordDialog account={activeAccount} onClose={() => setActiveRow(null)} />
      ) : null}

      {activeAccount && activeRow?.dialog === 'status' ? (
        <AccountStatusDialog account={activeAccount} onClose={() => setActiveRow(null)} />
      ) : null}
    </div>
  )
}

/* ── Shared dialog pieces ──────────────────────────────────────────────── */

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null
  }

  return <p className="text-body-sm text-negative-deep">{message}</p>
}

function FormError({ state }: { state: RoleAdminState }) {
  if (state.status !== 'error' || !state.message) {
    return null
  }

  return (
    <p role="alert" className="rounded-md bg-negative-tint p-md text-body-sm text-negative-deep">
      {state.message}
    </p>
  )
}

function RoleCheckboxes({
  roles,
  defaultRoleIds,
}: {
  roles: readonly RoleWithPermissions[]
  defaultRoleIds: readonly string[]
}) {
  return (
    <fieldset className="grid gap-sm">
      <legend className="mb-sm micro-label text-muted-foreground">Roles</legend>
      {roles.map((role) => (
        <div key={role.id} className="flex items-center gap-sm">
          <Checkbox
            id={`role-${role.id}`}
            name="roleIds"
            value={role.id}
            defaultChecked={defaultRoleIds.includes(role.id)}
          />
          <Label htmlFor={`role-${role.id}`}>{role.name}</Label>
        </div>
      ))}
    </fieldset>
  )
}

/* ── New staff (F1) ────────────────────────────────────────────────────── */

function NewStaffDialog({
  roles,
  onClose,
}: {
  roles: readonly RoleWithPermissions[]
  onClose: () => void
}) {
  const [state, formAction, isPending] = useActionState(createStaffAction, initialState)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New staff account</DialogTitle>
          <DialogDescription>
            Share the temporary password out-of-band — they should change it after first sign-in.
          </DialogDescription>
        </DialogHeader>

        {state.status === 'done' ? (
          <>
            <p className="rounded-md bg-positive-tint p-md text-body-sm text-positive-deep">
              Account created. Hand over the temporary password now — it is not shown again.
            </p>
            <DialogFooter>
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form action={formAction} className="grid gap-lg">
            <div className="grid gap-sm">
              <Label htmlFor="staff-name">Name</Label>
              <Input
                id="staff-name"
                name="displayName"
                autoComplete="off"
                required
                aria-invalid={state.fieldErrors?.displayName ? true : undefined}
              />
              <FieldError message={state.fieldErrors?.displayName} />
            </div>

            <div className="grid gap-sm">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                name="email"
                type="email"
                autoComplete="off"
                required
                aria-invalid={state.fieldErrors?.email ? true : undefined}
              />
              <FieldError message={state.fieldErrors?.email} />
            </div>

            <div className="grid gap-sm">
              <Label htmlFor="staff-temp-password">Temporary password</Label>
              {/* Visible text on purpose: the admin reads it out or copies it
                  to the new staff member. */}
              <Input
                id="staff-temp-password"
                name="tempPassword"
                autoComplete="off"
                required
                minLength={6}
                aria-invalid={state.fieldErrors?.tempPassword ? true : undefined}
              />
              <FieldError message={state.fieldErrors?.tempPassword} />
            </div>

            <RoleCheckboxes roles={roles} defaultRoleIds={[]} />

            <FormError state={state} />

            <DialogFooter>
              <Button type="button" variant="tertiary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Creating…' : 'Create account'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ── Manage roles (F1) ─────────────────────────────────────────────────── */

function ManageRolesDialog({
  account,
  roles,
  onClose,
}: {
  account: StaffAccount
  roles: readonly RoleWithPermissions[]
  onClose: () => void
}) {
  const [state, formAction, isPending] = useActionState(setUserRolesAction, initialState)

  useEffect(() => {
    if (state.status === 'done') onClose()
  }, [state.status, onClose])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Roles — {account.displayName}</DialogTitle>
          <DialogDescription>
            Their permissions are everything the ticked roles allow, combined.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="userId" value={account.id} />

          <RoleCheckboxes roles={roles} defaultRoleIds={account.roles.map((role) => role.id)} />

          <FormError state={state} />

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save roles'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Reset password (F1) ───────────────────────────────────────────────── */

function ResetPasswordDialog({ account, onClose }: { account: StaffAccount; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(resetStaffPasswordAction, initialState)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Reset password — {account.displayName}</DialogTitle>
          <DialogDescription>
            Set a new temporary password and share it out-of-band. Their current password stops
            working immediately.
          </DialogDescription>
        </DialogHeader>

        {state.status === 'done' ? (
          <>
            <p className="rounded-md bg-positive-tint p-md text-body-sm text-positive-deep">
              Password reset. Hand over the new temporary password now.
            </p>
            <DialogFooter>
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form action={formAction} className="grid gap-lg">
            <input type="hidden" name="userId" value={account.id} />

            <div className="grid gap-sm">
              <Label htmlFor="reset-temp-password">Temporary password</Label>
              <Input
                id="reset-temp-password"
                name="tempPassword"
                autoComplete="off"
                required
                minLength={6}
                aria-invalid={state.fieldErrors?.tempPassword ? true : undefined}
              />
              <FieldError message={state.fieldErrors?.tempPassword} />
            </div>

            <FormError state={state} />

            <DialogFooter>
              <Button type="button" variant="tertiary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Resetting…' : 'Reset password'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ── Disable / enable (F1) ─────────────────────────────────────────────── */

function AccountStatusDialog({ account, onClose }: { account: StaffAccount; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(setAccountStatusAction, initialState)
  const disabling = !account.disabled

  useEffect(() => {
    if (state.status === 'done') onClose()
  }, [state.status, onClose])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {disabling ? 'Disable' : 'Enable'} — {account.displayName}
          </DialogTitle>
          <DialogDescription>
            {disabling
              ? 'They will not be able to sign in until the account is enabled again. Nothing is deleted — their history stays in the audit trail.'
              : 'They will be able to sign in again with their existing password.'}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="userId" value={account.id} />
          <input type="hidden" name="disabled" value={String(disabling)} />

          <FormError state={state} />

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={disabling ? 'destructive' : 'primary'}
              disabled={isPending}
            >
              {isPending
                ? disabling
                  ? 'Disabling…'
                  : 'Enabling…'
                : disabling
                  ? 'Disable account'
                  : 'Enable account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
