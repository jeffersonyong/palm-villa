import { cn } from '@/lib/utils'

/**
 * shadcn/ui Input, re-skinned to design.md:
 * - "White, neutral hairline, {rounded.md} 8px, body-md" (§Components)
 * - elevation level 1 is a hairline, never a shadow (§Elevation) — the stock
 *   `shadow-xs` is dropped
 * - 40px control height, matching Button; the `touch` size carries the field
 *   surface's ≥48px target and one step more padding
 */
function Input({
  className,
  type,
  inputSize = 'default',
  ...props
}: React.ComponentProps<'input'> & { inputSize?: 'default' | 'touch' }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'w-full min-w-0 rounded-md border border-border bg-card text-body-md text-foreground transition-colors outline-none',
        'placeholder:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        inputSize === 'touch' ? 'min-h-touch px-lg py-md' : 'h-control px-lg py-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
