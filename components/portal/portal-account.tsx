'use client'

import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'

import { signOutAction } from '@/app/(auth)/actions'
import { ChangePasswordDialog } from '@/components/portal/change-password-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/components/ui/avatar-identity'
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
  /** The account id — the avatar's seed, so this chip and the staff table
      agree on the signed-in user's colour. */
  id: string
  name: string
  email: string
}

export function PortalAccount({ user }: { user: PortalAccountUser }) {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-sm rounded-md px-sm py-sm text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:bg-muted">
          <Avatar>
            <AvatarFallback seed={user.id}>{initials(user.name)}</AvatarFallback>
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
