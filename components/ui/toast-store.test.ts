import { describe, expect, test } from 'vitest'

import { dismissToast, getToastsSnapshot, subscribeToToasts, toast } from './toast-store'

/**
 * The store is module-level on purpose (that is what makes `toast(...)`
 * callable from anywhere), so tests share it and assert relative to their
 * own additions rather than assuming an empty queue.
 */

describe('toast store', () => {
  test('enqueues with unique ids and immutable snapshots', () => {
    const before = getToastsSnapshot()

    const first = toast({ tone: 'positive', title: 'Saved' })
    const second = toast({ tone: 'negative', title: 'Failed', description: 'Try again.' })

    const after = getToastsSnapshot()

    expect(second).toBeGreaterThan(first)
    expect(after).toHaveLength(before.length + 2)
    // The earlier snapshot is untouched — the store replaces, never mutates.
    expect(before).not.toContain(after[after.length - 1])

    dismissToast(first)
    dismissToast(second)
  })

  test('dismiss removes exactly the given toast', () => {
    const keep = toast({ tone: 'positive', title: 'Keep me' })
    const drop = toast({ tone: 'positive', title: 'Drop me' })

    dismissToast(drop)

    const ids = getToastsSnapshot().map((item) => item.id)

    expect(ids).toContain(keep)
    expect(ids).not.toContain(drop)

    dismissToast(keep)
  })

  test('notifies subscribers on add and dismiss, and stops after unsubscribe', () => {
    let notifications = 0
    const unsubscribe = subscribeToToasts(() => {
      notifications += 1
    })

    const id = toast({ tone: 'positive', title: 'Ping' })

    expect(notifications).toBe(1)

    dismissToast(id)

    expect(notifications).toBe(2)

    // Dismissing something already gone changes nothing, so no notification.
    dismissToast(id)

    expect(notifications).toBe(2)

    unsubscribe()
    dismissToast(toast({ tone: 'positive', title: 'Silent' }))

    expect(notifications).toBe(2)
  })
})
