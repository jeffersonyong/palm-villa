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
 * **Underlined at rest, not only on hover.** It shipped hover-only for half a
 * day and the note said so; then somebody read it on a real screen and asked
 * why the action looked like a sentence. It did, because it was one. Ink text
 * with no fill, no border and no line is body copy, and a control nobody
 * recognises until they happen to point at it is not discoverable — it just
 * rewards the mouse. The underline is the affordance and it is always there.
 *
 * There is no colour to carry it instead: the operations surfaces are
 * monochrome (design.md — two accents, one system), `copy` and `foreground`
 * are the same ink, and the ladder's other step is mute, which reads as a
 * label rather than an offer. So the line does the work, the pointer gets a
 * cursor, and focus gets the standard ring.
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
        'cursor-pointer rounded-sm text-body-sm text-copy underline underline-offset-2 outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
