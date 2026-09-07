import { describe, expect, test } from 'vitest'

import { csvCell, csvFilename, exportFilename, toCsv } from './csv'

describe('csvCell', () => {
  test('writes a plain value unquoted', () => {
    expect(csvCell('3B-01')).toBe('3B-01')
  })

  test('quotes a value holding a comma, a quote or a newline', () => {
    expect(csvCell('Yong, Jefferson')).toBe('"Yong, Jefferson"')
    expect(csvCell('the "morning" run')).toBe('"the ""morning"" run"')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  test('writes a number bare, so a spreadsheet can add it up', () => {
    expect(csvCell(2360)).toBe('2360')
    expect(csvCell(-50)).toBe('-50')
  })

  test('empties a null, an undefined and a non-finite number', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(Number.NaN)).toBe('')
  })

  describe('formula injection', () => {
    // A guest types their own name and a clerk types a banking note; both reach
    // a file somebody opens in Excel, which executes a cell that opens with one
    // of these. Quoting does not help — the value is syntactically fine.
    test.each(['=1+1', '+1', '-1+1', '@SUM(A1)', '\tcmd', '\rcmd'])(
      'makes %j inert with a leading apostrophe',
      (value) => {
        expect(csvCell(value).replace(/^"|"$/g, '')).toMatch(/^'/)
      },
    )

    test('the classic payload is neutralised', () => {
      // No comma or double quote in it, so it needs no wrapping — the
      // apostrophe alone is what stops Excel executing it.
      expect(csvCell("=cmd|' /c calc'!A1")).toBe("'=cmd|' /c calc'!A1")
    })

    test('a negative number is not guarded, or the arithmetic breaks', () => {
      // The reason cells are told apart by type rather than by first character:
      // an over-banked balance is a real negative and must stay one.
      expect(csvCell(-50.25)).toBe('-50.25')
    })

    test('a money string that came from formatCents is untouched', () => {
      expect(csvCell('2360.00')).toBe('2360.00')
    })
  })
})

describe('toCsv', () => {
  test('writes the header row then the rows, CRLF separated', () => {
    expect(
      toCsv(
        ['Unit', 'Nights'],
        [
          ['3B-01', 2],
          ['SD-01', 0],
        ],
      ),
    ).toBe('Unit,Nights\r\n3B-01,2\r\nSD-01,0')
  })

  test('a document with no rows is still its header', () => {
    // An empty period is an answer, and a file with no columns is not one.
    expect(toCsv(['Unit', 'Nights'], [])).toBe('Unit,Nights')
  })
})

describe('csvFilename', () => {
  test('names the report and the period it covers', () => {
    expect(csvFilename('revenue', '2026-09-01', '2026-09-08')).toBe(
      'palm-villa-revenue-2026-09-01-to-2026-09-08.csv',
    )
  })
})

describe('exportFilename', () => {
  test('names the table and the day it was taken', () => {
    expect(exportFilename('bookings', '2026-09-12')).toBe('palm-villa-bookings-2026-09-12.csv')
  })
})
