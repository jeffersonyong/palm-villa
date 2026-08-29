'use client'

import { useEffect } from 'react'

/**
 * Marks <html> with the portal's surface attribute, which scopes the
 * monochrome action roles (globals.css). It lives on the root element rather
 * than a wrapper because overlays portal into <body> and must inherit it.
 *
 * Full page loads are covered before first paint by the script in
 * lib/theme.ts; this component handles client-side navigation in and out of
 * the portal, where the pre-paint script never re-runs. The one-frame gap on
 * a client-side entry is invisible in practice — the roles it flips only show
 * on interactive chrome.
 */
export function PortalSurface() {
  useEffect(() => {
    document.documentElement.setAttribute('data-surface', 'portal')

    return () => {
      document.documentElement.removeAttribute('data-surface')
    }
  }, [])

  return null
}
