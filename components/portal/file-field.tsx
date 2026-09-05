'use client'

import { useEffect, useRef } from 'react'

import { FieldError } from '@/components/ui/field-error'
import {
  acceptAttributeFor,
  formatByteSize,
  MAX_DOCUMENT_BYTES,
  oversizedFiles,
  type DocumentKind,
} from '@/lib/domain/document'

/**
 * Choosing files to upload.
 *
 * Extracted from the attach dialog when the inspection dialog needed the same
 * control (capability C2). What is shared is not markup for its own sake — it
 * is two decisions with reasons, and a second copy of either would drift:
 *
 * - **The visible trigger is a real `<label>`.** That is the only element that
 *   opens a file picker without script, so the native input keeps the keyboard
 *   and the operating system's own dialog while the product draws the button.
 * - **The name is a `<span>` pointed at by `aria-labelledby`, not a second
 *   `<label>`.** Two labelling elements would give the control two names and
 *   have a screen reader read both.
 *
 * The parent owns the selection, because the parent is what submits it and
 * what has to clear it after a partial failure. Clearing is why the input's
 * own value is watched here: setting `files` back to empty from outside has to
 * empty the picker too, or the control keeps naming a file that is no longer
 * going to be sent.
 */

interface FileFieldProps {
  /** Unique on the screen. Two of these in one dialog would collide. */
  id: string
  kind: DocumentKind
  /** What is being chosen — "Photographs", "File". */
  label: string
  files: readonly File[]
  onChange: (files: File[]) => void
  /** Photographs, plural. An IC and a slip are one file each. */
  multiple?: boolean
  disabled?: boolean
  /** Replaces the sentence about formats and size. */
  hint?: React.ReactNode
}

export function FileField({
  id,
  kind,
  label,
  files,
  onChange,
  multiple,
  disabled,
  hint,
}: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const oversized = oversizedFiles(files)
  const labelId = `${id}-label`

  useEffect(() => {
    if (files.length === 0 && inputRef.current) {
      inputRef.current.value = ''
    }
  }, [files.length])

  return (
    <div className="grid gap-sm">
      <span id={labelId} className="text-body-sm-strong text-foreground">
        {label}
      </span>

      <div className="flex flex-wrap items-center gap-md">
        <label
          htmlFor={id}
          className={
            disabled
              ? 'inline-flex h-[32px] items-center gap-xs rounded-md border border-border bg-card px-md text-button-md text-muted-foreground opacity-60'
              : 'inline-flex h-[32px] cursor-pointer items-center gap-xs rounded-md border border-border bg-card px-md text-button-md text-foreground transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted'
          }
        >
          {multiple ? 'Choose files' : 'Choose file'}
        </label>
        <input
          ref={inputRef}
          id={id}
          type="file"
          aria-labelledby={labelId}
          accept={acceptAttributeFor(kind)}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => onChange(Array.from(event.target.files ?? []))}
        />
        <span className="text-body-sm text-muted-foreground">{describe(files)}</span>
      </div>

      {oversized.length > 0 ? (
        <FieldError
          message={`${oversized.length === 1 ? oversized[0]!.name : `${oversized.length} files`} is larger than ${megabytes()} MB. A photograph taken on a phone is usually well under it.`}
        />
      ) : (
        <p className="text-caption text-muted-foreground">
          {hint ?? formatsAndSize(kind, multiple)}
        </p>
      )}
    </div>
  )
}

/**
 * What the picker says when the caller has nothing more specific to add.
 *
 * **It names no retention period, and neither should any caller.** Every kind
 * has one and a file really is deleted when it runs out, but the number is
 * configuration rather than code — prd.md §13 says so, and capability F3 is
 * the screen that will let Jason edit it without going through a developer.
 * Copy that states "two years" is a second copy of that setting, in the one
 * place nothing will think to update.
 */
function formatsAndSize(kind: DocumentKind, multiple?: boolean): string {
  const formats = kind === 'inspection_photo' ? 'JPEG, PNG or WebP' : 'JPEG, PNG, WebP or PDF'

  return `${formats}, up to ${megabytes()} MB${multiple ? ' each' : ''}.`
}

function describe(files: readonly File[]): string {
  if (files.length === 0) {
    return 'No file chosen'
  }

  if (files.length === 1) {
    return `${files[0]!.name} · ${formatByteSize(files[0]!.size)}`
  }

  return `${files.length} files`
}

function megabytes(): number {
  return Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))
}
