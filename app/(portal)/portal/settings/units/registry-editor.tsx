'use client'

import { ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useMemo, useState } from 'react'

import { SectionCard } from '@/components/portal/section-card'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Notice } from '@/components/ui/notice'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/toast-store'
import {
  checkUnitRegistry,
  formatUnitRef,
  isNoOp,
  MAX_UNITS_PER_TYPE,
  planRegistry,
  type CurrentUnit,
  type RefProblem,
  type RefScheme,
} from '@/lib/domain/unit-ref'

import { cn } from '@/lib/utils'

import { saveUnitRegistryAction, type RegistryActionState } from './actions'

/**
 * Naming the building, and saying how big it is (capability F6).
 *
 * ── The shape of the control, and why ─────────────────────────────────────
 *
 * Nobody renames thirty-six doors one field at a time and gets it right, so the
 * primary control is a **pattern**: a prefix, a numbering style and a count,
 * previewed live. And nobody's building is perfectly regular either — a block
 * that runs A-101…A-112 and then has two units called "Annex" is the normal
 * case, not the exotic one — so every generated name is still an editable
 * field underneath. The pattern does the ninety per cent; the fields do the
 * rest.
 *
 * Changing the pattern regenerates that type's names. Changing only the count
 * does **not**: growing appends and shrinking truncates, so adding two units
 * cannot silently undo a hand-typed name on the other thirty-six.
 *
 * ── Nothing is a demolition ───────────────────────────────────────────────
 *
 * `planRegistry` pairs the nth existing unit to the nth name, so a pattern
 * change is a set of renames and every unit keeps its bookings, its history and
 * its identity. The only thing that removes a unit is lowering the count, and
 * only when that unit has never been occupied — the rest are refused with the
 * reason, before the save rather than after it.
 */

interface UnitTypeSummary {
  id: string
  name: string
}

interface RegistryEditorProps {
  units: readonly CurrentUnit[]
  unitTypes: readonly UnitTypeSummary[]
}

/**
 * The numbering styles offered, rather than a free-form padding field.
 *
 * Four covers every building anyone has described, and each one shows what it
 * produces — "01, 02, 03" is a specification a non-technical reader can check,
 * where "2 digits, starting at 1" is one they have to compile in their head.
 */
const NUMBERING = [
  { id: 'pad2', label: '01, 02, 03…', digits: 2, startAt: 1 },
  { id: 'plain', label: '1, 2, 3…', digits: 1, startAt: 1 },
  { id: 'pad3', label: '001, 002, 003…', digits: 3, startAt: 1 },
  { id: 'floor', label: '101, 102, 103…', digits: 3, startAt: 101 },
] as const

type NumberingId = (typeof NUMBERING)[number]['id']

interface TypeDraft {
  prefix: string
  numbering: NumberingId
  suffix: string
  refs: string[]
}

/**
 * Reads the pattern back out of the names a type already has, so the editor
 * opens showing the building as it is rather than as a blank form.
 *
 * A best guess, and it does not need to be more: the fields below always show
 * the real names, so a wrong guess costs nothing until somebody deliberately
 * changes the pattern.
 */
function inferDraft(refs: readonly string[]): TypeDraft {
  const first = refs[0] ?? ''
  // Greedy prefix, then the number, then whatever trails it — so `A-01 East`
  // reads as prefix `A-`, number `01`, suffix ` East`.
  const match = /^(.*?)(\d+)(\D*)$/.exec(first)

  if (!match) {
    return { prefix: first, numbering: 'pad2', suffix: '', refs: [...refs] }
  }

  const [, prefix, digits, suffix] = match
  const startAt = Number(digits)

  const numbering: NumberingId =
    startAt >= 100 && digits!.length === 3
      ? 'floor'
      : digits!.length === 3
        ? 'pad3'
        : digits!.length === 1
          ? 'plain'
          : 'pad2'

  return { prefix: prefix ?? '', numbering, suffix: suffix ?? '', refs: [...refs] }
}

