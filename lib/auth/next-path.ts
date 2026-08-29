/**
 * Validation for the `?next=` redirect target on the sign-in flow.
 *
 * The parameter round-trips through the browser, so it is untrusted input: an
 * unchecked redirect target is an open-redirect vulnerability (send staff a
 * login link whose `next` points at a look-alike site and harvest the retry).
 * Only in-app operations paths are honoured; anything else falls back to the
 * portal home.
 */

export const DEFAULT_SIGNED_IN_PATH = '/portal'

/**
 * Whole-segment match on the two gated surfaces. Requiring the leading `/` to
 * be followed immediately by `portal` or `field` rejects absolute URLs
 * (`https://…`), scheme-relative ones (`//evil`), and look-alike segments
 * (`/portal-status`); the closing `\/|\?|$` keeps `/portalx` out while
 * allowing sub-paths and query strings.
 */
const OPS_PATH_PATTERN = /^\/(portal|field)(\/|\?|$)/

/** Returns `raw` when it is a safe in-app target, else the portal home. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !OPS_PATH_PATTERN.test(raw)) {
    return DEFAULT_SIGNED_IN_PATH
  }

  return raw
}
