import type {
  BookingEmailModel,
  EmailQuote,
  EmailRow,
  EmailStatus,
  EmailTransfer,
} from '@/lib/domain/booking-email'

/**
 * The one place email HTML exists (capability A8).
 *
 * `lib/pdf/accounting-pack.ts`'s seat in a third medium: it draws whatever
 * `lib/domain/booking-email.ts` decided and decides nothing itself. No
 * database, no network, no branching on a booking — every string it renders
 * was chosen upstream, which is what lets the wording be tested by inspection
 * and this file be tested for markup alone.
 *
 * ── Why the tokens are flat hex ────────────────────────────────────────────
 *
 * The same reason the PDF renderer holds `rgb(0.11, 0.11, 0.12)` rather than a
 * theme role: an email client cannot read a CSS variable, and `color-mix()`
 * does not exist there. So design.md's light-theme values are transcribed here
 * as literals, and the test asserts every colour in the output is one of them
 * — that assertion is what keeps this file honest as the tokens move.
 *
 * ── Two departures from the product's styling, both deliberate ─────────────
 *
 * **Light only.** design.md's dark theme is a product surface's concern; an
 * email client applies its own inversion on top of whatever it is given, and a
 * palette designed for two themes is one neither client renders as intended.
 * `color-scheme: light` says so explicitly.
 *
 * **Tables, and inline styles on every element.** Not a preference — Outlook
 * on Windows renders through Word, which supports neither flexbox nor grid
 * nor a `<style>` block reliably. This is the one file in the product where
 * that is true; nothing here is a pattern to copy elsewhere.
 *
 * Unlike the pack, there is **no `toWinAnsi` analogue**: an email is UTF-8, so
 * a guest named "Nurul ‘Aisyah" renders as written and nothing is lost.
 */

/** design.md light theme, transcribed. The renderer's whole palette. */
const INK = '#111111'
const MUTE = '#6b6b6b'
const CANVAS = '#ffffff'
const CANVAS_SUNK = '#f3f3f3'
const HAIRLINE = '#e8e8e8'
const BRAND_DEEP = '#0e6b64'

/**
 * The two status hues and their tints — the one colour here that is not the
 * brand's, which is design.md's rule on every surface: semantic colour carries
 * meaning and is never decorative. Amber is the guest's turn; the chip under
 * "Almost done" and the panel that says how to pay share it because they are
 * one message. Green is done.
 *
 * The tints are globals.css's badge and notice constructions —
 * `color-mix(in oklab, <hue> 10%, canvas)` for a chip, 14% for a panel —
 * computed in oklab and written down, since an email client cannot mix. Move a
 * hue in design.md and these have to be recomputed; the test's whitelist is
 * what notices one typed in by eye instead.
 */
const WARNING = '#d97706'
const WARNING_DEEP = '#92400e'
const WARNING_TINT = '#fdf2ea'
const WARNING_PANEL = '#fcece1'
const POSITIVE = '#1fa552'
const POSITIVE_DEEP = '#166534'
const POSITIVE_TINT = '#ecf6ed'

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace"
/**
 * Fraunces is not loaded — a webfont in an email is a request most clients
 * refuse — so this is the fallback design.md already names for it. The
 * customer surface keeps a serif display headline either way, which is the
 * half of the rule that survives the medium.
 */
const DISPLAY = "Fraunces, Georgia, 'Times New Roman', serif"

export interface RenderedEmail {
  html: string
  text: string
}

export function renderBookingEmail(model: BookingEmailModel): RenderedEmail {
  return { html: renderHtml(model), text: renderText(model) }
}

/**
 * Every interpolated value passes through here.
 *
 * Guest names, vehicle registrations, line descriptions and bank details are
 * all typed by somebody — a customer on the public form or a staff member in
 * settings — so this is the one genuine injection surface in the slice. The
 * pure model deliberately does no escaping, because escaping belongs to the
 * medium: the same string is rendered raw in the plain-text body.
 */
