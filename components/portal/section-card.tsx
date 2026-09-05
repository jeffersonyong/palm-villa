import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { SectionHint } from './section-hint'

/**
 * A card that names itself: the `micro` heading sits **inside** the card, above
 * its content — exactly as `FormSection` does inside a form.
 *
 * The headings on the record screens used to float on the panel *above* their
 * cards, which left the system saying "section" two different ways for one job.
 * It read worse as well as inconsistently: on a white panel a label outside a
 * white card has no surface of its own, so it detached from the box it named
 * and the card below it looked untitled. Inside, a section is one object with a
 * title on it.
 *
 * `mt-md` between the heading and its content is `FormSection`'s own measure,
 * quoted here so the two constructions cannot drift apart.
 *
 * `h-full` lets two of these sit side by side in a grid and end level — the
 * section stretches to the row, and the card fills it. In normal flow the
 * parent's height is auto and it resolves to auto, so it costs nothing.
 *
 * The title line has two optional companions. A `hint` is the section's
 * explanation, folded into a tooltip beside the title (see `SectionHint`).
 * `actions` sit opposite the title — the one control that acts on the section
 * as a whole, such as adding a note to the notes — so it is found where a
 * reader looks for it and the section's body stays the section's content.
 *
 * An `icon` leads the title at the label's own 14px line, for the one section
 * that is known by a mark rather than a word alone (the security deposit —
 * `deposit-figures.tsx`). Decorative to a screen reader: the heading's name
 * is still the title.
 */
export function SectionCard({
  id,
  title,
  hint,
  icon: Icon,
  actions,
  className,
  children,
}: {
  /** Anchors `aria-labelledby`, so the section is announced by its heading. */
  id: string
  title: string
  /** A lucide glyph drawn before the title. */
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  /** Plain text for the tooltip beside the title. */
  hint?: string
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className={cn(className)}>
      <Card className="h-full">
        <div className="flex items-center justify-between gap-lg">
          {/* The hint sits beside the heading, not inside it, so the heading's
              accessible name stays the title alone. */}
          <div className="flex items-center gap-xs">
            {Icon ? <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" /> : null}
            <h2 id={id} className="micro-label text-muted-foreground">
              {title}
            </h2>
            {hint ? <SectionHint label={`About ${title.toLowerCase()}`}>{hint}</SectionHint> : null}
          </div>
          {actions}
        </div>
        <div className="mt-md">{children}</div>
      </Card>
    </section>
  )
}
