import { describe, expect, test } from 'vitest'

import { clampPage, pageCountFor, paginationRange, rowRange } from './pagination-range'

describe('pageCountFor', () => {
  test('counts whole and partial pages', () => {
    expect(pageCountFor(20, 10)).toBe(2)
    expect(pageCountFor(21, 10)).toBe(3)
  })

  test('an empty table still has one page', () => {
    expect(pageCountFor(0, 10)).toBe(1)
  })
})

describe('clampPage', () => {
  test('holds a page inside the range', () => {
    expect(clampPage(3, 5)).toBe(3)
    expect(clampPage(9, 5)).toBe(5)
    expect(clampPage(0, 5)).toBe(1)
    expect(clampPage(-2, 5)).toBe(1)
  })

  test('survives a table that shrank underneath it', () => {
    // Deleting the last row of page 3 leaves the held page pointing past the
    // end; the render clamps instead of showing an empty table.
    expect(clampPage(3, 1)).toBe(1)
  })
})

describe('rowRange', () => {
  test('describes the visible slice', () => {
    expect(rowRange(1, 10, 47)).toEqual({ from: 1, to: 10 })
    expect(rowRange(2, 10, 47)).toEqual({ from: 11, to: 20 })
  })

  test('the last page stops at the total', () => {
    expect(rowRange(5, 10, 47)).toEqual({ from: 41, to: 47 })
  })

  test('an empty table has no range', () => {
    expect(rowRange(1, 10, 0)).toEqual({ from: 0, to: 0 })
  })

  test('a page past the end reads as the last page', () => {
    expect(rowRange(9, 10, 47)).toEqual({ from: 41, to: 47 })
  })
})

describe('paginationRange', () => {
  test('lists every page while they fit', () => {
    expect(paginationRange(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  test('near the start, only the tail is elided', () => {
    expect(paginationRange(2, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 20])
  })

  test('near the end, only the head is elided', () => {
    expect(paginationRange(19, 20)).toEqual([1, 'ellipsis', 16, 17, 18, 19, 20])
  })

  test('in the middle, both sides are elided around the current page', () => {
    expect(paginationRange(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20])
  })

  test('the slot count stays constant while paging, so the control cannot jump', () => {
    const widths = [1, 5, 10, 15, 20].map((page) => paginationRange(page, 20).length)

    expect(new Set(widths).size).toBe(1)
  })

  test('an ellipsis never stands in for a single page', () => {
    // Page 4 of 9: the left gap would hide only page 2, so the page is shown
    // instead — same slot, one click instead of two. The right gap hides
    // 6, 7 and 8, which earns its ellipsis.
    expect(paginationRange(4, 9)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 9])

    // The property, across every page of several table sizes.
    for (const pageCount of [8, 9, 10, 13, 40]) {
      for (let page = 1; page <= pageCount; page += 1) {
        const slots = paginationRange(page, pageCount)

        slots.forEach((slot, index) => {
          if (slot !== 'ellipsis') return

          const before = slots[index - 1]
          const after = slots[index + 1]

          expect(typeof before === 'number' && typeof after === 'number').toBe(true)
          expect((after as number) - (before as number)).toBeGreaterThanOrEqual(3)
        })
      }
    }
  })

  test('clamps a page outside the range before building the window', () => {
    expect(paginationRange(99, 20)).toEqual(paginationRange(20, 20))
  })

  test('no pages, no slots', () => {
    expect(paginationRange(1, 0)).toEqual([])
  })
})

describe('paginationRange with no siblings', () => {
  // The inline control — a history's footer inside a 360px column — has no
  // room for neighbours around the current page: five slots, not seven.
  test('lists every page while five fit', () => {
    expect(paginationRange(3, 5, 0)).toEqual([1, 2, 3, 4, 5])
  })

  test('near the start, shows the first three and the last', () => {
    expect(paginationRange(1, 15, 0)).toEqual([1, 2, 3, 'ellipsis', 15])
    expect(paginationRange(2, 15, 0)).toEqual([1, 2, 3, 'ellipsis', 15])
  })

  test('in the middle, the current page stands alone between two gaps', () => {
    expect(paginationRange(8, 15, 0)).toEqual([1, 'ellipsis', 8, 'ellipsis', 15])
  })

  test('near the end, shows the first and the last three', () => {
    expect(paginationRange(14, 15, 0)).toEqual([1, 'ellipsis', 13, 14, 15])
  })

  test('a gap of one page is the page', () => {
    expect(paginationRange(3, 15, 0)).toEqual([1, 2, 3, 'ellipsis', 15])
  })

  test('the slot count stays constant while paging', () => {
    const widths = [1, 3, 8, 13, 15].map((page) => paginationRange(page, 15, 0).length)

    expect(new Set(widths).size).toBe(1)
  })
})
