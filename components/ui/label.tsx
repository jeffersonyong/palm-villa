'use client'

import { Label as LabelPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * shadcn/ui Label, re-skinned to design.md.
 *
 * `body-sm-strong` (13px/500) rather than the stock `text-sm font-medium`, so
 * field labels sit in the type scale alongside status badges rather than
 * inventing a size. Foreground, not muted: a label a staff member has to read
 * to fill the form correctly is not secondary text.
 */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-sm text-body-sm-strong text-foreground select-none',
        'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
