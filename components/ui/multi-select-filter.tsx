'use client'

import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'

import { CheckboxGlyph } from '@/components/ui/checkbox'
import { FilterChip } from '@/components/ui/filter-chip'
import { cn } from '@/lib/utils'

/**
 * A filter chip whose panel takes several answers at once
 * (design.md §Components — Filter rows).
 *
 * The single-choice `Select` is the baseline dropdown and stays that; this is
 * its plural, for the filters where "confirmed *and* checked in" is a real
 * question. It is built on the menu primitive rather than `Select` because a
 * select is a control that holds one value and closes when it gets it, and
 * bending it into holding several would fight it at every turn.
 *
 * Everything visible is the baseline's, so the two read as one family: the same
 * overlay shell, the same control-radius items on a `muted` focus fill, the same
 * `micro` group label, and the same rule that **selection is a weight shift and
 * a mark, never a colour**.
 *
 * Two things it does that the single-choice panel does not, and both matter:
 *
 * - **Choosing does not close it.** Every menu item suppresses the default
 *   dismiss, because picking three statuses should cost three clicks and not
 *   three round trips through the trigger.
 * - **Nothing selected means no filter**, not an empty result. There is no "Any"
 *   option to choose, because "any" is what an unset filter already is; a
 *   `Clear` row appears at the foot of the panel only once something is on.
 */

export interface MultiSelectOption<T extends string> {
  value: T
  label: string
  /** An ornament shown before the label — a status dot, an icon. */
  leading?: React.ReactNode
}

interface MultiSelectFilterProps<T extends string> {
  /** The field name, shown on the chip. */
  label: string
  options: readonly MultiSelectOption<T>[]
  /** The chosen values. Empty means the filter is off. */
  selected: readonly T[]
  onChange: (selected: readonly T[]) => void
  /** Names the group inside the panel. Defaults to the field name. */
  groupLabel?: string
  className?: string
}

export function MultiSelectFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
  groupLabel,
  className,
}: MultiSelectFilterProps<T>) {
  function toggle(value: T) {
    onChange(
      selected.includes(value)
        ? selected.filter((current) => current !== value)
        : // Kept in the options' order rather than click order, so the chip's
          // summary and the URL read the same however they were assembled.
          options.map((option) => option.value).filter((v) => v === value || selected.includes(v)),
    )
  }

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <FilterChip
          className={className}
          label={label}
          value={summarise(options, selected)}
          aria-label={
            selected.length > 0
              ? `${label}: ${selected.length} of ${options.length} selected`
              : `${label}: any`
          }
        />
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          data-slot="multi-select-content"
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 min-w-[200px] overflow-hidden rounded-xl border border-border bg-popover p-xs text-popover-foreground shadow-overlay',
            'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
            'motion-reduce:animate-none',
          )}
        >
          <DropdownMenuPrimitive.Label className="px-md pt-sm pb-xs micro-label text-muted-foreground">
            {groupLabel ?? label}
          </DropdownMenuPrimitive.Label>

          {options.map((option) => (
            <DropdownMenuPrimitive.CheckboxItem
              key={option.value}
              checked={selected.includes(option.value)}
              // The panel stays open: three statuses should cost three clicks,
              // not three trips through the trigger.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => toggle(option.value)}
              className={cn(
                'group relative flex cursor-default items-center gap-sm rounded-md py-sm pr-md pl-2xl text-body-sm text-copy transition-colors outline-none select-none',
                'focus:bg-muted focus:text-foreground',
                'data-[state=checked]:font-medium data-[state=checked]:text-foreground',
              )}
            >
              {/* A drawn box rather than a bare tick: with several answers live
                  at once the reader has to see that the unchosen ones are
                  choosable, which an empty gutter does not say. It is the
                  product's checkbox, not a lookalike — the item carries the
                  `data-state` the glyph reads. */}
              <CheckboxGlyph className="pointer-events-none absolute left-sm" />
              {option.leading}
              {option.label}
            </DropdownMenuPrimitive.CheckboxItem>
          ))}

          {selected.length > 0 ? (
            <>
              <DropdownMenuPrimitive.Separator className="-mx-xs my-xs h-px bg-divider" />
              <DropdownMenuPrimitive.Item
                onSelect={() => onChange([])}
                className={cn(
                  'flex cursor-default items-center rounded-md px-md py-sm text-body-sm text-copy transition-colors outline-none select-none',
                  'focus:bg-muted focus:text-foreground',
                )}
              >
                Clear {label.toLowerCase()}
              </DropdownMenuPrimitive.Item>
            </>
          ) : null}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}

/**
 * What the chip says.
 *
 * One choice is named. Several name the first and count the rest — "Confirmed
 * +2" — rather than showing a bare "3 selected", because the first label is
 * usually enough to recognise the filter you set, and a bare count is not.
 * Everything selected is the same as nothing selected, so it says so.
 */
function summarise<T extends string>(
  options: readonly MultiSelectOption<T>[],
  selected: readonly T[],
): string | null {
  if (selected.length === 0) {
    return null
  }

  if (selected.length === options.length) {
    return 'All'
  }

  const [first, ...rest] = selected

  if (first === undefined) {
    return null
  }

  const label = options.find((option) => option.value === first)?.label ?? first

  return rest.length === 0 ? label : `${label} +${rest.length}`
}
