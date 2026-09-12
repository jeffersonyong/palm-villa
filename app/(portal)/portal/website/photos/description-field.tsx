'use client'

import { FieldError } from '@/components/ui/field-error'
import { Textarea } from '@/components/ui/textarea'
import { MAX_ALT_TEXT_LENGTH } from '@/lib/domain/site-image'

/**
 * What a photograph shows, in words (capability F7).
 *
 * The description is the image's alt text: read aloud to a visitor who cannot
 * see it, and read by a search engine. It is not the card's copy, which stays
 * with the landing page and says only what is confirmed. The hint says what a
 * good one looks like, and that a guest is never named in it — the audit trail
 * keeps every description, and nothing written there can be taken back.
 */
export function DescriptionField({
  id,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
}) {
  const hintId = `${id}-hint`

  return (
    <div className="grid gap-sm">
      <label htmlFor={id} className="text-body-sm-strong text-foreground">
        Description
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={MAX_ALT_TEXT_LENGTH}
        rows={2}
        aria-describedby={hintId}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
      />
      <div className="flex items-start justify-between gap-md">
        <p id={hintId} className="text-caption text-muted-foreground">
          What the photo shows, for someone who can&rsquo;t see it — for example, &ldquo;The outdoor
          pool with sun loungers in the afternoon&rdquo;. Never name a guest.
        </p>
        <p className="shrink-0 text-caption text-muted-foreground tabular-nums">
          {value.length}/{MAX_ALT_TEXT_LENGTH}
        </p>
      </div>
      {error ? <FieldError message={error} /> : null}
    </div>
  )
}
