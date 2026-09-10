'use client'

import { Check, ChevronDown, Search } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  countryForDialCode,
  searchCountries,
  type Country,
} from '@/lib/domain/countries'
import { composePhoneNumber, splitPhoneNumber } from '@/lib/domain/phone'
import { cn } from '@/lib/utils'

/**
 * A phone number in two halves: the country code chosen from a list, and the
 * rest typed beside it.
 *
 * This replaces the plain `type="tel"` field on all five forms that ask for a
 * number — both public booking forms, the lookup, and the desk's two. What it
 * buys is not validation, which this product deliberately does not do to phone
 * numbers (see `lib/domain/phone.ts`), but *legibility*: a guest ringing from
 * Kuala Lumpur no longer has to guess whether the desk wants `+60`, `0060` or
 * a bare `12`, and every number recorded from here forward carries the code
 * that says which country it can be rung from.
 *
 * **There are no flags.** The reference this was drawn from shows one per row,
 * and on Windows there is no flag to show — the platform ships no flag emoji,
 * so Chrome and Edge draw the two letters of the country code in a grey box.
 * The desk runs on Windows. Shipping SVG flags instead would put the only
 * colour on a portal screen design.md keeps deliberately monochrome, to say
 * something the dial code beside it already says.
 *
 * **The shell is the Input treatment, once.** Two controls sit inside one
 * hairline and one 6px radius, divided by a single rule, and the focus ring
 * belongs to the shell rather than to either half — so a phone field and a
 * text field in the same form row still read as the same object, which is the
 * rule `SelectTrigger` and `DateField` already follow.
 *
 * **An untouched field submits exactly what it was given.** This is the
 * invariant prd.md §13 states outright: the number is stored as typed and
 * never rewritten. Every booking taken at the desk before this control existed
 * is a bare `8959798`, and re-composing that as `+673 8959798` merely because
 * an amendment form was opened would rewrite the record — and worse, would
 * show as a phone change in the amendment's own diff and its audit event, on
 * an amendment that only moved a date. So the composed value is used from the
 * moment somebody edits this control, and not before.
 */

interface PhoneInputProps {
  /** Lands on the number input, so a `<label htmlFor>` focuses the number. */
  id: string
  /** The form field name. Submitted through a hidden input. */
  name: string
  /** Controlled value: the whole number, as it is stored. */
  value?: string
  onChange?: (value: string) => void
  /** Initial value for an uncontrolled field. */
  defaultValue?: string
  required?: boolean
  disabled?: boolean
  /** An example of the number, never a restatement of the label. */
  placeholder?: string
  invalid?: boolean
  /** The id of the error or hint text under the field. */
  describedBy?: string
  className?: string
}

const DIAL_CODES = COUNTRIES.map((country) => country.dialCode)

