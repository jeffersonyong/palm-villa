/**
 * The tones a status may be drawn in (design.md §Color roles).
 *
 * Four semantic pairs and a neutral, and no more. design.md constructs each one
 * as a 10% mix of a mid hue under `*-deep` text, so a fifth tone is not a class
 * to add here but a token pair that does not exist — which is exactly what
 * stops a screen inventing a colour meaning.
 *
 * ── Why this is its own file ──────────────────────────────────────────────
 *
 * It lived in `booking-status-badge.tsx` while a booking was the only thing
 * with a status. The units board gave a second thing one, and a unit's state is
 * not a booking's — so `unit-status-badge.tsx` importing a type called
 * `BookingStatusTone` would have said the two are the same table when what they
 * actually share is the palette. Each badge module still owns its own mapping;
 * this owns only the vocabulary they map into.
 */

export type StatusTone = 'positive' | 'warning' | 'negative' | 'active' | 'neutral'
