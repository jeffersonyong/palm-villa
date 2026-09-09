/**
 * The one place the product talks to a mail service (capability A8).
 *
 * Resend over its REST API, with no dependency: the surface used is one
 * endpoint, five body fields and one response field, and `lib/auth/access-
 * token.ts` already set the precedent of declining a package for something
 * this small. What the SDK would add — typed shapes, and the webhook
 * signature helper — matters the day bounces are handled, and that is the day
 * to take it (architecture.md §9).
 *
 * ── Classification is the whole of the interesting behaviour ───────────────
 *
 * Which failures are worth trying again decides whether a guest gets their
 * confirmation. It is a pure function over an HTTP status, and it is the only
 * thing here that is tested; what is left is about fifteen lines of plumbing.
 *
 * **Read the status, never the sentence.** lib/db/documents.ts learned this
 * from Storage: matching on a message meant any future rewording changed the
 * behaviour. The one place a body field is read is the 409, where Resend
 * documents two opposite meanings under one status — and `name` is its
 * machine-readable enum, the same kind of value as `statusCode`, not prose.
 */

/** Resend's send endpoint. */
const ENDPOINT = 'https://api.resend.com/emails'

/** Per attempt. A hung socket must not eat the whole function's budget. */
const TIMEOUT_MS = 8_000

/**
 * Two, and only for a failure that might not repeat.
 *
 * There is no retry cron to fall back on — vercel.json holds two crons and two
 * is the Hobby ceiling (architecture.md §10) — so this is the whole of the
 * second chance. It is bounded to a couple of seconds because it runs inside
 * `after()`, sharing a function's duration with the accounting pack.
 */
const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 1_000

export type SendFailureClass =
  /** `fetch` rejected — DNS, TLS, a socket. Nothing was sent. */
  | 'unreachable'
  /** Our own timeout fired. It may or may not have sent; the key protects us. */
  | 'timed_out'
  /** 429. */
  | 'throttled'
  /** 5xx. */
  | 'provider_down'
  /** 409, same key already in flight. Somebody else is sending it — stop. */
  | 'in_flight'
  /** Any other 4xx. A human problem; retrying cannot fix it. */
  | 'rejected'
  /** 2xx whose body carried no id. */
  | 'unreadable'
  /** No API key is configured, so this deployment does not send. */
  | 'not_configured'

export interface SendFailure {
  class: SendFailureClass
  status: number | null
  code: string | null
}

export type SendResult = { ok: true; providerId: string } | { ok: false; failure: SendFailure }

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
  /**
   * Derived from the booking and the kind, never from the attempt — so a
   * retry, or an `after()` callback the platform runs twice, cannot send a
   * second copy. Resend holds a key for 24 hours and replays the first result.
   */
  idempotencyKey: string
}

/** Which HTTP answer means what. Pure, and the only tested part of this file. */
export function classify(status: number, code: string | null): SendFailure {
  if (status === 429) {
    return { class: 'throttled', status, code }
  }

  if (status >= 500) {
    return { class: 'provider_down', status, code }
  }

  if (status === 409) {
    // Two opposite meanings under one status. `concurrent_idempotent_requests`
    // means an attempt with our key is already running, so the email is on its
    // way and a second try would be the duplicate we are avoiding.
    // `invalid_idempotent_request` means the same key with a different body,
    // which is our bug and is not fixed by repeating it.
    return code === 'concurrent_idempotent_requests'
      ? { class: 'in_flight', status, code }
      : { class: 'rejected', status, code }
  }

  return { class: 'rejected', status, code }
}

/** Whether trying the same message again could plausibly do better. */
export function isRetryable(failure: SendFailureClass): boolean {
  return (
    failure === 'unreachable' ||
    failure === 'timed_out' ||
    failure === 'throttled' ||
    failure === 'provider_down'
  )
}

export async function sendEmail(
  apiKey: string,
  from: string,
  message: OutgoingEmail,
): Promise<SendResult> {
  let last: SendFailure = { class: 'unreachable', status: null, code: null }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await attemptSend(apiKey, from, message)

    if (result.ok || !isRetryable(result.failure.class)) {
      return result
    }

    last = result.failure

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS)
    }
  }

  return { ok: false, failure: last }
}

async function attemptSend(
  apiKey: string,
  from: string,
  message: OutgoingEmail,
): Promise<SendResult> {
  let response: Response

  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'

    return {
      ok: false,
      failure: { class: timedOut ? 'timed_out' : 'unreachable', status: null, code: null },
    }
  }

  const body = await readBody(response)

  if (!response.ok) {
    return { ok: false, failure: classify(response.status, body.name) }
  }

  return body.id === null
    ? { ok: false, failure: { class: 'unreadable', status: response.status, code: null } }
    : { ok: true, providerId: body.id }
}

/**
 * Resend answers JSON either way — `{ id }` on success, `{ name, message }` on
 * refusal. A body that is neither is not an error worth its own class: the
 * status has already said what happened.
 */
async function readBody(response: Response): Promise<{ id: string | null; name: string | null }> {
  try {
    const parsed: unknown = await response.json()

    if (typeof parsed !== 'object' || parsed === null) {
      return { id: null, name: null }
    }

    const record = parsed as Record<string, unknown>

    return {
      id: typeof record.id === 'string' ? record.id : null,
      name: typeof record.name === 'string' ? record.name : null,
    }
  } catch {
    return { id: null, name: null }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
