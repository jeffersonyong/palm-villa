'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

import { FormSection } from '@/components/portal/form-section'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { dayPassDraftFrom, type DayPassDraft } from '@/lib/domain/settings-checks'
import type { PropertySettings } from '@/lib/domain/settings'

import { saveDayPassAction } from './actions'
import { SettingsForm } from './settings-form'

/**
 * Day-pass pricing and what a pass admits (capability F3).
 *
 * Three tables, one save. The age bands and the bundles price a pass; the
 * facilities decide what it buys — which is the client's own framing of it (10
 * September 2026: "I will list out all the options so your team can enable or
 * disable whenever you want").
 *
 * ── Two rules worth knowing before editing this ────────────────────────────
 *
 * **The bands have to cover every age from zero, with no gaps and one
 * open-ended band at the end.** Nothing else is a valid price list: an age no
 * band covers has no price at all, and the failure surfaces at a desk weeks
 * later rather than here. The check runs on every keystroke and the save is
 * refused without it.
 *
 * **A bundle names its bands by key, not by name.** So renaming "Child" leaves
 * every bundle intact, and removing a band a bundle still uses is refused by
 * the database, naming the band.
 */

interface DayPassTabProps {
  settings: PropertySettings
}

function newKey(): string {
  return `new-${crypto.randomUUID()}`
}

