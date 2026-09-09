import { describe, expect, test } from 'vitest'

import { classify, isRetryable, type SendFailureClass } from './send'

/**
 * Which answer from the mail service means try again.
 *
 * The whole of what is worth testing in the transport, and the reason the POST
 * around it is left untested: get this wrong in one direction and a guest
 * never receives their confirmation because a momentary 503 was treated as
 * final; get it wrong in the other and the product hammers a service that has
 * already refused the message.
 */

describe('classify', () => {
  const cases: ReadonlyArray<[number, string | null, SendFailureClass]> = [
    [429, 'rate_limit_exceeded', 'throttled'],
    [500, null, 'provider_down'],
    [502, null, 'provider_down'],
    [503, 'internal_server_error', 'provider_down'],
    [422, 'validation_error', 'rejected'],
    [401, 'missing_api_key', 'rejected'],
    [403, 'restricted_api_key', 'rejected'],
    [404, 'not_found', 'rejected'],
    [400, null, 'rejected'],
    [409, 'concurrent_idempotent_requests', 'in_flight'],
    [409, 'invalid_idempotent_request', 'rejected'],
    [409, null, 'rejected'],
  ]

  for (const [status, code, expected] of cases) {
    test(`${status}${code === null ? '' : ` ${code}`} is ${expected}`, () => {
      expect(classify(status, code)).toEqual({ class: expected, status, code })
    })
  }

  test('the two 409s are told apart by the code, which is the only body field read', () => {
    expect(classify(409, 'concurrent_idempotent_requests').class).toBe('in_flight')
    expect(classify(409, 'invalid_idempotent_request').class).toBe('rejected')
  })
})

describe('isRetryable', () => {
  test('retries the failures that might not repeat', () => {
    for (const failure of ['unreachable', 'timed_out', 'throttled', 'provider_down'] as const) {
      expect(isRetryable(failure), failure).toBe(true)
    }
  })

  test('never retries a refusal, a duplicate in flight, or a missing key', () => {
    for (const failure of ['rejected', 'in_flight', 'unreadable', 'not_configured'] as const) {
      expect(isRetryable(failure), failure).toBe(false)
    }
  })
})
