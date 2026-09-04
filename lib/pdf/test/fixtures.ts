/**
 * Real one-pixel images, for tests that need pdf-lib to actually embed
 * something.
 *
 * lib/db/test/factory.ts keeps `TEST_PNG` and `TEST_PDF` as headers only —
 * enough for `sniffMimeType` and nothing more — and that is the right fixture
 * for storage tests, where the bytes are never opened. A renderer test opens
 * them, so these are complete files: the smallest valid PNG and JPEG there
 * are, inlined as base64 rather than committed as binaries nobody can review
 * in a diff. Both decode to a single pixel.
 */

export const ONE_PIXEL_PNG: Uint8Array = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
)

export const ONE_PIXEL_JPEG: Uint8Array = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
    'base64',
  ),
)
