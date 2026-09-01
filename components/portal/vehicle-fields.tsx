'use client'

import { Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_VEHICLES_PER_BOOKING, MAX_VEHICLE_REGISTRATION_LENGTH } from '@/lib/domain/vehicle'

/**
 * The vehicles arriving on a booking — one row per car, plus the exception.
 *
 * prd.md §2 lists the vehicle registration among what is collected, and §13 [C]
 * makes it **required** "for records and security". The field was optional and
 * singular, which understated the requirement twice over: a booking could carry
 * no plate at all, and a family arriving in three cars had two of them nowhere.
 * §12.5 is what makes the second one bite — "vehicle registration lookup is a
 * first-class path, not a fallback" — so a car whose plate never reached the
 * system is a car the guard cannot match to a booking at the gate.
 *
 * ── Why a checkbox rather than simply allowing blank ───────────────────────
 *
 * Some guests genuinely arrive without a car, and the form has to accept that.
 * But "no vehicle" and "nobody asked" look identical when both are an empty
 * field, and only one of them is a fact. So the exception is a thing you say
 * out loud: checking it is an assertion, stored as `booking.no_vehicle` and
 * shown on the booking as "None" rather than "Not recorded".
 *
 * It is deliberately the quiet half of this section — a checkbox under the
 * rows, not a choice offered before them — because the ordinary answer is a
 * plate and the form should ask for that first.
 *
 * ── The rows ───────────────────────────────────────────────────────────────
 *
 * Every row is an `<input name="vehicles">`, so `FormData.getAll('vehicles')`
 * hands the action the whole set with no index parsing and no JSON. Normalising
 * and de-duplicating is the action's job through `normaliseVehicleRegistrations`
 * — doing it here as the staff member types would fight the cursor.
 *
 * Rows are held by the parent form rather than here. Both forms already own
 * every other field's state, the amendment form diffs its draft against what
 * the server holds, and a component that kept a private copy would be a second
 * source of truth for one field.
 */

interface VehicleFieldsProps {
  /** One entry per row, blanks included — the rows exactly as displayed. */
  vehicles: readonly string[]
  onChange: (vehicles: readonly string[]) => void
  noVehicle: boolean
  onNoVehicleChange: (noVehicle: boolean) => void
  error?: string
}

export function VehicleFields({
  vehicles,
  onChange,
  noVehicle,
  onNoVehicleChange,
  error,
}: VehicleFieldsProps) {
  // Always at least one row to type into: a section whose only control is an
  // "Add" button asks the staff member to do a step the form could have done.
  const rows = vehicles.length > 0 ? vehicles : ['']
  const canAdd = !noVehicle && rows.length < MAX_VEHICLES_PER_BOOKING

  function setRow(index: number, value: string) {
    onChange(rows.map((row, current) => (current === index ? value : row)))
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, current) => current !== index))
  }

  return (
    <div className="grid gap-md">
      <div className="grid gap-sm">
        {rows.map((registration, index) => (
          // Rows are keyed by position, not by value. A plate is edited
          // character by character, so keying on it would unmount and remount
          // the input on every keystroke and take the caret with it.
          <div key={index} className="flex items-center gap-sm">
            <div className="grid gap-sm">
              {/* One label for the section, on the first row only: five
                  identical "Vehicle reg" labels stacked would be noise, and
                  the rows after the first are plainly more of the same. */}
              {index === 0 ? <Label htmlFor="vehicle-0">Registration</Label> : null}
              <Input
                id={`vehicle-${index}`}
                name="vehicles"
                placeholder="BAA 1234"
                value={registration}
                disabled={noVehicle}
                maxLength={MAX_VEHICLE_REGISTRATION_LENGTH}
                autoComplete="off"
                // Plates are read back to a guard, and lower case in a column
                // of registrations reads as a different kind of value. The
                // action normalises for storage regardless; this is so the
                // field looks like what it will become.
                className="w-[220px] uppercase"
                aria-invalid={error ? true : undefined}
                aria-label={index === 0 ? undefined : `Vehicle registration ${index + 1}`}
                onChange={(event) => setRow(index, event.target.value)}
              />
            </div>

            {/* The first row has no remove control while it is the only one —
                removing the last row would leave a section with nothing in it
                and no way to say why. */}
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={noVehicle}
                className={index === 0 ? 'mt-[26px]' : undefined}
                aria-label={`Remove vehicle ${index + 1}`}
                onClick={() => removeRow(index)}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}

        <FieldError message={error} />
      </div>

      {canAdd ? (
        <div>
          <Button type="button" variant="tertiary" onClick={() => onChange([...rows, ''])}>
            <Plus aria-hidden />
            Add another vehicle
          </Button>
        </div>
      ) : null}

      {/* The fallback, kept visually subordinate to the rows above it. */}
      <div className="flex items-start gap-sm">
        <Checkbox
          id="noVehicle"
          checked={noVehicle}
          className="mt-[3px]"
          onCheckedChange={(checked) => onNoVehicleChange(checked === true)}
        />
        <div className="grid gap-xxs">
          <Label htmlFor="noVehicle">Arriving without a vehicle</Label>
          <p className="text-caption text-muted-foreground">
            Only for the rare guest with no car. Security check arrivals by registration, so a
            booking with neither a plate nor this box ticked cannot be matched at the gate.
          </p>
        </div>
      </div>

      {/* Submitted as an explicit value rather than left to the checkbox's own
          hidden field, which is absent when clear — so the action reads a
          decision on every submit instead of inferring one from a missing key. */}
      <input type="hidden" name="noVehicle" value={noVehicle ? 'true' : 'false'} />
    </div>
  )
}