function schemeOf(draft: TypeDraft): RefScheme {
  const numbering = NUMBERING.find((entry) => entry.id === draft.numbering) ?? NUMBERING[0]

  // The separator lives in the prefix — one field the reader types the whole
  // way ("3B-", "Villa ") rather than two they have to keep in step.
  return {
    prefix: draft.prefix,
    separator: '',
    digits: numbering.digits,
    startAt: numbering.startAt,
    suffix: draft.suffix,
  }
}

const initialState: RegistryActionState = { status: 'idle' }

export function RegistryEditor({ units, unitTypes }: RegistryEditorProps) {
  const [state, formAction, isPending] = useActionState(saveUnitRegistryAction, initialState)
  const router = useRouter()

  const [drafts, setDrafts] = useState<Record<string, TypeDraft>>(() =>
    Object.fromEntries(
      unitTypes.map((type) => [
        type.id,
        inferDraft(units.filter((unit) => unit.unitTypeId === type.id).map((unit) => unit.ref)),
      ]),
    ),
  )

  const desired = useMemo(
    () => unitTypes.map((type) => ({ unitTypeId: type.id, refs: drafts[type.id]?.refs ?? [] })),
    [unitTypes, drafts],
  )

  // The same two functions the server will run, so the editor's verdict and the
  // save's verdict cannot disagree. The server still runs them against a fresh
  // read; this is the fast half, not the authority.
  const problems = useMemo(() => checkUnitRegistry(units, desired), [units, desired])
  const plan = useMemo(() => planRegistry(units, desired), [units, desired])

  const problemRefs = useMemo(
    () => new Map(problems.map((problem) => [problem.ref, problem])),
    [problems],
  )

  const hasChanges = !isNoOp(plan)
  const canSave = hasChanges && problems.length === 0 && plan.blocked.length === 0

  useEffect(() => {
    if (state.status === 'done' && state.applied) {
      const { renamed, added, removed } = state.applied

      toast({
        tone: 'positive',
        title: 'Units updated',
        description: [
          renamed ? `${renamed} renamed` : null,
          added ? `${added} added` : null,
          removed ? `${removed} removed` : null,
        ]
          .filter(Boolean)
          .join(', '),
      })
      router.refresh()
    }
  }, [state, router])

  function updateDraft(typeId: string, next: Partial<TypeDraft>) {
    setDrafts((current) => {
      const draft = current[typeId]

      if (!draft) {
        return current
      }

      const merged = { ...draft, ...next }

      // A pattern change regenerates every name for the type; a count change
      // does not touch the names already there.
      const patternChanged =
        next.prefix !== undefined || next.numbering !== undefined || next.suffix !== undefined

      const refs = patternChanged
        ? merged.refs.map((_, index) =>
            formatUnitRef(schemeOf(merged), schemeOf(merged).startAt + index),
          )
        : merged.refs

      return { ...current, [typeId]: { ...merged, refs } }
    })
  }

  function setCount(typeId: string, count: number) {
    setDrafts((current) => {
      const draft = current[typeId]

      if (!draft) {
        return current
      }

      const wanted = Math.max(0, Math.min(count, MAX_UNITS_PER_TYPE))
      const scheme = schemeOf(draft)

      const refs =
        wanted <= draft.refs.length
          ? draft.refs.slice(0, wanted)
          : [
              ...draft.refs,
              ...Array.from({ length: wanted - draft.refs.length }, (_, offset) =>
                formatUnitRef(scheme, scheme.startAt + draft.refs.length + offset),
              ),
            ]

      return { ...current, [typeId]: { ...draft, refs } }
    })
  }

  function setRef(typeId: string, index: number, value: string) {
    setDrafts((current) => {
      const draft = current[typeId]

      if (!draft) {
        return current
      }

      const refs = draft.refs.map((ref, position) => (position === index ? value : ref))

      return { ...current, [typeId]: { ...draft, refs } }
    })
  }

  return (
    <form action={formAction} className="grid gap-md">
      <input type="hidden" name="desired" value={JSON.stringify(desired)} />

      <Notice>
        Renaming a unit renames it everywhere, including on stays that have already happened — the
        name is what staff call the door, so past bookings follow it. Every change is recorded
        against the unit.
      </Notice>

      {unitTypes.map((type) => {
        const draft = drafts[type.id]

        if (!draft) {
          return null
        }

        const existing = units.filter((unit) => unit.unitTypeId === type.id)

        return (
          <SectionCard key={type.id} id={`type-${type.id}`} title={type.name}>
            <div className="grid gap-lg">
              <div className="flex flex-wrap items-end gap-md">
                <div className="grid gap-sm">
                  <Label htmlFor={`prefix-${type.id}`}>Name pattern</Label>
                  <Input
                    id={`prefix-${type.id}`}
                    value={draft.prefix}
                    onChange={(event) => updateDraft(type.id, { prefix: event.target.value })}
                    placeholder="3B-"
                    className="w-[180px]"
                  />
                </div>

                <div className="grid gap-sm">
                  <Label htmlFor={`numbering-${type.id}`}>Numbered</Label>
                  <Select
                    value={draft.numbering}
                    onValueChange={(next) =>
                      updateDraft(type.id, { numbering: next as NumberingId })
                    }
                  >
                    <SelectTrigger id={`numbering-${type.id}`} className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NUMBERING.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Optional, and labelled as such. Most buildings need none;
                    the ones that name a wing or a block after the number would
                    otherwise be thirty-six fields typed by hand, which is the
                    work the pattern exists to remove. */}
                <div className="grid gap-sm">
                  <Label htmlFor={`suffix-${type.id}`}>
                    Ending pattern <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id={`suffix-${type.id}`}
                    value={draft.suffix}
                    onChange={(event) => updateDraft(type.id, { suffix: event.target.value })}
                    placeholder=" East"
                    className="w-[150px]"
                  />
                </div>

                <div className="grid gap-sm">
                  <Label htmlFor={`count-${type.id}`}>How many</Label>
                  <Input
                    id={`count-${type.id}`}
                    type="number"
                    min={0}
                    max={MAX_UNITS_PER_TYPE}
                    value={draft.refs.length}
                    onChange={(event) => setCount(type.id, Number(event.target.value))}
                    className="w-[110px] tabular-nums"
                  />
                </div>
              </div>

              {/* The preview is the pattern's own sentence. Three names and the
                  last one says more than thirty-six ever would. */}
              <p className="text-caption text-muted-foreground">
                {draft.refs.length === 0 ? (
                  <>No units of this type. Set a number above to add some.</>
                ) : (
                  <>
                    <span className="font-mono">{draft.refs.slice(0, 3).join(', ')}</span>
                    {draft.refs.length > 3 ? (
                      <>
                        {' … '}
                        <span className="font-mono">{draft.refs[draft.refs.length - 1]}</span>
                      </>
                    ) : null}
                    {' · '}
                    {draft.refs.length} {draft.refs.length === 1 ? 'unit' : 'units'}
                  </>
                )}
              </p>

              {draft.refs.length > 0 ? (
                <NameList
                  typeId={type.id}
                  count={draft.refs.length}
                  problemCount={draft.refs.filter((ref) => problemRefs.has(ref)).length}
                >
                  <div className="grid gap-sm sm:grid-cols-3 lg:grid-cols-4">
                    {draft.refs.map((ref, index) => {
                      const problem = problemRefs.get(ref)
                      const removing = plan.removals.some((entry) => entry.ref === ref)

                      return (
                        <div key={index} className="grid gap-xs">
                          <Input
                            aria-label={`${type.name} unit ${index + 1}`}
                            value={ref}
                            onChange={(event) => setRef(type.id, index, event.target.value)}
                            aria-invalid={Boolean(problem)}
                            className="font-mono"
                          />
                          {problem ? (
                            <FieldError message={problemMessage(problem)} />
                          ) : removing ? (
                            <p className="text-caption text-muted-foreground">Will be removed</p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </NameList>
              ) : null}

              {existing.length > draft.refs.length ? (
                <RemovalSummary
                  blocked={plan.blocked.filter((entry) =>
                    existing.some((unit) => unit.id === entry.unitId),
                  )}
                  removing={plan.removals.filter((entry) =>
                    existing.some((unit) => unit.id === entry.unitId),
                  )}
                />
              ) : null}
            </div>
          </SectionCard>
        )
      })}

      {state.status === 'error' ? (
        <Callout tone="negative" placement="page" role="alert">
          <div className="grid gap-xs">
            <p>{state.message}</p>
            {state.blocked?.length ? <p className="font-mono">{state.blocked.join(', ')}</p> : null}
          </div>
        </Callout>
      ) : null}

      {/* Aligned with the right edge of the cards it writes, and dirty-gated:
          design.md — an edit form's Save is disabled until something changed,
          and an enabled Save that can only fail is a button that lies. */}
      <div className="flex items-center justify-end gap-md">
        {hasChanges ? (
          <p className="text-caption text-muted-foreground">{summarise(plan)}</p>
        ) : null}
        <Button type="submit" disabled={!canSave || isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

/**
 * The per-unit names, folded away until wanted.
 *
 * Thirty-six fields is the right control for the building that needs it and
 * pure noise for the four types that do not — at full height the screen was two
 * hundred inputs deep, and the pattern controls, which are what most edits
 * actually use, scrolled off the top of it.
 *
 * It opens itself when something inside is wrong, because a validation error in
 * a collapsed panel is an error nobody can find. The problem count stays on the
 * summary line either way, so a folded panel can still say it is hiding
 * something that needs attention.
 *
 * `hidden` rather than unmounting the children: the fields are controlled by
 * the editor's own state, so collapsing a panel must not discard what someone
 * typed into it.
 */
function NameList({
  typeId,
  count,
  problemCount,
  children,
}: {
  typeId: string
  count: number
  problemCount: number
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const open = isOpen || problemCount > 0
  const panelId = `names-${typeId}`

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center gap-xs rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
        <span className="micro-label text-muted-foreground">Each unit’s name ({count})</span>
        {problemCount > 0 ? (
          <span className="text-caption text-destructive">{problemCount} to fix</span>
        ) : null}
      </button>

      <div id={panelId} hidden={!open} className="mt-md">
        {children}
      </div>
    </div>
  )
}

function RemovalSummary({
  blocked,
  removing,
}: {
  blocked: readonly { ref: string }[]
  removing: readonly { ref: string }[]
}) {
  if (blocked.length === 0 && removing.length === 0) {
    return null
  }

  return (
    <div className="grid gap-sm">
      {removing.length > 0 ? (
        <Notice>
          <span className="font-mono">{removing.map((entry) => entry.ref).join(', ')}</span> will be
          removed. They have never been occupied, so nothing is lost.
        </Notice>
      ) : null}

      {blocked.length > 0 ? (
        <Callout tone="negative">
          <div className="grid gap-xs">
            <p>
              <span className="font-mono">{blocked.map((entry) => entry.ref).join(', ')}</span> have
              hosted bookings and cannot be removed.
            </p>
            <p>
              Take them out of service instead — they stop appearing in availability and their
              record stays.
            </p>
          </div>
        </Callout>
      ) : null}
    </div>
  )
}

function problemMessage(problem: RefProblem): string {
  switch (problem.reason) {
    case 'blank':
      return 'Give this unit a name.'
    case 'too_long':
      return 'Too long for a table cell.'
    case 'reserved':
      return 'That word is reserved.'
    case 'unsafe':
      return 'No slashes, hashes or percent signs.'
    case 'duplicate':
      return 'Another unit already has this name.'
  }
}

function summarise(plan: ReturnType<typeof planRegistry>): string {
  return [
    plan.renames.length ? `${plan.renames.length} renamed` : null,
    plan.additions.length ? `${plan.additions.length} added` : null,
    plan.removals.length ? `${plan.removals.length} removed` : null,
  ]
    .filter(Boolean)
    .join(', ')
}