function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderHtml(model: BookingEmailModel): string {
  return [
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(model.preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CANVAS_SUNK};margin:0;padding:24px 12px;color-scheme:light">`,
    '<tr><td align="center">',
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${CANVAS};border:1px solid ${HAIRLINE};border-radius:12px">`,
    `<tr><td style="padding:32px 28px 28px 28px;font-family:${SANS};font-size:14px;line-height:21px;color:${INK}">`,
    eyebrow(model.footer.propertyName),
    `<h1 style="margin:12px 0 0 0;font-family:${DISPLAY};font-size:28px;line-height:34px;font-weight:600;letter-spacing:-0.56px;color:${INK}">${escape(model.headline)}</h1>`,
    statusChip(model.status),
    `<p style="margin:12px 0 0 0;font-size:16px;line-height:25px;color:${INK}">${escape(model.intro)}</p>`,
    `<p style="margin:12px 0 0 0;font-size:14px;line-height:21px;color:${MUTE}">Reference <span style="font-family:${MONO};color:${INK}">${escape(model.reference)}</span></p>`,
    section('What you booked', rows(model.facts)),
    model.quote === null ? '' : section('Price', quote(model.quote)),
    model.depositNote === null
      ? ''
      : `<p style="margin:12px 0 0 0;font-size:12px;line-height:16px;color:${MUTE}">${escape(model.depositNote)}</p>`,
    model.transfer === null ? '' : transfer(model.transfer),
    model.arrival.length === 0 ? '' : arrival(model.arrival),
    action(model),
    footer(model),
    '</td></tr></table></td></tr></table>',
  ]
    .filter((part) => part !== '')
    .join('')
}

function eyebrow(text: string, colour: string = MUTE): string {
  return `<p style="margin:0;font-size:11px;line-height:14px;font-weight:500;letter-spacing:0.55px;text-transform:uppercase;color:${colour}">${escape(text)}</p>`
}

/**
 * The status chip: design.md's badge — a 6px rectangle, tint under deep text
 * — with a mark in the mid hue in front of the label.
 *
 * The marks are text glyphs, not emoji and not images. An emoji hourglass
 * renders in whatever colours each client ships and cannot be tinted; an
 * image is blocked until the reader allows it. A filled circle and a tick are
 * in every system font, take the colour they are given, and read the same in
 * every client — the dot is also the status idiom design.md already uses.
 */
function statusChip(status: EmailStatus): string {
  const tone =
    status.tone === 'confirmed'
      ? { ground: POSITIVE_TINT, text: POSITIVE_DEEP, mark: POSITIVE, glyph: '✓' }
      : { ground: WARNING_TINT, text: WARNING_DEEP, mark: WARNING, glyph: '●' }

  return (
    '<p style="margin:12px 0 0 0">' +
    `<span style="display:inline-block;padding:3px 8px;background-color:${tone.ground};border-radius:6px;font-size:12px;line-height:16px;font-weight:500;color:${tone.text}">` +
    `<span style="color:${tone.mark}">${tone.glyph}</span>&nbsp;${escape(status.label)}</span></p>`
  )
}

function section(heading: string, body: string): string {
  return `<div style="margin-top:24px">${eyebrow(heading)}${body}</div>`
}

function rows(items: readonly EmailRow[]): string {
  const cells = items
    .map(
      (row) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid ${HAIRLINE};font-size:14px;line-height:21px;color:${MUTE}">${escape(row.label)}</td>` +
        `<td align="right" style="padding:8px 0;border-bottom:1px solid ${HAIRLINE};font-size:14px;line-height:21px;color:${INK}">${escape(row.value)}</td></tr>`,
    )
    .join('')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">${cells}</table>`
}

function quote(model: EmailQuote): string {
  const lines = model.rows
    .map(
      (row) =>
        `<tr><td style="padding:6px 0;font-size:13px;line-height:18px;color:${MUTE}">${escape(row.label)}</td>` +
        `<td align="right" style="padding:6px 0;font-size:13px;line-height:18px;font-weight:500;color:${INK}">${escape(row.value)}</td></tr>`,
    )
    .join('')

  const total =
    `<tr><td style="padding:12px 0 0 0;border-top:1px solid ${HAIRLINE};font-size:14px;line-height:21px;font-weight:500;color:${INK}">${escape(model.totalLabel)}</td>` +
    `<td align="right" style="padding:12px 0 0 0;border-top:1px solid ${HAIRLINE};font-size:22px;line-height:28px;font-weight:600;color:${INK}">${escape(model.totalDisplay)}</td></tr>`

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">${lines}${total}</table>`
}

