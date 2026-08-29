'use client'

import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'

import { signOutAction } from '@/app/(auth)/actions'
import { ChangePasswordDialog } from '@/components/portal/change-password-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Who is signed in — the account menu at the foot of the sidebar (and in the
 * mobile drawer). The trigger is the identity row itself; the menu holds what
 * belongs to the person rather than any screen: changing your password and
 * leaving.
 */

export interface PortalAccountUser {
  name: string
  email: string
}

export function PortalAccount({ user }: { user: PortalAccountUser }) {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-sm rounded-md px-md py-sm text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:bg-muted">
          <Avatar>
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-body-sm text-foreground">{user.name}</p>
            <p className="truncate text-caption text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" className="w-[200px]">
          <DropdownMenuLabel>Signed in</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setIsPasswordDialogOpen(true)}>
            <KeyRound aria-hidden />
            Change password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              void signOutAction()
            }}
          >
            <LogOut aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangePasswordDialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen} />
    </>
  )
}

/** "Nur Amalina" → "NA"; a lone name keeps its first two letters. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  const last = parts[parts.length - 1]

  if (!first) {
    return 'PV'
  }

  if (parts.length === 1 || !last) {
    return first.slice(0, 2).toUpperCase()
  }

  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}
