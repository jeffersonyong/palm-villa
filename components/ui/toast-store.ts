/**
 * The toast queue, as a minimal external store — the same pattern as the
 * theme store in lib/theme.ts, so `Toaster` reads it with
 * `useSyncExternalStore` and any client code can push to it by calling
 * `toast(...)` directly, with no provider threading.
 *
 * Nothing here touches the DOM; rendering, timing and dismissal gestures
 * belong to components/ui/toast.tsx.
 */

export type ToastTone = 'positive' | 'negative'

export interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

export interface ToastInput {
  tone: ToastTone
  title: string
  description?: string
}

const listeners = new Set<() => void>()

/** The snapshot must be referentially stable, so the list itself is it. */
let items: readonly ToastItem[] = []
let nextId = 1

const EMPTY: readonly ToastItem[] = []

function emit(): void {
  for (const listener of listeners) listener()
}

export function subscribeToToasts(onChange: () => void): () => void {
  listeners.add(onChange)

  return () => {
    listeners.delete(onChange)
  }
}

export function getToastsSnapshot(): readonly ToastItem[] {
  return items
}

/** The server renders no toasts; they only exist as a result of client acts. */
export function getToastsServerSnapshot(): readonly ToastItem[] {
  return EMPTY
}

/** Enqueues a toast and returns its id. */
export function toast(input: ToastInput): number {
  const id = nextId

  nextId += 1
  items = [...items, { id, ...input }]
  emit()

  return id
}

export function dismissToast(id: number): void {
  const next = items.filter((item) => item.id !== id)

  if (next.length !== items.length) {
    items = next
    emit()
  }
}
