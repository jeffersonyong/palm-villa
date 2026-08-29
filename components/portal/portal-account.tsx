import { Avatar, AvatarFallback } from '@/components/ui/avatar'

/**
 * Who is signed in — a placeholder until the auth slice lands
 * (architecture.md §3).
 *
 * Deliberately static rather than a menu trigger: there is no session to show
 * and nothing to sign out of, and a control that opens an empty menu is worse
 * than one that plainly says the feature is not here yet. It becomes the
 * dropdown-menu trigger when auth arrives.
 */
export function PortalAccount() {
  return (
    <div className="flex items-center gap-sm px-md pb-md">
      <Avatar>
        <AvatarFallback>PV</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-body-sm text-foreground">Staff</p>
        <p className="truncate text-caption text-muted-foreground">Sign-in with auth slice</p>
      </div>
    </div>
  )
}
