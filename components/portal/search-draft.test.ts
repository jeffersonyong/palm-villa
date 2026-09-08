import { describe, expect, test } from 'vitest'

import { reconcileSearchDraft, searchAsked, searchSyncFor } from './search-draft'

describe('reconcileSearchDraft', () => {
  test('says nothing when the applied term has not moved', () => {
    // Arrange
    const sync = searchSyncFor('PV-0042')

    // Act
    const change = reconcileSearchDraft(sync, 'PV-0042')

    // Assert
    expect(change).toBeNull()
  })

  test('keeps typing that outran the round trip', () => {
    // Arrange — the field asked for `PV` on a pause and kept taking keys.
    const asked = searchAsked(searchSyncFor(''), 'PV')

    // Act — the server answers the term the field itself sent.
    const change = reconcileSearchDraft(asked, 'PV')

    // Assert — no replacement: the draft is further along than the answer.
    expect(change).toEqual({ sync: { seen: 'PV', asked: 'PV' }, draft: null })
  })

  test('replaces the draft when something else changed the search', () => {
    // Arrange
    const settled = searchSyncFor('PV-0042')

    // Act — the row's Clear emptied it.
    const change = reconcileSearchDraft(settled, '')

    // Assert
    expect(change).toEqual({ sync: { seen: '', asked: '' }, draft: '' })
  })

  test('replaces the draft when the back button lands mid-flight', () => {
    // Arrange — `PV-0042` was asked for and has not come back yet.
    const inFlight = searchAsked(searchSyncFor('PV-00'), 'PV-0042')

    // Act — the back button overtakes it with an older term.
    const change = reconcileSearchDraft(inFlight, 'PV')

    // Assert — not this field's echo, so the draft goes with the URL.
    expect(change).toEqual({ sync: { seen: 'PV', asked: 'PV' }, draft: 'PV' })
  })

  test('a Clear after an outside change is still recognised as an outside change', () => {
    // Arrange — a link arrived carrying ?q=PV-0042 without the field asking.
    const arrived = reconcileSearchDraft(searchSyncFor(''), 'PV-0042')

    // Act — and then the row's Clear empties it.
    const cleared = reconcileSearchDraft(arrived!.sync, '')

    // Assert — the field must let go of a term it never asked for.
    expect(arrived).toEqual({ sync: { seen: 'PV-0042', asked: 'PV-0042' }, draft: 'PV-0042' })
    expect(cleared).toEqual({ sync: { seen: '', asked: '' }, draft: '' })
  })

  test('a whole reference survives being typed across three round trips', () => {
    // Arrange — the sequence that lost characters: type, pause, keep typing,
    // answer lands, repeat. The draft is only ever replaced by an outsider.
    let sync = searchSyncFor('')
    const typed = ['PV-', 'PV-00', 'PV-0042']

    // Act
    const replacements = typed.map((draft) => {
      sync = searchAsked(sync, draft)
      const change = reconcileSearchDraft(sync, draft)
      sync = change?.sync ?? sync

      return change?.draft
    })

    // Assert
    expect(replacements).toEqual([null, null, null])
    expect(sync).toEqual({ seen: 'PV-0042', asked: 'PV-0042' })
  })
})
