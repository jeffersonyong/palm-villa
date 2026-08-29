/** Where the explicit theme choice is persisted. */
export const THEME_STORAGE_KEY = 'pv-theme'

/**
 * Light is the product's default and the only two states are explicit choices.
 * The OS preference is deliberately not followed — see the resolution note in
 * app/globals.css.
 */
export type ThemePreference = 'light' | 'dark'

/**
 * Browser chrome colours, mirroring the page ground — `canvas` / `ink`
 * (design.md). The `themeColor` viewport export cannot vary by `data-theme`,
 * so the two places that set the theme also rewrite the meta tag.
 */
const THEME_COLOR: Record<ThemePreference, string> = {
  light: '#ffffff',
  dark: '#131417',
}

function applyThemeColorMeta(preference: ThemePreference): void {
  let meta = document.querySelector('meta[name="theme-color"]')

  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }

  meta.setAttribute('content', THEME_COLOR[preference])
}

/**
 * Applies the stored theme before first paint.
 *
 * Inlined into <head> as a blocking script: without it, a reader who chose dark
 * would see one frame of light. Kept dependency-free and wrapped in try/catch
 * because storage access throws in some privacy modes — and a failure here must
 * fall through to the light default, not break the page.
 */
export const themeInitScript = `
(function () {
  try {
    // The monochrome operations register (design.md — two accents, one
    // system) is keyed off <html> so overlays portaled into <body> inherit it
    // too. Set from the pathname here so the first paint is already
    // monochrome; OperationsSurface keeps it in sync across client-side
    // navigation. Matches whole segments so a future /portal-status route
    // does not get swept in.
    var path = location.pathname;
    var isOps = ['/portal', '/field'].some(function (root) {
      return path === root || path.indexOf(root + '/') === 0;
    });
    if (isOps) {
      document.documentElement.setAttribute('data-surface', 'ops');
    }
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
      // The meta tag may not be parsed yet at this point in <head>; create it
      // if needed so the chrome never reads the wrong ground.
      var meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      meta.setAttribute(
        'content',
        stored === 'dark' ? '${THEME_COLOR.dark}' : '${THEME_COLOR.light}'
      );
    }
  } catch (e) {}
})();
`

/* ---------------------------------------------------------------------------
   A minimal external store over localStorage, so the toggle can read it with
   `useSyncExternalStore` instead of syncing it into state from an effect.
   Nothing here touches `window` at module scope, so the file stays safe to
   import from a server component.
   --------------------------------------------------------------------------- */

const listeners = new Set<() => void>()

/** `getSnapshot` must be cheap and referentially stable, hence the cache. */
let cached: ThemePreference | null = null

function read(): ThemePreference {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    // Storage unavailable (private mode, blocked cookies) — show the default.
    return 'light'
  }
}

export function subscribeToTheme(onChange: () => void): () => void {
  listeners.add(onChange)

  // Another tab changing the preference should update this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return
    cached = null
    onChange()
  }

  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function getThemeSnapshot(): ThemePreference {
  cached ??= read()
  return cached
}

/** The server cannot know the stored choice, so it renders the default. */
export function getThemeServerSnapshot(): ThemePreference {
  return 'light'
}

/**
 * Writes the preference and flips `data-theme`. Because every colour role
 * resolves through `light-dark()`, that attribute is the entire override.
 */
export function setThemePreference(preference: ThemePreference): void {
  const root = document.documentElement

  try {
    root.setAttribute('data-theme', preference)
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Persisting failed; still apply for this page view.
    root.setAttribute('data-theme', preference)
  }

  applyThemeColorMeta(preference)

  cached = preference
  for (const listener of listeners) listener()
}
