'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * The search field that leads a list screen's control line.
 *
 * It is a filter like the chips beside it — URL state, applied on the server,
 * carried by every tile and by the footer — and it looks like one: the same
 * control height, the same hairline and card fill, a glyph where a chip has
 * its name. What differs is *when* it writes. A chip applies on the click that
 * set it; a field applies on a pause in typing, because pushing a navigation
 * on every keystroke would re-render the list six times for one name. Enter
 * applies at once, Escape clears.
 *
 * The committed value arrives as a prop and the draft lives here, so the
 * field can show what is being typed while the URL still says what is
 * applied — and so a Clear elsewhere in the row empties this too.
 */

const SETTLE_MS = 300

interface SearchFieldProps {
  /** The term the server actually applied. */
  value: string
  onChange: (term: string) => void
  /** What the field searches, said plainly: "Reference, guest or unit". */
  placeholder: string
  className?: string
}

export function SearchField({ value, onChange, placeholder, className }: SearchFieldProps) {
  const [draft, setDraft] = useState(value)
  const [applied, setApplied] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A change from outside — Clear, back, a tile — replaces the draft. Adjusted
  // during render rather than in an effect, the way React asks for state that
  // follows a prop: the field never paints a stale draft for one frame.
  if (applied !== value) {
    setApplied(value)
    setDraft(value)
  }

  useEffect(() => () => cancel(), [])

  function cancel() {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  function commit(next: string) {
    cancel()

    if (next.trim() !== value) {
      onChange(next.trim())
    }
  }

  function type(next: string) {
    setDraft(next)
    cancel()
    timer.current = setTimeout(() => commit(next), SETTLE_MS)
  }

  // 280, not 240: the two 34px gutters leave the text 172px at 240, and the
  // longest placeholder — "Reference, guest, phone or unit" — clipped at "or".
  // A placeholder that cannot be read is a field nobody knows the reach of.
  return (
    <div className={cn('relative w-[280px]', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-md size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        role="searchbox"
        aria-label="Search"
        placeholder={placeholder}
        value={draft}
        onChange={(event) => type(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(draft)
          }

          if (event.key === 'Escape' && draft.length > 0) {
            event.preventDefault()
            setDraft('')
            commit('')
          }
        }}
        // Room for the glyph on the left and the clear on the right, and the
        // browser's own search decorations off so the control draws one X.
        className="pr-[34px] pl-[34px] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {draft.length > 0 ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft('')
            commit('')
          }}
          className="absolute top-1/2 right-xs inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
