/**
 * Contact details as supplied by the client on 2026-08-27.
 *
 * [C] 2026-09-05 (N14): all three numbers carry WhatsApp, and all three are
 * shown. A customer picks one and tries another if nobody answers — which is
 * what they do today anyway, and it needs no routing rule nobody has agreed.
 *
 * `whatsappUrl` remains because a single "Message us on WhatsApp" button has to
 * open one chat. It opens the first listed. Every surface that can show a
 * *list* shows all three.
 *
 * **It lives here rather than in the landing page's content module** because
 * the confirmation email needs it too (capability A8), and `lib/domain` may
 * not import from `app/`. `app/(public)/_content/landing.ts` re-exports it, so
 * every existing consumer is unchanged. The email takes it as an *input*
 * rather than importing it, which is what lets the model's tests assert
 * against a fixture instead of against the client's real phone number.
 */
export interface PropertyContactPhone {
  display: string
  whatsappUrl: string
}

export interface PropertyContact {
  phones: readonly PropertyContactPhone[]
  whatsappUrl: string
  instagramHandle: string
  instagramUrl: string
  tiktokHandle: string
  tiktokUrl: string
  mapsUrl: string
}

export const contact: PropertyContact = {
  phones: [
    { display: '+673 8959798', whatsappUrl: 'https://wa.me/6738959798' },
    { display: '+673 8837118', whatsappUrl: 'https://wa.me/6738837118' },
    { display: '+673 8986733', whatsappUrl: 'https://wa.me/6738986733' },
  ],
  whatsappUrl: 'https://wa.me/6738959798',
  instagramHandle: '@palmvilla.bn',
  instagramUrl: 'https://instagram.com/palmvilla.bn',
  tiktokHandle: '@palmvilla.bn',
  tiktokUrl: 'https://tiktok.com/@palmvilla.bn',
  /** Palm Villa, 4.570085, 114.220738. */
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=4.570085,114.220738',
}
