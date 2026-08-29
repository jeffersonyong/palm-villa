import { cn } from '@/lib/utils'

/**
 * Loading placeholder. `muted` fill at the control radius, shaped by the caller
 * to match what is arriving.
 *
 * A pulse rather than a shimmer: shimmer needs a gradient sweep, which is
 * decoration by the standard the rest of the system holds to, and it would not
 * survive the theme flip cleanly. Static under reduced motion.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  )
}

export { Skeleton }
