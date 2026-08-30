/**
 * Page arithmetic for table pagination — pure, so the awkward cases (a page
 * that outlives the rows beneath it, the window near either end) are settled
 * by tests rather than by clicking around.
 *
 * Pages are 1-based throughout, because they are read by people.
 */

/** A rendered slot: a page number, or a gap the window skipped over. */
export type PaginationSlot = number | 'ellipsis'

export function pageCountFor(total: number, pageSize: number): number {
  if (pageSize <= 0) {
    return 1
  }

  // Never zero: an empty table still sits on page 1.
  return Math.max(1, Math.ceil(total / pageSize))
}

/**
 * Keeps a page inside the table's range.
 *
 * The reason this exists: deleting the last row of the last page leaves the
 * held page number pointing past the end. Callers clamp on render rather
 * than trying to correct the state after the fact.
 */
export function clampPage(page: number, pageCount: number): number {
  const highest = Math.max(1, pageCount)

  if (!Number.isFinite(page)) {
    return 1
  }

  return Math.min(Math.max(1, Math.trunc(page)), highest)
}

/** The `from`/`to` of "1–10 of 47", 1-based and inclusive; `0–0` when empty. */
export function rowRange(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0 || pageSize <= 0) {
    return { from: 0, to: 0 }
  }

  const safePage = clampPage(page, pageCountFor(total, pageSize))
  const from = (safePage - 1) * pageSize + 1

  return { from, to: Math.min(safePage * pageSize, total) }
}

function sequence(from: number, to: number): number[] {
  const pages: number[] = []

  for (let page = from; page <= to; page += 1) {
    pages.push(page)
  }

  return pages
}

/**
 * The page numbers to render, with `'ellipsis'` where the window skipped a
 * run. The first and last page are always reachable in one click; `siblings`
 * is how many neighbours flank the current page.
 *
 * The slot count is deliberately constant once ellipses appear, so the
 * control does not change width as you page through.
 */
export function paginationRange(page: number, pageCount: number, siblings = 1): PaginationSlot[] {
  if (pageCount <= 0) {
    return []
  }

  const current = clampPage(page, pageCount)
  // first + last + current + siblings either side + both ellipses.
  const maxSlots = siblings * 2 + 5

  if (pageCount <= maxSlots) {
    return sequence(1, pageCount)
  }

  const windowStart = Math.max(current - siblings, 1)
  const windowEnd = Math.min(current + siblings, pageCount)
  const hasLeftGap = windowStart > 2
  const hasRightGap = windowEnd < pageCount - 1
  const edgeRun = siblings * 2 + 3

  if (!hasLeftGap && hasRightGap) {
    return [...sequence(1, edgeRun), 'ellipsis', pageCount]
  }

  if (hasLeftGap && !hasRightGap) {
    return [1, 'ellipsis', ...sequence(pageCount - edgeRun + 1, pageCount)]
  }

  return expandSingleGaps([
    1,
    'ellipsis',
    ...sequence(windowStart, windowEnd),
    'ellipsis',
    pageCount,
  ])
}

/**
 * Replaces an ellipsis that hides exactly one page with the page itself — it
 * occupies the same slot, so the control keeps its width, and the page
 * becomes reachable in one click instead of two.
 */
function expandSingleGaps(slots: readonly PaginationSlot[]): PaginationSlot[] {
  return slots.map((slot, index) => {
    if (slot !== 'ellipsis') {
      return slot
    }

    const before = slots[index - 1]
    const after = slots[index + 1]

    if (typeof before === 'number' && typeof after === 'number' && after - before === 2) {
      return before + 1
    }

    return slot
  })
}
