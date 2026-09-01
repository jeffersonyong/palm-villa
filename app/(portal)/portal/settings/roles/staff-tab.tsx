'use client'

import { useActionState, useEffect, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/components/ui/avatar-identity'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
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
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pagination } from '@/components/ui/pagination'
import { clampPage, pageCountFor } from '@/components/ui/pagination-range'
import { toast } from '@/components/ui/toast-store'
import { generateTempPassword } from '@/lib/auth/temp-password'
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
  deleteStaffAction,
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
 * The "New staff account" button and its open state live in the tab row
 * (roles-staff-tabs.tsx) so the action shares a line with the Staff/Roles
 * switcher; `NewStaffDialog` is exported for it. Row dialogs stay here.
 *
 * Dialogs mount only while open, so each opens with a fresh action state
 * instead of replaying the previous outcome.
 */

const initialState: RoleAdminState = { status: 'idle' }

/** Ten rows keeps the table inside one screen on a front-desk laptop. */
const DEFAULT_PAGE_SIZE = 10

interface StaffTabProps {
  staff: readonly StaffAccount[]
  roles: readonly RoleWithPermissions[]
  currentUserId: string
}

type RowDialog = 'roles' | 'password' | 'status' | 'delete'

export function StaffTab({ staff, roles, currentUserId }: StaffTabProps) {
  const [activeRow, setActiveRow] = useState<{ userId: string; dialog: RowDialog } | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const activeAccount = activeRow
    ? (staff.find((account) => account.id === activeRow.userId) ?? null)
    : null

  // Clamped on render rather than corrected after the fact: deleting the last
  // account on the last page shrinks the table underneath the held page.
  const currentPage = clampPage(page, pageCountFor(staff.length, pageSize))
  const visibleStaff = staff.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="grid gap-lg">
      {staff.length === 0 ? (
        <EmptyState
          title="No staff accounts yet"
          description="Create the first account and hand over its temporary password."
        />
      ) : (
        <Table
          footer={
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              total={staff.length}
              itemLabel="accounts"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          }
        >
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
            {visibleStaff.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium text-foreground">
                  {/* Identity colour is what makes a name you already know
                      findable in the list before you have read it — here, on
                      the cash log's collected-by column, and on a booking's
                      history. 24px, the denser of the two avatar sizes,
                      because a table row is 32px and a 32px face would set the
                      row's height. */}
                  <span className="flex items-center gap-sm">
                    <Avatar className="size-6">
                      <AvatarFallback seed={account.id}>
                        {initials(account.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 truncate">
                      {account.displayName}
                      {account.id === currentUserId ? (
                        <span className="ml-sm text-caption text-muted-foreground">you</span>
                      ) : null}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{account.email}</TableCell>
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
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={account.id === currentUserId}
                        onSelect={() => setActiveRow({ userId: account.id, dialog: 'delete' })}
                      >
                        Delete account
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

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

      {activeAccount && activeRow?.dialog === 'delete' ? (
        <DeleteAccountDialog account={activeAccount} onClose={() => setActiveRow(null)} />
      ) : null}
    </div>
  )
}

/* ── Shared dialog pieces ──────────────────────────────────────────────── */

function FormError({ state }: { state: RoleAdminState }) {
  if (state.status !== 'error' || !state.message) {
    return null
  }

  return <Callout role="alert">{state.message}</Callout>
}

/**
 * The temporary-password input with its Generate control. Controlled, so the
 * dialog still holds the value after a successful submit and can offer it
 * for copying in the handover panel.
 */
function TempPasswordField({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <div className="grid gap-sm">
      <div className="flex items-baseline justify-between gap-lg">
        <Label htmlFor={id}>Temporary password</Label>
        <button
          type="button"
          onClick={() => onChange(generateTempPassword())}
          className="rounded-sm text-body-sm text-copy underline underline-offset-2 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Generate
        </button>
      </div>
      {/* Visible text on purpose: the admin reads it out or copies it to the
          new staff member. */}
      <Input
        id={id}
        name="tempPassword"
        placeholder="Generate one, or type your own"
        autoComplete="off"
        required
        minLength={6}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className="font-mono"
      />
      <FieldError message={error} />
    </div>
  )
}

/**
 * The success panel after a create or reset: the password, visible one last
 * time, with a copy control so it can go straight into WhatsApp.
 */
function PasswordHandover({ note, password }: { note: string; password: string }) {
  const [isCopied, setIsCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setIsCopied(true)
    } catch {
      // Clipboard refused (unusual browser context) — the password is visible
      // and selectable right above the button, so nothing is lost.
    }
  }

  return (
    <div className="grid gap-md">
      <Callout tone="positive">{note}</Callout>
      <div className="flex items-center justify-between gap-lg rounded-md border border-border px-md py-sm">
        <code className="font-mono text-body-md text-foreground select-all">{password}</code>
        <Button type="button" variant="secondary" onClick={copy}>
          {isCopied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

/** A copy of `previous` with `id` added or removed — never a mutation. */
function toggleId(
  previous: ReadonlySet<string>,
  id: string,
  checked: boolean,
): ReadonlySet<string> {
  const next = new Set(previous)

  if (checked) {
    next.add(id)
  } else {
    next.delete(id)
  }

  return next
}

function RoleCheckboxes({
  roles,
  selectedRoleIds,
  onToggle,
}: {
  roles: readonly RoleWithPermissions[]
  selectedRoleIds: ReadonlySet<string>
  onToggle: (roleId: string, checked: boolean) => void
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
            checked={selectedRoleIds.has(role.id)}
            onCheckedChange={(checked) => onToggle(role.id, checked === true)}
          />
          <Label htmlFor={`role-${role.id}`}>{role.name}</Label>
        </div>
      ))}
    </fieldset>
  )
}

/* ── New staff (F1) ────────────────────────────────────────────────────── */

export function NewStaffDialog({
  roles,
  onClose,
}: {
  roles: readonly RoleWithPermissions[]
  onClose: () => void
}) {
  const [state, formAction, isPending] = useActionState(createStaffAction, initialState)
  const [selectedRoleIds, setSelectedRoleIds] = useState<ReadonlySet<string>>(new Set())
  const [tempPassword, setTempPassword] = useState('')

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
            <PasswordHandover
              note="Account created. Send them the temporary password now — it is not shown again after this."
              password={tempPassword}
            />
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
                placeholder="Jane Doe"
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
                placeholder="jane@palmvilla.bn"
                autoComplete="off"
                required
                aria-invalid={state.fieldErrors?.email ? true : undefined}
              />
              <FieldError message={state.fieldErrors?.email} />
            </div>

            <TempPasswordField
              id="staff-temp-password"
              value={tempPassword}
              onChange={setTempPassword}
              error={state.fieldErrors?.tempPassword}
            />

            <RoleCheckboxes
              roles={roles}
              selectedRoleIds={selectedRoleIds}
              onToggle={(roleId, checked) =>
                setSelectedRoleIds((previous) => toggleId(previous, roleId, checked))
              }
            />

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
  const [selectedRoleIds, setSelectedRoleIds] = useState<ReadonlySet<string>>(
    () => new Set(account.roles.map((role) => role.id)),
  )

  // Save is dirty-gated: a no-op click should not fire a write and its audit
  // event. Same convention as the Roles tab's Save.
  const isDirty =
    selectedRoleIds.size !== account.roles.length ||
    account.roles.some((role) => !selectedRoleIds.has(role.id))

  useEffect(() => {
    if (state.status === 'done') {
      toast({ tone: 'positive', title: 'Roles updated', description: account.displayName })
      onClose()
    }
  }, [state.status, onClose, account.displayName])

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

          <RoleCheckboxes
            roles={roles}
            selectedRoleIds={selectedRoleIds}
            onToggle={(roleId, checked) =>
              setSelectedRoleIds((previous) => toggleId(previous, roleId, checked))
            }
          />

          <FormError state={state} />

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isDirty || isPending}>
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
  const [tempPassword, setTempPassword] = useState('')

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
            <PasswordHandover
              note="Password reset. Send them the new temporary password now."
              password={tempPassword}
            />
            <DialogFooter>
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form action={formAction} className="grid gap-lg">
            <input type="hidden" name="userId" value={account.id} />

            <TempPasswordField
              id="reset-temp-password"
              value={tempPassword}
              onChange={setTempPassword}
              error={state.fieldErrors?.tempPassword}
            />

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
    if (state.status === 'done') {
      toast({
        tone: 'positive',
        title: disabling ? 'Account disabled' : 'Account enabled',
        description: account.displayName,
      })
      onClose()
    }
  }, [state.status, onClose, disabling, account.displayName])

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

/* ── Delete an unused account (F1) ─────────────────────────────────────── */

function DeleteAccountDialog({ account, onClose }: { account: StaffAccount; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(deleteStaffAction, initialState)

  useEffect(() => {
    if (state.status === 'done') {
      toast({ tone: 'positive', title: 'Account deleted', description: account.email })
      onClose()
    }
  }, [state.status, onClose, account.email])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Delete — {account.displayName}</DialogTitle>
          <DialogDescription>
            Only an account that has never acted can be deleted — one with history must be disabled
            instead, so the audit trail stays whole. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-lg">
          <input type="hidden" name="userId" value={account.id} />

          <FormError state={state} />

          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? 'Deleting…' : 'Delete account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
