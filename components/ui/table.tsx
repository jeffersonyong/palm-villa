import Link, { type LinkProps } from 'next/link'

import { cn } from '@/lib/utils'

/**
 * The portal's signature surface (design.md §Tables).
 *
 * A hairline-bounded container at the card radius with `overflow-hidden`;
 * header row on the gray fill in `micro` mute; body rows at `body-sm` with
 * divider rules. This is the payment queue, the arrivals list, and every list
 * screen — so the chrome lives here once rather than being retyped per screen.
 *
 * Two recipes the table cannot apply for you, because they depend on what the
 * column holds — pass them as `className` on the cell:
 *
 * - Booking references: `font-mono text-foreground tabular-nums`
 * - Money and counts:   `text-right tabular-nums`
 *
 * Server-safe: no client boundary, so list screens stay server components.
 */

function Table({
  className,
  containerClassName,
  footer,
  scrollX,
  scrollY,
  ...props
}: React.ComponentProps<'table'> & {
  containerClassName?: string
  /**
   * Chrome below the rows, inside the container's hairline — the pagination
   * footer. Kept a slot rather than a sibling so the table keeps one
   * boundary and one radius.
   */
  footer?: React.ReactNode
  /**
   * Let the columns scroll sideways inside the container instead of being
   * clipped by it — for a table that is wide by nature (the role matrix) rather
   * than one that got wide by accident. A boolean rather than a `containerClassName`
   * override because the two overflow utilities would otherwise both apply and
   * leave which one wins to stylesheet order. Whatever the caller pins with
   * `sticky left-0` needs an opaque fill of its own, since the cells behind it
   * now slide past.
   */
  scrollX?: boolean
  /**
   * With `scrollX`, let the rows scroll *inside* the container too, so a
   * header row pinned with `sticky top-0` and a column pinned with
   * `sticky left-0` both hold while the body moves beneath them. The portal
   * panel is otherwise the only vertical scroller, and a sticky header inside
   * an `overflow-x-auto` box cannot follow it — the box is its scroll parent
   * and never moves. The caller caps the height through `containerClassName`;
   * it is the one place a second scroll region is worth its cost, a grid too
   * tall for the panel whose column headings are the only way to read a row.
   */
  scrollY?: boolean
}) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        'rounded-lg border border-border bg-card',
        scrollX
          ? scrollY
            ? 'overflow-auto'
            : 'overflow-x-auto overflow-y-hidden'
          : 'overflow-hidden',
        containerClassName,
      )}
    >
      <table
        data-slot="table"
        className={cn('w-full border-collapse text-left', className)}
        {...props}
      />
      {footer}
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />
}

function TableHeaderRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border bg-muted', className)} {...props} />
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      data-slot="table-head"
      className={cn('px-lg py-sm micro-label text-muted-foreground', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody data-slot="table-body" className={cn('divide-y divide-divider', className)} {...props} />
  )
}

/**
 * `interactive` marks a row that carries a `TableRowLink`: it becomes the
 * positioning box the stretched link fills, and keyboard focus on that link
 * lights the whole row the way hover does.
 */
function TableRow({
  className,
  interactive,
  ...props
}: React.ComponentProps<'tr'> & { interactive?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'transition-colors hover:bg-muted/60',
        interactive && 'relative focus-within:bg-muted/60',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The stretched link (design.md §Components — Detail screens are routes). It
 * covers the whole row, so a click anywhere opens the record, while the anchor
 * itself stays on the identifying cell — which is what a screen reader should
 * announce as the link text. No client JavaScript: middle-click, new-tab and
 * keyboard focus all keep working. Its row must be `interactive`.
 */
// Generic so `href` keeps Next's typed-route checking through the wrapper.
function TableRowLink<RouteType>({ className, ...props }: LinkProps<RouteType>) {
  return (
    <Link
      data-slot="table-row-link"
      className={cn(
        'rounded-sm outline-none after:absolute after:inset-0 focus-visible:underline',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The row's own header cell — the identifying column of a table whose *rows*
 * are the subjects and whose columns are attributes (the role matrix's
 * permission names). Cell metrics, not header metrics: it sits in the body, so
 * it takes `TableCell`'s padding and size and only its weight stays a cell's.
 * `scope` defaults to `row` and can be overridden for a cell that labels a
 * group of rows.
 */
function TableRowHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      scope="row"
      data-slot="table-row-head"
      className={cn('px-lg py-md text-left text-body-sm font-normal text-copy', className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-lg py-md text-body-sm text-copy', className)}
      {...props}
    />
  )
}

/**
 * The body's stand-in when a table has no rows to show.
 *
 * A header with nothing under it is the one state a table cannot explain: the
 * columns are drawn, so the screen looks like it is working, and the reader is
 * left to guess whether nothing matched, nothing exists yet, or something
 * failed. A filtered table is the common way in — narrow to a unit type that
 * has none configured and the rows simply vanish.
 *
 * The header **stays**, deliberately, rather than the table being swapped for
 * a page-level `EmptyState`. Emptiness here is usually the answer to a filter
 * sitting directly above, and keeping the columns keeps the question visible
 * beside the answer. Where a whole *screen* has nothing on it — a period with
 * no bookings at all — that is still `EmptyState`'s job, and the record screens
 * go on using it.
 *
 * Say which of the two it is: "nothing matched" names the filter and offers to
 * clear it; "nothing here yet" names where rows come from. The caller writes
 * the sentence because only it knows which.
 */
function TableEmpty({
  colSpan,
  className,
  children,
  ...props
}: React.ComponentProps<'td'> & { colSpan: number }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        data-slot="table-empty"
        className={cn('px-lg py-2xl text-center text-body-sm text-muted-foreground', className)}
        {...props}
      >
        {children}
      </TableCell>
    </TableRow>
  )
}

export {
  Table,
  TableHeader,
  TableHeaderRow,
  TableHead,
  TableBody,
  TableRow,
  TableRowHead,
  TableRowLink,
  TableCell,
  TableEmpty,
}
