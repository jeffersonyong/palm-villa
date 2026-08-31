import { cn } from '@/lib/utils'

/**
 * One section of a portal form (design.md §Components — Portal forms).
 *
 * A form is one card, never a stack of sibling cards: sections divide with a
 * `divider` rule and take the labelling voice — `micro` in mute — as their
 * header. The first section in a card has nothing above it to divide from, so
 * it takes no rule and no top space; that is decided here by `first:` rather
 * than by the caller remembering to drop the classes on the first one.
 *
 * The content sits `md` under its heading — the same distance a `micro` group
 * label keeps from the menu items it names — and a full `xl` separates one
 * section from the next (design.md §Layout, portal rhythm).
 */
export function FormSection({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'mt-xl border-t border-divider pt-xl first:mt-0 first:border-t-0 first:pt-0',
        className,
      )}
    >
      <h2 className="micro-label text-muted-foreground">{title}</h2>
      <div className="mt-md">{children}</div>
    </section>
  )
}
