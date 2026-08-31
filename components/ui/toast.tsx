'use client'

import { useSyncExternalStore } from 'react'
import { CheckCircle2, CircleAlert, XIcon } from 'lucide-react'
import { Toast as ToastPrimitive } from 'radix-ui'

import {
  dismissToast,
  getToastsServerSnapshot,
  getToastsSnapshot,
  subscribeToToasts,
  type ToastItem,
} from '@/components/ui/toast-store'
import { cn } from '@/lib/utils'

/**
 * Radix Toast, themed to design.md §Elevation level 3 — the confirmation
 * voice for actions whose outcome is not otherwise visible on screen.
 *
 * A toast is an overlay and wears the overlay shell: 16px, hairline, `xl`
 * padding, `shadow-overlay` on the white card.
 * Status is carried the sanctioned way — a small icon in the semantic mid
 * hue (design.md: saturated mid hues are for icons and the destructive
 * button only); the surface itself stays white, never a coloured band.
 *
 * Errors persist longer than confirmations: a success is glanced at, a
 * failure is read.
 */

const SUCCESS_DURATION_MS = 5_000
const ERROR_DURATION_MS = 8_000

/**
 * Renders the queue from components/ui/toast-store.ts. Mounted once, in the
 * root layout, so every surface — portal, field, auth, public — can call
 * `toast(...)` without wiring.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToastsSnapshot, getToastsServerSnapshot)

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((item) => (
        <ToastNotice key={item.id} item={item} />
      ))}

      {/* Above dialogs (z-50): a confirmation must survive the overlay it
          was triggered from. Bottom-right on desktop, full width on phones. */}
      <ToastPrimitive.Viewport className="fixed right-0 bottom-0 z-[60] flex w-full max-w-[380px] flex-col gap-sm p-lg outline-none" />
    </ToastPrimitive.Provider>
  )
}

function ToastNotice({ item }: { item: ToastItem }) {
  const isError = item.tone === 'negative'
  const Icon = isError ? CircleAlert : CheckCircle2

  return (
    <ToastPrimitive.Root
      duration={isError ? ERROR_DURATION_MS : SUCCESS_DURATION_MS}
      onOpenChange={(open) => {
        if (!open) dismissToast(item.id)
      }}
      className={cn(
        'flex items-start gap-sm rounded-xl border border-border bg-card p-xl shadow-overlay',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none',
        'data-[swipe=cancel]:translate-x-0',
        'data-[swipe=end]:animate-out data-[swipe=end]:fade-out-0 data-[swipe=end]:slide-out-to-right-4',
        'motion-reduce:animate-none',
      )}
    >
      <Icon
        aria-hidden
        className={cn('mt-xxs size-4 shrink-0', isError ? 'text-negative' : 'text-positive')}
      />

      <div className="min-w-0 flex-1">
        <ToastPrimitive.Title className="text-body-sm-strong text-foreground">
          {item.title}
        </ToastPrimitive.Title>
        {item.description ? (
          <ToastPrimitive.Description className="mt-xxs text-body-sm text-muted-foreground">
            {item.description}
          </ToastPrimitive.Description>
        ) : null}
      </div>

      <ToastPrimitive.Close
        aria-label="Dismiss"
        className="-mt-xs -mr-xs inline-flex size-control-sm shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        <XIcon className="size-3.5" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}
