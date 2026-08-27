import { cn } from '@/lib/utils'

/**
 * shadcn/ui Input, re-skinned to design.md v1.0:
 * - white, neutral hairline, 6px radius, `body-md` (§Components)
 * - focus strengthens the border to ink with a faint ink halo — the reference
 *   treatment, not a coloured glow
 * - 36px control height, matching Button; the `touch` size carries the field
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
        'w-full min-w-0 rounded-md border border-border bg-card text-body-md text-foreground transition-[border-color,box-shadow] outline-none',
        'placeholder:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/10',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        inputSize === 'touch' ? 'min-h-touch px-lg py-md' : 'h-control px-md py-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
