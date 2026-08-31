'use client'

import { useActionState, useEffect } from 'react'

import { changeOwnPasswordAction, type ChangePasswordState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast-store'

/**
 * Change your own password, from the account menu. Exists because
 * provisioning hands out a temporary password (architecture.md §3) — this is
 * how it stops being temporary.
 */

const initialState: ChangePasswordState = { status: 'idle' }

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const [state, formAction, isPending] = useActionState(changeOwnPasswordAction, initialState)

  // Keyed on the state object, not its status: this dialog stays mounted in
  // the account chrome, so a second change in the same session produces a new
  // 'updated' object and must toast and close again.
  useEffect(() => {
    if (state.status === 'updated') {
      toast({
        tone: 'positive',
        title: 'Password updated',
        description: 'Use the new one on your next sign-in.',
      })
      onOpenChange(false)
    }
  }, [state, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            You stay signed in on this device; other devices will need the new password.
          </DialogDescription>
        </DialogHeader>

        {state.status !== 'updated' ? (
          <form action={formAction} className="grid gap-lg">
            <div className="grid gap-sm">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                aria-invalid={state.fieldErrors?.password ? true : undefined}
              />
              <FieldError message={state.fieldErrors?.password} />
            </div>

            <div className="grid gap-sm">
              <Label htmlFor="confirm-password">Repeat it</Label>
              <Input
                id="confirm-password"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                aria-invalid={state.fieldErrors?.confirm ? true : undefined}
              />
              <FieldError message={state.fieldErrors?.confirm} />
            </div>

            {state.status === 'error' ? <FieldError message={state.message} /> : null}

            <DialogFooter>
              <Button type="button" variant="tertiary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : 'Save password'}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
