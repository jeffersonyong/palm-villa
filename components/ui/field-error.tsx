import { cn } from '@/lib/utils'

/**
 * The error line under a field, or under a form (design.md §Components —
 * Error lines).
 *
 * One component because there were five local copies and three colour
 * tokens. `negative-text` is the role built for exactly this — text standing
 * on the page ground with no chip behind it — and it is the only one of the
 * three that clears AA in both themes: `destructive` is a *fill* colour (3.8:1
 * as text on the dark ground) and `negative-deep` is a raw palette token that
 * does not survive the theme flip at all.
 *
 * `body-sm`, not `caption`: an error is content the reader has to act on, not
 * metadata about the field. The hint line beside it stays `caption` mute, so
 * the two never read as the same voice.
 *
 * `role="alert"` is deliberate and is what design.md reserves the role for —
 * the message beside the field that failed is the one thing on the screen
 * that should interrupt a screen reader. Renders nothing without a message, so
 * a call site can pass `state.fieldErrors?.x` straight through.
 */
export function FieldError({
  message,
  id,
  className,
}: {
  message?: string | null
  /** For `aria-describedby` on the control it explains. */
  id?: string
  className?: string
}) {
  if (!message) {
    return null
  }

  return (
    <p id={id} role="alert" className={cn('text-body-sm text-negative-text', className)}>
      {message}
    </p>
  )
}
