'use client'

import { useState } from 'react'

import { TableCell } from '@/components/ui/table'
import { TextAction } from '@/components/ui/text-action'

/**
 * The reason a staff member typed, when the action refused to proceed without
 * one — quoted, because it is somebody's words rather than the screen's.
 *
 * ── Why it unfolds instead of setting the column's width ────────────────────
 *
 * A reason is free text: most are a handful of words and one in twenty is a
 * paragraph. With auto layout that one row decided the width of the whole
 * table — the slack goes to the widest column — so a single long apology
 * squeezed *When*, *Who* and *What* for every other row on the screen. The
 * columns are declared now, and this is the other half of that: the cell
 * clips to one line and offers to unfold, so a long reason costs its own row
 * and nobody else's.
 *
 * The offer is made on **length, not on measurement**. Asking the browser
 * whether the text overflowed would mean a ref, a resize observer and a
 * second render on a table that is otherwise entirely server-rendered, to
 * answer a question a character count answers well enough: the column is
 * ~220px, which is about thirty characters of 14px text, and anything past
 * `CLIPPED_AT` is certainly longer than that. A short reason renders as it
 * always did, with no control at all.
 *
 * `TextAction`, not a button: the cell is text, and a bordered rectangle in a
 * table cell reads as an action on the *record* rather than on the sentence
 * beside it.
 */

/** What a cell shows instead of nothing, as on the register. */
const ABSENT = '—'

/**
 * Past this many characters the cell clips and offers to unfold. Comfortably
 * more than the column holds, so the control never appears over text that fits.
 */
const CLIPPED_AT = 44

export function ReasonCell({ reason }: { reason: string | null }) {
  const [isOpen, setOpen] = useState(false)

  if (reason === null) {
    // An em dash in the muted tone the absent values on the register wear. The
    // column is mostly empty by design, and a blank cell reads as a value that
    // failed to load rather than as an action never asked to justify itself.
    return <TableCell className="align-top text-muted-foreground">{ABSENT}</TableCell>
  }

  const quoted = `“${reason}”`

  if (reason.length <= CLIPPED_AT) {
    return <TableCell className="align-top text-copy">{quoted}</TableCell>
  }

  if (isOpen) {
    return (
      <TableCell className="align-top text-copy">
        <span className="grid justify-items-start gap-xs">
          <span>{quoted}</span>
          <TextAction onClick={() => setOpen(false)}>Show less</TextAction>
        </span>
      </TableCell>
    )
  }

  return (
    <TableCell className="align-top text-copy">
      {/* One line: the sentence takes what is left and ellipses, and the
          control holds its own width at the end of it, so a clipped row is
          exactly as tall as an unclipped one. */}
      <span className="flex items-baseline gap-sm">
        {/* `min-w-0`, or the ellipsis never appears: a flex item's default
            `min-width: auto` refuses to shrink below its content, so the
            sentence would push the control out of the cell instead of
            clipping. */}
        <span className="min-w-0 truncate">{quoted}</span>
        <TextAction className="shrink-0" onClick={() => setOpen(true)}>
          Show more
        </TextAction>
      </span>
    </TableCell>
  )
}