export function PhoneInput({
  id,
  name,
  value,
  onChange,
  defaultValue,
  required,
  disabled,
  placeholder,
  invalid,
  describedBy,
  className,
}: PhoneInputProps) {
  const initial = value ?? defaultValue ?? ''
  const [original] = useState(initial)
  const [edited, setEdited] = useState(false)
  const [open, setOpen] = useState(false)

  const parsed = splitPhoneNumber(initial, DIAL_CODES)
  const [country, setCountry] = useState<Country>(
    () =>
      (parsed.dialCode === null ? undefined : countryForDialCode(parsed.dialCode)) ??
      DEFAULT_COUNTRY,
  )
  const [national, setNational] = useState(parsed.nationalNumber)

  const numberRef = useRef<HTMLInputElement>(null)

  const submitted = edited ? composePhoneNumber(country.dialCode, national) : original

  function edit(next: { country?: Country; national?: string }) {
    const nextCountry = next.country ?? country
    const nextNational = next.national ?? national

    setEdited(true)
    setCountry(nextCountry)
    setNational(nextNational)
    onChange?.(composePhoneNumber(nextCountry.dialCode, nextNational))
  }

  return (
    <div
      data-slot="phone-input"
      data-invalid={invalid || undefined}
      className={cn(
        'flex h-control w-full min-w-0 items-stretch rounded-md border border-border bg-card transition-[border-color,box-shadow]',
        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/10',
        'data-[invalid]:border-destructive data-[invalid]:ring-[3px] data-[invalid]:ring-destructive/20',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            // The number beside it is the field; this is the qualifier on it,
            // so it says which country rather than repeating "phone".
            aria-label={`Country calling code — ${country.name}`}
            className={cn(
              'group flex shrink-0 items-center gap-xs rounded-l-md px-md text-body-md text-foreground tabular-nums transition-colors outline-none',
              'hover:bg-muted focus-visible:bg-muted',
              'disabled:pointer-events-none',
            )}
          >
            +{country.dialCode}
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            />
          </button>
        </PopoverTrigger>
        <CountryPanel
          selected={country}
          onSelect={(next) => {
            edit({ country: next })
            setOpen(false)
            // Back to the number: picking a country is never the last thing
            // somebody wanted to do in this field.
            numberRef.current?.focus()
          }}
        />
      </Popover>

      {/* A single hairline, the same rule that divides every other surface. */}
      <span aria-hidden className="my-xs w-px shrink-0 bg-divider" />

      <input
        ref={numberRef}
        id={id}
        type="tel"
        inputMode="tel"
        // The national half of a split field, which is what this is. The
        // browser fills the country picker's counterpart into nothing, and
        // that is correct — it has no text field to fill.
        autoComplete="tel-national"
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={national}
        onChange={(event) => edit({ national: event.target.value })}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'w-full min-w-0 flex-1 rounded-r-md bg-transparent px-md py-xs text-body-md text-foreground outline-none',
          'placeholder:text-muted-foreground',
          'disabled:cursor-not-allowed',
        )}
      />

      {/* What the server reads. The visible input is deliberately unnamed:
          the field's value is the two halves together, and `required` on the
          visible half still raises the browser's own message, which a hidden
          input never could. */}
      <input type="hidden" name={name} value={submitted} />
    </div>
  )
}

/**
 * The list, with a search box above it.
 *
 * Two hundred countries is a scroll nobody should have to make, and the search
 * answers a name or a dial code because people arrive knowing one or the
 * other. The panel is the menu scale — it opens out of a control, so it takes
 * the 12px radius rather than the 16px surface one.
 */
function CountryPanel({
  selected,
  onSelect,
}: {
  selected: Country
  onSelect: (country: Country) => void
}) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const searchId = useId()

  const matches = searchCountries(query)

  function moveFocus(from: HTMLElement, step: 1 | -1) {
    const options = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    )
    const next = options[options.indexOf(from as HTMLButtonElement) + step]

    next?.focus()
  }

  return (
    <PopoverContent scale="menu" align="start" className="w-[290px]">
      <div className="flex items-center gap-sm border-b border-divider px-md py-sm">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown') return

            event.preventDefault()
            listRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus()
          }}
          placeholder="Search countries"
          aria-label="Search countries"
          autoComplete="off"
          className={cn(
            'w-full min-w-0 bg-transparent text-body-md text-foreground outline-none',
            'placeholder:text-muted-foreground',
            // `type="search"` is right for the role and brings Chrome's own
            // clear button with it — an ornament this system never drew, in a
            // panel where every other mark is ours.
            '[&::-webkit-search-cancel-button]:appearance-none',
          )}
        />
      </div>

      <div
        ref={listRef}
        role="listbox"
        aria-label="Country"
        className="max-h-[264px] overflow-y-auto overscroll-contain p-xs"
      >
        {matches.length === 0 ? (
          <p className="px-md py-sm text-body-sm text-muted-foreground">
            No country by that name or code.
          </p>
        ) : (
          matches.map((country) => {
            const isSelected = country.code === selected.code

            return (
              <button
                key={country.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(country)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

                  event.preventDefault()
                  moveFocus(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1)
                }}
                className={cn(
                  'flex w-full cursor-default items-center gap-sm rounded-md py-sm pr-md pl-md text-left text-body-sm text-copy transition-colors outline-none',
                  'hover:bg-muted focus-visible:bg-muted focus-visible:text-foreground',
                  // Selection is weight and ink, never a fill — the same rule
                  // the select's checked item follows.
                  isSelected && 'font-medium text-foreground',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{country.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  +{country.dialCode}
                </span>
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {isSelected ? <Check aria-hidden className="size-4 text-foreground" /> : null}
                </span>
              </button>
            )
          })
        )}
      </div>
    </PopoverContent>
  )
}
