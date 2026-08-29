'use client'

import { useEffect } from 'react'

/**
 * Marks <html> as an operations surface, which scopes the monochrome action
 * roles (globals.css). Rendered by both the portal and field layouts — they
 * are the same product seen on different hardware, and neither is customer
 * facing, so they share the register.
 *
 * It lives on the root element rather than a wrapper because overlays portal
 * into <body> and must inherit it.
 *
 * Full page loads are covered before first paint by the script in
 * lib/theme.ts; this component handles client-side navigation in and out of
 * the operations surfaces, where that script never re-runs. The one-frame gap
 * on a client-side entry is invisible in practice — the roles it flips only
 * show on interactive chrome.
 */
export function OperationsSurface() {
  useEffect(() => {
    document.documentElement.setAttribute('data-surface', 'ops')

    return () => {
      document.documentElement.removeAttribute('data-surface')
    }
  }, [])

  return null
}
