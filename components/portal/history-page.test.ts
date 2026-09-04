import { describe, expect, it } from 'vitest'

import { historyHref, historyPage } from './history-page'

describe('historyPage', () => {
  it('is the first page when the param is absent', () => {
    expect(historyPage(undefined)).toBe(1)
  })

  it('is the first page when the param is not a number', () => {
    expect(historyPage('all')).toBe(1)
    expect(historyPage('')).toBe(1)
  })

  it('never returns a page before the first', () => {
    expect(historyPage('0')).toBe(1)
    expect(historyPage('-4')).toBe(1)
  })

  it('reads the pages the links produce', () => {
    expect(historyPage('2')).toBe(2)
    expect(historyPage('15')).toBe(15)
  })

  it('truncates a fiddled fraction to a whole page', () => {
    expect(historyPage('2.9')).toBe(2)
  })

  it('refuses a figure that is not finite', () => {
    expect(historyPage('1e400')).toBe(1)
    expect(historyPage('Infinity')).toBe(1)
  })

  it('reads a page past any real trail as itself, leaving the clamp to the read', () => {
    expect(historyPage('1000')).toBe(1000)
  })
})

describe('historyHref', () => {
  it('addresses the first page as the record itself', () => {
    expect(historyHref('/portal/units/3B-04', 1)).toBe('/portal/units/3B-04')
  })

  it('addresses every other page in the query', () => {
    expect(historyHref('/portal/units/3B-04', 3)).toBe('/portal/units/3B-04?history=3')
  })
})