/**
 * The call to action, and the only panel in the email with a hue.
 *
 * The whole section sits on the amber panel tint — the same amber as the
 * status chip, because "your turn" and "here is what to do" are one message —
 * and the option cards are canvas on it, a step in tone away from what they
 * sit on, which is how design.md draws structure everywhere. The instruction
 * that used to sit in its own grey box is plain text inside the panel; a grey
 * box inside an amber one was two containers saying one thing.
 */
function transfer(model: EmailTransfer): string {
  const options = model.options
    .map(
      (option) =>
        `<div style="margin-top:8px;padding:14px;background-color:${CANVAS};border:1px solid ${HAIRLINE};border-radius:6px">` +
        `<p style="margin:0;font-size:14px;line-height:21px;font-weight:500;color:${INK}">${escape(option.label)}</p>` +
        `<p style="margin:4px 0 0 0;font-size:12px;line-height:16px;color:${MUTE}">${escape(option.detail)}</p></div>`,
    )
    .join('')

  const intro =
    model.accountsIntro === null
      ? ''
      : `<p style="margin:16px 0 0 0;font-size:13px;line-height:18px;font-weight:500;color:${INK}">${escape(model.accountsIntro)}</p>`

  const accounts =
    model.accounts.length > 0
      ? accountList(model.accounts)
      : `<p style="margin:16px 0 0 0;font-size:13px;line-height:18px;color:${INK}">${escape(model.noAccountsNote ?? '')}</p>`

  const instruction = `<p style="margin:16px 0 0 0;font-size:13px;line-height:18px;color:${INK}">${escape(model.instruction)}</p>`

  return (
    `<div style="margin-top:24px;padding:20px;background-color:${WARNING_PANEL};border-radius:12px">` +
    `${eyebrow('How to pay', WARNING_DEEP)}${options}${intro}${accounts}${instruction}</div>`
  )
}

/**
 * The accounts as alternatives: name against number, an "or" between them.
 * The number is the thing a guest copies, so it is mono and a size up.
 */
function accountList(accounts: readonly EmailRow[]): string {
  const cells = accounts
    .map((account, index) => {
      // A rule either side of the word, so the alternatives read as one
      // choice rather than a list. The rule is a zero-height div with a top
      // border, vertically centred by the cell, which is the one way to draw
      // a line beside text that every client agrees on.
      //
      // It takes the word's own colour rather than the hairline: this is the
      // one rule in the product that is not drawn on canvas, and a hairline
      // meant for white all but vanishes on the amber panel.
      const divider =
        index === 0
          ? ''
          : `<tr><td colspan="2" style="padding:6px 0">` +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
            `<td width="50%" valign="middle"><div style="border-top:1px solid ${MUTE};height:0;line-height:0;font-size:0">&nbsp;</div></td>` +
            `<td style="padding:0 10px;font-size:11px;line-height:14px;font-weight:500;letter-spacing:0.55px;text-transform:uppercase;color:${MUTE};white-space:nowrap">or</td>` +
            `<td width="50%" valign="middle"><div style="border-top:1px solid ${MUTE};height:0;line-height:0;font-size:0">&nbsp;</div></td>` +
            `</tr></table></td></tr>`

      return (
        divider +
        `<tr><td style="padding:6px 0;font-size:14px;line-height:21px;color:${MUTE}">${escape(account.label)}</td>` +
        `<td align="right" style="padding:6px 0;font-family:${MONO};font-size:15px;line-height:21px;color:${INK}">${escape(account.value)}</td></tr>`
      )
    })
    .join('')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px">${cells}</table>`
}

