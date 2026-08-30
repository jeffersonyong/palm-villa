'use client'

import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * Radix Select — every dropdown in the product (design.md §Components).
 *
 * There is no native `<select>` left. A drawn panel is the only way a dropdown
 * can be part of the design system — the OS picker cannot carry a `micro` group
 * label, a status dot beside an option, or the overlay shell every other
 * floating surface uses — and the native fallback that once covered the
 * plain-HTML forms bought nothing except two dropdowns on one screen opening
 * two different objects. Radix renders a hidden native field when `name` is
 * set, so a `<form method="get">` still submits exactly as it did.
 *
 * Three rules hold it to the system, and they are the rules any future dropdown
 * inherits:
 *
 * 1. **The trigger is an Input.** Same height, hairline, 6px radius, `body-md`,
 *    same focus treatment. A closed select and a text field sitting in the same
 *    form row must be indistinguishable until you click one. The chevron is the
 *    only addition, and it turns over on open — the one piece of motion, on
 *    `transform`, so it costs nothing and tells you the panel belongs to this
 *    control.
 * 2. **The panel is the overlay shell, and the items inside it are controls.**
 *    14px radius, hairline, `shadow-overlay`; items at the 6px control radius
 *    on a `muted` focus fill, exactly like `DropdownMenu`. A select panel and a
 *    menu are the same object with different jobs, and they never diverge.
 * 3. **Selection is a weight shift, never a colour.** The checked item goes ink
 *    at 500 with a check mark; it does not take a brand fill. This is the same
 *    "where am I" language as the sidebar's active chip and the segmented
 *    control — see design.md §Color roles.
 *
 * The panel opens at least as wide as its trigger and grows to fit its content,
 * and it scales out of the trigger's own corner rather than its centre, so the
 * two read as one control rather than a box that appeared nearby.
 */
function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({ ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

/**
 * The default trigger: the Input treatment plus a chevron.
 *
 * `asChild` hands the whole shell over to the caller — the filter row does
 * exactly that with `FilterChip`, and a shell that supplies its own chevron and
 * its own dress wants neither of ours. So `asChild` drops both rather than
 * layering them, which also keeps Radix's Slot receiving the single child it
 * requires.
 */
function SelectTrigger({
  className,
  children,
  asChild,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  if (asChild) {
    return (
      <SelectPrimitive.Trigger data-slot="select-trigger" asChild {...props}>
        {children}
      </SelectPrimitive.Trigger>
    )
  }

  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'group flex h-control w-full items-center justify-between gap-sm rounded-md border border-border bg-card px-md text-body-md text-foreground transition-[border-color,box-shadow] outline-none',
        'data-[placeholder]:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/10',
        'disabled:cursor-not-allowed disabled:opacity-50',
        '[&>span]:truncate [&>span]:text-left',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = 'popper',
  sideOffset = 6,
  align = 'start',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover p-xs text-popover-foreground shadow-overlay',
          // Scaling out of the trigger's corner is what makes the panel read as
          // this control opening rather than a box arriving from elsewhere.
          'origin-[var(--radix-select-content-transform-origin)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
          'motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className="w-full">{children}</SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

/** Group headers take the labelling voice, same as table headers and menus. */
function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn('px-md pt-sm pb-xs micro-label text-muted-foreground', className)}
      {...props}
    />
  )
}

/**
 * An option.
 *
 * `children` is the option's **text** and nothing else: Radix mirrors it into
 * the trigger to render the closed value, and it renders inline, so a sized
 * ornament put in there would be both duplicated onto the trigger and collapsed
 * to zero width. Anything that is not the label — a status dot, an icon —
 * goes in `leading`, which sits beside the text as a real flex child.
 */
function SelectItem({
  className,
  children,
  leading,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & { leading?: React.ReactNode }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex cursor-default items-center gap-sm rounded-md py-sm pr-2xl pl-md text-body-sm text-copy transition-colors outline-none select-none',
        'focus:bg-muted focus:text-foreground',
        // Selection is weight and ink, never a fill.
        'data-[state=checked]:font-medium data-[state=checked]:text-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      {leading}
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {/* The check is absolutely placed and the row reserves its width, so
          labels stay flush left and nothing shifts as the selection moves. */}
      <span className="pointer-events-none absolute right-md flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check aria-hidden className="size-4 text-foreground" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('-mx-xs my-xs h-px bg-divider', className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn('flex cursor-default items-center justify-center py-xs', className)}
      {...props}
    >
      <ChevronUp aria-hidden className="size-4 text-muted-foreground" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn('flex cursor-default items-center justify-center py-xs', className)}
      {...props}
    >
      <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