export function DayPassTab({ settings }: DayPassTabProps) {
  const saved = dayPassDraftFrom(settings)
  const [draft, setDraft] = useState<DayPassDraft>(saved)

  function update(next: Partial<DayPassDraft>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  function setBand(
    index: number,
    field: 'label' | 'minAge' | 'maxAgeExclusive' | 'price',
    value: string,
  ) {
    update({
      bands: draft.bands.map((band, position) =>
        position === index ? { ...band, [field]: value } : band,
      ),
    })
  }

  function setBundle(index: number, field: 'label' | 'price', value: string) {
    update({
      bundles: draft.bundles.map((bundle, position) =>
        position === index ? { ...bundle, [field]: value } : bundle,
      ),
    })
  }

  function setBundleLine(index: number, bandKey: string, value: string) {
    update({
      bundles: draft.bundles.map((bundle, position) =>
        position === index ? { ...bundle, lines: { ...bundle.lines, [bandKey]: value } } : bundle,
      ),
    })
  }

  function setFacility(
    index: number,
    field: 'name' | 'capacity' | 'includedInDayPass',
    value: string | boolean,
  ) {
    update({
      facilities: draft.facilities.map((facility, position) =>
        position === index ? { ...facility, [field]: value } : facility,
      ),
    })
  }

  return (
    <SettingsForm
      action={saveDayPassAction}
      draft={draft}
      saved={saved}
      expectedUpdatedAt={settings.settingsUpdatedAt}
      savedTitle="Day pass updated"
    >
      {({ problemFor }) => (
        <Card className="p-card">
          <FormSection title="Price per person by age">
            <Table scrollX>
              <TableHeader>
                <TableHeaderRow>
                  <TableHead>Band</TableHead>
                  <TableHead className="text-right">From age</TableHead>
                  <TableHead className="text-right">Up to age</TableHead>
                  <TableHead className="text-right">Price (BND)</TableHead>
                  <TableHead className="w-[1%]" />
                </TableHeaderRow>
              </TableHeader>
              <TableBody>
                {draft.bands.length === 0 ? (
                  <TableEmpty colSpan={5}>
                    A day pass needs at least one age band before it can be priced.
                  </TableEmpty>
                ) : null}

                {draft.bands.map((band, index) => (
                  <TableRow key={band.key}>
                    <TableCell>
                      <RowInput
                        label={`Name of band ${index + 1}`}
                        value={band.label}
                        width="w-[180px]"
                        align="left"
                        error={problemFor(`bands.${index}.label`)}
                        onChange={(value) => setBand(index, 'label', value)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowInput
                        label={`Age band ${index + 1} starts at`}
                        value={band.minAge}
                        width="w-[90px]"
                        error={problemFor(`bands.${index}.minAge`)}
                        onChange={(value) => setBand(index, 'minAge', value)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowInput
                        label={`Age band ${index + 1} ends before`}
                        value={band.maxAgeExclusive}
                        width="w-[110px]"
                        placeholder="and above"
                        error={problemFor(`bands.${index}.maxAgeExclusive`)}
                        onChange={(value) => setBand(index, 'maxAgeExclusive', value)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowInput
                        label={`Price for band ${index + 1}`}
                        value={band.price}
                        width="w-[110px]"
                        error={problemFor(`bands.${index}.price`)}
                        onChange={(value) => setBand(index, 'price', value)}
                      />
                    </TableCell>
                    <TableCell>
                      <RemoveRow
                        label={`Remove the ${band.label || 'unnamed'} band`}
                        onClick={() =>
                          update({
                            bands: draft.bands.filter((row) => row.key !== band.key),
                            bundles: draft.bundles.map((bundle) => ({
                              ...bundle,
                              lines: Object.fromEntries(
                                Object.entries(bundle.lines).filter(([key]) => key !== band.key),
                              ),
                            })),
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-md flex items-center gap-lg">
              <TextAction
                onClick={() =>
                  update({
                    bands: [
                      ...draft.bands,
                      {
                        key: newKey(),
                        id: null,
                        label: '',
                        minAge: '',
                        maxAgeExclusive: '',
                        price: '0.00',
                      },
                    ],
                  })
                }
              >
                <Plus aria-hidden className="size-3.5" />
                Add a band
              </TextAction>
            </div>

            <FieldError message={problemFor('bands')} />

            <Notice className="mt-lg">
              The bands have to run from age 0 with no gaps, and the last one is left open-ended so
              an older guest always has a price. “Up to age” is the first age the next band covers —
              a child band ending at 12 means a 12-year-old pays the adult price.
            </Notice>
          </FormSection>

          <FormSection title="Family bundles">
            <Table scrollX>
              <TableHeader>
                <TableHeaderRow>
                  <TableHead>Bundle</TableHead>
                  {draft.bands.map((band) => (
                    <TableHead key={band.key} className="text-right">
                      {band.label || 'Unnamed'}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Price (BND)</TableHead>
                  <TableHead className="w-[1%]" />
                </TableHeaderRow>
              </TableHeader>
              <TableBody>
                {draft.bundles.length === 0 ? (
                  <TableEmpty colSpan={draft.bands.length + 3}>
                    No bundles. Every party is priced per person.
                  </TableEmpty>
                ) : null}

                {draft.bundles.map((bundle, index) => (
                  <TableRow key={bundle.key}>
                    <TableCell>
                      <RowInput
                        label={`Name of bundle ${index + 1}`}
                        value={bundle.label}
                        width="w-[200px]"
                        align="left"
                        error={problemFor(`bundles.${index}.label`)}
                        onChange={(value) => setBundle(index, 'label', value)}
                      />
                    </TableCell>

                    {draft.bands.map((band) => (
                      <TableCell key={band.key} className="text-right">
                        <RowInput
                          label={`${band.label || 'Unnamed'} in bundle ${index + 1}`}
                          value={bundle.lines[band.key] ?? ''}
                          width="w-[80px]"
                          placeholder="0"
                          error={problemFor(`bundles.${index}.lines.${band.key}`)}
                          onChange={(value) => setBundleLine(index, band.key, value)}
                        />
                      </TableCell>
                    ))}

                    <TableCell className="text-right">
                      <RowInput
                        label={`Price of bundle ${index + 1}`}
                        value={bundle.price}
                        width="w-[110px]"
                        error={problemFor(`bundles.${index}.price`)}
                        onChange={(value) => setBundle(index, 'price', value)}
                      />
                    </TableCell>
                    <TableCell>
                      <RemoveRow
                        label={`Remove the ${bundle.label || 'unnamed'} bundle`}
                        onClick={() =>
                          update({
                            bundles: draft.bundles.filter((row) => row.key !== bundle.key),
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-md">
              <TextAction
                onClick={() =>
                  update({
                    bundles: [
                      ...draft.bundles,
                      { key: newKey(), id: null, label: '', price: '0.00', lines: {} },
                    ],
                  })
                }
              >
                <Plus aria-hidden className="size-3.5" />
                Add a bundle
              </TextAction>
            </div>

            <Notice className="mt-lg">
              A bundle is a headcount per band and a price for the lot. A party is always charged
              the cheapest arrangement, so a bundle that costs more than the same guests priced one
              by one is simply never used.
            </Notice>
          </FormSection>

          <FormSection title="Facilities">
            <Table scrollX>
              <TableHeader>
                <TableHeaderRow>
                  <TableHead>Facility</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap">In the day pass</TableHead>
                  <TableHead className="text-right">Day-pass capacity</TableHead>
                  <TableHead className="w-[1%]" />
                </TableHeaderRow>
              </TableHeader>
              <TableBody>
                {draft.facilities.length === 0 ? (
                  <TableEmpty colSpan={4}>No facilities are listed yet.</TableEmpty>
                ) : null}

                {draft.facilities.map((facility, index) => (
                  <TableRow key={facility.key}>
                    <TableCell>
                      <RowInput
                        label={`Name of facility ${index + 1}`}
                        value={facility.name}
                        width="w-[260px]"
                        align="left"
                        error={problemFor(`facilities.${index}.name`)}
                        onChange={(value) => setFacility(index, 'name', value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={facility.includedInDayPass}
                        aria-label={`${facility.name || 'This facility'} is included in the day pass`}
                        onCheckedChange={(checked) =>
                          setFacility(index, 'includedInDayPass', checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowInput
                        label={`Day-pass capacity of facility ${index + 1}`}
                        value={facility.capacity}
                        width="w-[120px]"
                        placeholder="no limit"
                        error={problemFor(`facilities.${index}.capacity`)}
                        onChange={(value) => setFacility(index, 'capacity', value)}
                      />
                    </TableCell>
                    <TableCell>
                      <RemoveRow
                        label={`Remove ${facility.name || 'this facility'}`}
                        onClick={() =>
                          update({
                            facilities: draft.facilities.filter((row) => row.key !== facility.key),
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-md">
              <TextAction
                onClick={() =>
                  update({
                    facilities: [
                      ...draft.facilities,
                      {
                        key: newKey(),
                        id: null,
                        name: '',
                        includedInDayPass: false,
                        capacity: '',
                      },
                    ],
                  })
                }
              >
                <Plus aria-hidden className="size-3.5" />
                Add a facility
              </TextAction>
            </div>

            <Notice className="mt-lg">
              Capacity is how many day-pass visitors a facility can take, not how many people fit:
              long-term tenants use these at no charge and are always there. Leave it blank until
              you have agreed a number — nothing is limited by an empty field.
            </Notice>
          </FormSection>
        </Card>
      )}
    </SettingsForm>
  )
}

/**
 * A field inside a table row: the column header is the visible label, and the
 * real one is for a screen reader, which would otherwise meet a row of
 * unnamed boxes.
 */
function RowInput({
  label,
  value,
  onChange,
  width,
  placeholder,
  align = 'right',
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  width: string
  placeholder?: string
  align?: 'left' | 'right'
  error?: string
}) {
  return (
    <div className="inline-grid gap-xs text-left">
      <Input
        aria-label={label}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={`${width} ${align === 'right' ? 'text-right tabular-nums' : ''}`}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError message={error} />
    </div>
  )
}

function RemoveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <TextAction aria-label={label} title={label} onClick={onClick}>
      <X aria-hidden className="size-4" />
    </TextAction>
  )
}
