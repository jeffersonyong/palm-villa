import { describe, expect, it } from 'vitest'

import { HISTORY_PAGE_SIZE, historyWindow } from './history-window'

describe('historyWindow', () => {
  it('shows one page when the param is absent', () => {
    expect(historyWindow(undefined)).toBe(HISTORY_PAGE_SIZE)
  })

  it('shows one page when the param is not a number', () => {
    expect(historyWindow('all')).toBe(HISTORY_PAGE_SIZE)
    expect(historyWindow('')).toBe(HISTORY_PAGE_SIZE)
  })

  it('never returns less than one page', () => {
    expect(historyWindow('0')).toBe(HISTORY_PAGE_SIZE)
    expect(historyWindow('-40')).toBe(HISTORY_PAGE_SIZE)
  })

  it('returns the windows the show-older link produces', () => {
    expect(historyWindow('20')).toBe(20)
    expect(historyWindow('50')).toBe(50)
  })

  it('rounds a fiddled figure up to a whole page', () => {
    expect(historyWindow('11')).toBe(20)
    expect(historyWindow('19')).toBe(20)
  })

  it('refuses a figure that is not finite', () => {
    expect(historyWindow('1e400')).toBe(HISTORY_PAGE_SIZE)
    expect(historyWindow('Infinity')).toBe(HISTORY_PAGE_SIZE)
  })

  it('reads a large but real figure as itself', () => {
    expect(historyWindow('1000')).toBe(1000)
  })
})
