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
 * **The underline is the whole hover state, and it appears only on hover.**
 * On a quiet surface a permanent underline is a drawn line, and design.md
 * spends its lines on structure. There is no colour step to pair it with:
 * `copy` and `foreground` are the same ink, and the type ladder is two steps
 * with "deliberately nothing between" — so an action reading as content at
 * rest is right, and inventing a third tone to hover out of would not be.
 * Focus is the standard ring, so a keyboard user gets the affordance without
 * having to hover.
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
        'rounded-sm text-body-sm text-copy underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
