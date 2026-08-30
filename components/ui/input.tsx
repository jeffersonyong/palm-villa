import { cn } from '@/lib/utils'

/**
 * shadcn/ui Input, re-skinned to design.md v1.0:
 * - white, neutral hairline, 6px radius, `body-md` (§Components)
 * - focus strengthens the border to ink with a faint ink halo — the reference
 *   treatment, not a coloured glow
 * - `h-control` height matching Button (36px standard, 32px on the
 *   operations portal); the `touch` size carries the field surface's ≥48px
 *   target and one step more padding
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
        'w-full min-w-0 rounded-md border border-border bg-card text-body-md text-foreground transition-[border-color,box-shadow] outline-none',
        'placeholder:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/10',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // py-xs, not py-sm: the height is fixed by h-control, so vertical pad
        // only constrains the content box — at the operations surfaces' 32px
        // control an 8px pad would squeeze it below body-md's 21px line
        // height and clip descenders.
        inputSize === 'touch' ? 'min-h-touch px-lg py-md' : 'h-control px-md py-xs',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
