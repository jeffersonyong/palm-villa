'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

import { FormSection } from '@/components/portal/form-section'
import { Card } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderRow,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TextAction } from '@/components/ui/text-action'
import { bankAccountsDraftFrom, type BankAccountsDraft } from '@/lib/domain/settings-checks'
import type { PropertySettings } from '@/lib/domain/settings'

import { saveBankAccountsAction } from './actions'
import { SettingsForm } from './settings-form'

/**
 * The accounts a customer transfers to (capability F3, prd.md §10.1).
 *
 * Two accounts exist for one reason: a Bruneian customer already banks with one
 * or the other and transfers within their own bank without a fee or a delay. It
 * is a convenience, not two products — nothing routes on which one a customer
 * picks, and nothing reconciles them differently.
 *
 * They live here rather than in page copy because the day a number changes is
 * the day every transfer instruction has to change with it, and a number pasted
 * into a marketing page is the copy nobody remembers to update.
 */

interface BankAccountsTabProps {
  settings: PropertySettings
}

export function BankAccountsTab({ settings }: BankAccountsTabProps) {
  const saved = bankAccountsDraftFrom(settings)
  const [draft, setDraft] = useState<BankAccountsDraft>(saved)

  function setAccount(index: number, field: 'bankName' | 'accountNumber', value: string) {
    setDraft((current) =>
      current.map((account, position) =>
        position === index ? { ...account, [field]: value } : account,
      ),
    )
  }

  return (
    <SettingsForm
      action={saveBankAccountsAction}
      draft={draft}
      saved={saved}
      expectedUpdatedAt={settings.settingsUpdatedAt}
      savedTitle="Bank accounts updated"
    >
      {({ problemFor }) => (
        <Card className="p-card">
          <FormSection title="Accounts for customer transfers">
            <Table scrollX>
              <TableHeader>
                <TableHeaderRow>
                  <TableHead>Bank</TableHead>
                  <TableHead>Account number</TableHead>
                  <TableHead className="w-[1%]" />
                </TableHeaderRow>
              </TableHeader>
              <TableBody>
                {draft.length === 0 ? (
                  <TableEmpty colSpan={3}>
                    No accounts. Staff will have to read the number off a phone, as they did before.
                  </TableEmpty>
                ) : null}

                {draft.map((account, index) => (
                  <TableRow key={account.key}>
                    <TableCell>
                      <div className="inline-grid gap-xs">
                        <Input
                          aria-label={`Name of bank ${index + 1}`}
                          value={account.bankName}
                          autoComplete="off"
                          placeholder="BIBD"
                          aria-invalid={problemFor(`accounts.${index}.bankName`) ? true : undefined}
                          className="w-[200px]"
                          onChange={(event) => setAccount(index, 'bankName', event.target.value)}
                        />
                        <FieldError message={problemFor(`accounts.${index}.bankName`)} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="inline-grid gap-xs">
                        <Input
                          aria-label={`Account number at bank ${index + 1}`}
                          value={account.accountNumber}
                          autoComplete="off"
                          placeholder="0018-02-0010611"
                          aria-invalid={
                            problemFor(`accounts.${index}.accountNumber`) ? true : undefined
                          }
                          className="w-[240px] font-mono tabular-nums"
                          onChange={(event) =>
                            setAccount(index, 'accountNumber', event.target.value)
                          }
                        />
                        <FieldError message={problemFor(`accounts.${index}.accountNumber`)} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <TextAction
                        aria-label={`Remove the ${account.bankName || 'unnamed'} account`}
                        title={`Remove the ${account.bankName || 'unnamed'} account`}
                        onClick={() =>
                          setDraft((current) => current.filter((row) => row.key !== account.key))
                        }
                      >
                        <X aria-hidden className="size-4" />
                      </TextAction>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-md">
              <TextAction
                onClick={() =>
                  setDraft((current) => [
                    ...current,
                    {
                      key: `new-${crypto.randomUUID()}`,
                      id: null,
                      bankName: '',
                      accountNumber: '',
                    },
                  ])
                }
              >
                <Plus aria-hidden className="size-3.5" />
                Add an account
              </TextAction>
            </div>

            <Notice className="mt-lg">
              A customer is shown the number alone — no account name — and picks whichever bank is
              their own. Nothing shows these to customers yet: the public booking site is phase
              two, and the desk reads them off a phone today.
            </Notice>
          </FormSection>
        </Card>
      )}
    </SettingsForm>
  )
}
