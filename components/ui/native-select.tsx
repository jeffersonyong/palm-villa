import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A styled native `<select>`.
 *
 * Native rather than the Radix popover select: both booking selects live in
 * plain HTML forms (one submits via GET), and the OS picker is fine on a staff
 * desktop. `appearance-none` plus a drawn chevron is the one intervention —
 * the default arrow is the piece that varies per browser and reads unstyled.
 * Treatment matches Input: white, neutral hairline, 8px, `body-md`
 * (design.md §Components).
 *
 * `className` sizes the wrapper; everything else lands on the `<select>`.
 */
function NativeSelect({
  className,
  ...props
}: React.ComponentProps<'select'> & { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <select
        data-slot="native-select"
        className="h-control w-full cursor-pointer appearance-none rounded-md border border-border bg-card pr-2xl pl-lg text-body-md text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-md size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { NativeSelect }
