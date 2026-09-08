'use client'

import { useState } from 'react'

import { FormSection } from '@/components/portal/form-section'
import { Card } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderRow,
  TableHeader,
  TableRow,
  TableRowHead,
} from '@/components/ui/table'
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS } from '@/lib/domain/document'
import { retentionDraftFrom, type RetentionDraft } from '@/lib/domain/settings-checks'
import type { PropertySettings } from '@/lib/domain/settings'

import { saveRetentionAction } from './actions'
import { SettingsForm } from './settings-form'

/**
 * How long each kind of document is kept (capability F3, prd.md §13).
 *
 * The four kinds are fixed and only the periods are editable, which is
 * deliberate: a fifth kind of document is a storage bucket, a permission and a
 * retention decision, not a row somebody types on a settings screen.
 *
 * **The anchor differs by kind and is stated per row**, because "twelve months"
 * means nothing without saying twelve months from what. An identity document
 * counts from the guest's last night — so amending a stay moves it — and
 * everything else counts from the day the file was taken.
 */

interface DocumentsTabProps {
  settings: PropertySettings
}

/** What each period counts from. The anchors `attach_document()` applies. */
const ANCHOR: Readonly<Record<string, string>> = {
  identity: 'Counted from the guest’s check-out. Amending a stay moves it.',
  payment_slip: 'Counted from when the slip was uploaded.',
  inspection_photo: 'Counted from when the photograph was taken.',
  accounting_pack: 'Counted from when the pack was assembled.',
}

/** Why a period is what it is, where the reason is not obvious. */
const REASON: Readonly<Record<string, string>> = {
  payment_slip: 'An accounting record. Seven years is the usual requirement.',
  accounting_pack: 'An accounting record. Seven years is the usual requirement.',
}

export function DocumentsTab({ settings }: DocumentsTabProps) {
  const saved = retentionDraftFrom(settings)
  const [draft, setDraft] = useState<RetentionDraft>(saved)

  return (
    <SettingsForm
      action={saveRetentionAction}
      draft={draft}
      saved={saved}
      expectedUpdatedAt={settings.settingsUpdatedAt}
      savedTitle="Retention periods updated"
    >
      {({ problemFor }) => (
        <Card className="p-card">
          <FormSection title="How long documents are kept">
            <Table scrollX>
              <TableHeader>
                <TableHeaderRow>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-right">Kept for (months)</TableHead>
                  <TableHead>Counted from</TableHead>
                </TableHeaderRow>
              </TableHeader>
              <TableBody>
                {DOCUMENT_KINDS.map((kind) => (
                  <TableRow key={kind}>
                    <TableRowHead>
                      {DOCUMENT_KIND_LABELS[kind]}
                      {REASON[kind] ? (
                        <span className="mt-xxs block text-caption font-normal text-muted-foreground">
                          {REASON[kind]}
                        </span>
                      ) : null}
                    </TableRowHead>
                    <TableCell className="text-right align-top">
                      <div className="inline-grid gap-xs text-left">
                        <Input
                          aria-label={`Months to keep ${DOCUMENT_KIND_LABELS[kind]}`}
                          value={draft[kind]}
                          inputMode="numeric"
                          autoComplete="off"
                          aria-invalid={problemFor(`retention.${kind}`) ? true : undefined}
                          className="w-[110px] text-right tabular-nums"
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, [kind]: event.target.value }))
                          }
                        />
                        <FieldError message={problemFor(`retention.${kind}`)} />
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-muted-foreground">
                      {ANCHOR[kind]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Notice className="mt-lg">
              Changing a period applies to files already held, not only to new ones — shorten
              identity documents to six months and every one on file is re-dated to six months after
              its stay. Anything that is then already past its date stops being viewable at once and
              is deleted on the next nightly run. The record that the file existed, who uploaded it
              and who opened it is kept either way.
            </Notice>
          </FormSection>
        </Card>
      )}
    </SettingsForm>
  )
}
