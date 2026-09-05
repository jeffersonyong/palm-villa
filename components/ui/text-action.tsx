import { cn } from '@/lib/utils'

/**
 * An action worded as a sentence rather than built as a button.
 *
 * The "Forgot password" register: text in the copy tone, underlining and
 * lifting to ink on hover. It exists for the case where a control is a real
 * action but the screen already has as many bordered rectangles as it can
 * carry — a section title line, a form field's label row — and one more would
 * read as chrome rather than as an offer.
 *
 * **Not a `Button` variant.** The button's base class owns a height
 * (`h-control`) and a padded box, and a link that has to unset both is a
 * variant fighting its own component. It is also a different thing: a button
 * is an object on the surface, and this is a word in the text.
 *
 * **Underlined at rest, and the underline is what changes on hover.** It
 * shipped hover-only first, which was wrong: ink text with no fill, no border
 * and no line is body copy, and a control nobody recognises until they happen
 * to point at it is not discoverable — it just rewards the mouse.
 *
 * **The hover state is the line's tone, not its thickness.** Mute at rest,
 * ink under the pointer. Thickening it was the first attempt and it reads as
 * a jitter rather than a response — the word appears to move. Tone is the step
 * the rest of the system already makes, and it lands where the ladder says it
 * should: the label register at rest, the content register when addressed.
 *
 * That the *text* stays ink throughout is the point of putting the step on
 * the line. `copy` and `foreground` are the same ink and the ladder's other
 * step is mute, so muting the label itself would make the action read as
 * something naming content rather than offering it. The underline carries the
 * state instead, and the word keeps its weight.
 *
 * No hue does any of this: the operations surfaces are monochrome (design.md
 * — two accents, one system), so the whole affordance is one tonal step on a
 * 1px line, plus a pointer cursor and the standard focus ring.
 *
 * Monochrome, like everything else on the operations surfaces: no teal here,
 * ever (design.md — two accents, one system).
 */
export function TextAction({ className, type, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      data-slot="text-action"
      type={type ?? 'button'}
      className={cn(
        'cursor-pointer rounded-sm text-body-sm text-copy underline decoration-muted-foreground underline-offset-2 transition-colors outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
