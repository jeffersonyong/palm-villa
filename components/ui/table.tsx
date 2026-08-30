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
  ...props
}: React.ComponentProps<'table'> & {
  containerClassName?: string
  /**
   * Chrome below the rows, inside the container's hairline — the pagination
   * footer. Kept a slot rather than a sibling so the table keeps one
   * boundary and one radius.
   */
  footer?: React.ReactNode
}) {
  return (
    <div
      data-slot="table-container"
      className={cn('overflow-hidden rounded-lg border border-border bg-card', containerClassName)}
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

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('transition-colors hover:bg-muted/60', className)}
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

export { Table, TableHeader, TableHeaderRow, TableHead, TableBody, TableRow, TableCell }
