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
 * ── The offer is made on length, not on measurement ─────────────────────────
 *
 * Asking the browser whether the text overflowed would mean a ref, a resize
 * observer and a second render on a table that is otherwise entirely
 * server-rendered. A character count answers it, and answers it *exactly*
 * here, because the column is a declared 264px on every screen — the elastic
 * column is *What* (page.tsx, COLUMNS) precisely so this one never moves.
 * 264px less the cell's padding is 232px, which is about thirty characters at
 * 14px; `CLIPPED_AT` sits under that with room to spare, so the control can
 * never fail to appear over text that was silently cut. A short reason renders
 * as it always did, with no control at all.
 *
 * The control sits **under** the sentence rather than beside it. Beside it, it
 * would eat a third of the column's width from the text it is describing — and
 * it costs nothing below, because the Record column two cells over already
 * stacks a reference over its kind, so every row on this table is two lines
 * tall whatever this one does.
 *
 * `TextAction`, not a button: the cell is text, and a bordered rectangle in a
 * table cell reads as an action on the *record* rather than on the sentence
 * above it.
 */

/** What a cell shows instead of nothing, as on the register. */
const ABSENT = '—'

/**
 * Past this many characters the cell clips and offers to unfold. Comfortably
 * under what the 264px column holds, so the control never fails to appear over
 * a sentence that was cut — the quotation marks are inside the allowance.
 */
const CLIPPED_AT = 26

export function ReasonCell({ reason }: { reason: string | null }) {
  const [isOpen, setOpen] = useState(false)

  if (reason === null) {
    // An em dash in the muted tone the absent values on the register wear. The
    // column is mostly empty by design, and a blank cell reads as a value that
    // failed to load rather than as an action never asked to justify itself.
    return <TableCell className="text-muted-foreground">{ABSENT}</TableCell>
  }

  const quoted = `“${reason}”`

  if (reason.length <= CLIPPED_AT) {
    return <TableCell className="text-copy">{quoted}</TableCell>
  }

  // One shape for both states, so unfolding moves nothing sideways: the
  // sentence, then the control under its left edge. Only the clip and the
  // word change.
  return (
    <TableCell className="text-copy">
      <span className="grid justify-items-start gap-xs">
        <span className={isOpen ? 'w-full' : 'w-full truncate'}>{quoted}</span>
        <TextAction onClick={() => setOpen(!isOpen)}>
          {isOpen ? 'Show less' : 'Show more'}
        </TextAction>
      </span>
    </TableCell>
  )
}