function arrival(sentences: readonly string[]): string {
  const body = sentences
    .map(
      (sentence) =>
        `<p style="margin:8px 0 0 0;font-size:14px;line-height:21px;color:${INK}">${escape(sentence)}</p>`,
    )
    .join('')

  return section('When you arrive', body)
}

function action(model: BookingEmailModel): string {
  if (model.action === null) {
    return ''
  }

  const href = escape(model.action.url)

  return (
    '<div style="margin-top:28px">' +
    `<a href="${href}" style="display:inline-block;padding:10px 18px;background-color:${BRAND_DEEP};color:${CANVAS};font-size:13px;line-height:20px;font-weight:500;text-decoration:none;border-radius:6px">${escape(model.action.label)}</a>` +
    // The raw URL is restated because a guest forwards this into WhatsApp,
    // where a button is a word and the link is what survives.
    `<p style="margin:12px 0 0 0;font-size:12px;line-height:16px;color:${MUTE};word-break:break-all">${href}</p>` +
    `<p style="margin:8px 0 0 0;font-size:12px;line-height:16px;color:${MUTE}">${escape(model.action.note)}</p>` +
    '</div>'
  )
}

function footer(model: BookingEmailModel): string {
  const phones = model.footer.phones.map(escape).join(' · ')
  const notes = model.footer.notes
    .map(
      (note) =>
        `<p style="margin:4px 0 0 0;font-size:12px;line-height:16px;color:${MUTE}">${escape(note)}</p>`,
    )
    .join('')

  return (
    `<div style="margin-top:28px;padding-top:20px;border-top:1px solid ${HAIRLINE}">` +
    `<p style="margin:0;font-size:12px;line-height:16px;color:${MUTE}">${escape(model.footer.propertyName)} · Call or WhatsApp us on ${phones}</p>` +
    `${notes}</div>`
  )
}

/**
 * The plain-text alternative.
 *
 * Not a courtesy: a client that refuses HTML shows this, and a guest whose
 * mail app strips styling should still be able to make the transfer. Every
 * figure the HTML carries appears here too, which the tests assert — a fact
 * that lives only in the markup is one half the recipients never see.
 */
function renderText(model: BookingEmailModel): string {
  const parts: string[] = [
    model.headline.toUpperCase(),
    `Status: ${model.status.label}`,
    '',
    model.intro,
    '',
    `Reference: ${model.reference}`,
    '',
    'WHAT YOU BOOKED',
    ...model.facts.map((row) => `  ${row.label}: ${row.value}`),
  ]

  if (model.quote) {
    parts.push('', 'PRICE')
    parts.push(...model.quote.rows.map((row) => `  ${row.label}: ${row.value}`))
    parts.push(`  ${model.quote.totalLabel}: ${model.quote.totalDisplay}`)
  }

  if (model.depositNote) {
    parts.push('', model.depositNote)
  }

  if (model.transfer) {
    parts.push('', 'HOW TO PAY')
    for (const option of model.transfer.options) {
      parts.push(`  ${option.label}`, `    ${option.detail}`)
    }

    if (model.transfer.accountsIntro) {
      parts.push('', model.transfer.accountsIntro)
    }

    if (model.transfer.accounts.length > 0) {
      parts.push(
        model.transfer.accounts
          .map((row) => `  ${row.label}: ${row.value}`)
          .join('\n  -------- or --------\n'),
      )
    } else if (model.transfer.noAccountsNote) {
      parts.push(`  ${model.transfer.noAccountsNote}`)
    }

    parts.push('', model.transfer.instruction)
  }

  if (model.arrival.length > 0) {
    parts.push('', 'WHEN YOU ARRIVE', ...model.arrival.map((sentence) => `  ${sentence}`))
  }

  if (model.action) {
    parts.push('', `${model.action.label}: ${model.action.url}`, model.action.note)
  }

  parts.push(
    '',
    '—',
    `${model.footer.propertyName} · Call or WhatsApp us on ${model.footer.phones.join(' · ')}`,
    ...model.footer.notes,
  )

  return parts.join('\n')
}
