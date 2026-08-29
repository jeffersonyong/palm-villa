import { cn } from '@/lib/utils'

/**
 * The Input treatment at multiple lines — same hairline, radius, type and focus
 * construction, so a form reads as one control family (design.md §Components).
 * `field-sizing-content` lets it grow with what is typed rather than sitting at
 * a fixed height a staff member has to scroll inside.
 */
function Textarea({
  className,
  inputSize = 'default',
  ...props
}: React.ComponentProps<'textarea'> & { inputSize?: 'default' | 'touch' }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content w-full min-w-0 rounded-md border border-border bg-card text-body-md text-foreground transition-[border-color,box-shadow] outline-none',
        'placeholder:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/10',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        inputSize === 'touch' ? 'min-h-[96px] px-lg py-md' : 'min-h-[80px] px-md py-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
