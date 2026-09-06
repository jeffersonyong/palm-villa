'use client'

import { CalendarDays, Check, Copy, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { StayDateRange } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { initials } from '@/components/ui/avatar-identity'
import { DateField } from '@/components/ui/date-field'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ActivityBar } from '@/components/ui/activity-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The interactive half of the proof sheet. A client component because every
 * primitive here is stateful; the page around it stays a server component.
 *
 * Open each one in both themes and check the same four things: 14px radius,
 * one hairline, the real shadow, and a scrim behind anything modal.
 */

function Row({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="micro-label text-muted-foreground">{title}</h3>
      <p className="mt-xs max-w-[60ch] text-body-sm text-muted-foreground">{note}</p>
      <div className="mt-md flex flex-wrap items-center gap-sm">{children}</div>
    </div>
  )
}

export function OverlayDemos() {
  return (
    <div className="space-y-xl">
      <Row
        title="Dialog"
        note="rounded-xl · border-border · shadow-overlay over bg-scrim. Title is display-xs in Geist — a modal heading is a section heading, so the display face stays off it."
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Void this booking?</DialogTitle>
              <DialogDescription>
                The unit returns to availability immediately. The booking stays in the audit log.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="tertiary">Keep it</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="destructive">Void booking</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Row>

      <Row
        title="Sheet"
        note="The same elevation, edge-anchored: no radius where it meets the viewport, and it slides rather than zooms."
      >
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="tertiary">Open sheet</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>
                Transient panels and the mobile nav. A record with its own actions gets a route, not
                a drawer — see design.md, Detail screens.
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </Row>

      <Row title="Popover" note="Anchored, not modal — no scrim, and it closes on outside click.">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="tertiary">
              <CalendarDays />
              Open popover
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <p className="text-body-md-strong text-foreground">Deposit held</p>
            <p className="mt-xs text-body-sm text-muted-foreground">
              BND 150.00, taken at check-in and released after inspection.
            </p>
          </PopoverContent>
        </Popover>
      </Row>

      <Row
        title="Dropdown menu"
        note="An overlay shell (14px) holding controls (6px): items are body-sm with a muted focus fill, group labels take the micro voice."
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary">Open menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Booking</DropdownMenuLabel>
            <DropdownMenuItem>
              <Copy />
              Duplicate
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Check />
              Mark confirmed
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2 />
              Void
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Row>

      <Row
        title="Tooltip"
        note="The small-overlay exception: control radius on the invert surface, because a 16px corner on a caption chip reads as a pill. One TooltipProvider wraps the surface — never one per tooltip."
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="tertiary">Hover or focus me</Button>
            </TooltipTrigger>
            <TooltipContent>Deposits are released after inspection</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="tertiary">And me, without the delay</Button>
            </TooltipTrigger>
            <TooltipContent>Moving between neighbours skips the open delay</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Row>
    </div>
  )
}

export function TabsDemo() {
  return (
    <Tabs defaultValue="all">
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="arrivals">Arrivals</TabsTrigger>
        <TabsTrigger value="departures">Departures</TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <p className="text-body-sm text-muted-foreground">
          The active segment is a white chip drawn in with a hairline — the same quiet-surface
          answer the sidebar gives. Never an underline, never a shadow, never the action colour.
        </p>
      </TabsContent>
      <TabsContent value="arrivals">
        <p className="text-body-sm text-muted-foreground">Arrivals panel.</p>
      </TabsContent>
      <TabsContent value="departures">
        <p className="text-body-sm text-muted-foreground">Departures panel.</p>
      </TabsContent>
    </Tabs>
  )
}

export function FormControlDemo() {
  return (
    <div className="grid gap-lg md:grid-cols-2">
      <div className="space-y-md">
        <div className="flex items-center gap-sm">
          <Checkbox id="demo-deposit" defaultChecked />
          <Label htmlFor="demo-deposit">Deposit collected</Label>
        </div>
        <div className="flex items-center gap-sm">
          <Checkbox id="demo-id" />
          <Label htmlFor="demo-id">Identity document sighted</Label>
        </div>
        <div className="flex items-center gap-sm">
          <Checkbox id="demo-disabled" disabled />
          <Label htmlFor="demo-disabled">Unavailable until check-in</Label>
        </div>
      </div>

      <div className="space-y-xs">
        <Label htmlFor="demo-notes">Notes</Label>
        <Textarea id="demo-notes" placeholder="Anything the next shift should know…" />
      </div>
    </div>
  )
}

export function DropdownDemos() {
  const [unit, setUnit] = useState('studio')
  const [statuses, setStatuses] = useState<readonly string[]>([])
  const [range, setRange] = useState<StayDateRange | null>(null)
  const [day, setDay] = useState<string | null>('2026-09-12')

  return (
    <div className="space-y-xl">
      <Row
        title="Select — the form dress"
        note="The trigger is an Input with a chevron: same height, hairline, radius and focus, so a closed select and a text field in one form row are indistinguishable until you open one. The panel is the overlay shell and its items are controls; the checked item goes ink at 500, never a fill."
      >
        <div className="grid w-[232px] gap-sm">
          <Label htmlFor="demo-unit">Unit type</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger id="demo-unit">
              <SelectValue placeholder="Choose a unit type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Short stay</SelectLabel>
                <SelectItem value="studio">Studio</SelectItem>
                <SelectItem value="one-bed">One bedroom</SelectItem>
                <SelectItem value="two-bed">Two bedroom</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectItem value="penthouse" disabled>
                Penthouse — not yet let
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Row>

      <Row
        title="Filter row"
        note="The same shell in the filter dress: the field name lives inside the control, an unset filter shows only its name, and a set one fills with canvas-soft and puts its value in ink. Status takes several answers and stays open while you pick them; the date range takes two clicks and closes — there is no Apply on either."
      >
        <MultiSelectFilter
          label="Status"
          options={[
            { value: 'Confirmed', label: 'Confirmed' },
            { value: 'Awaiting payment', label: 'Awaiting payment' },
            { value: 'Checked in', label: 'Checked in' },
            { value: 'Cancelled', label: 'Cancelled' },
          ]}
          selected={statuses}
          onChange={setStatuses}
        />

        <DateRangePicker label="Stay date" value={range} onChange={setRange} />
      </Row>

      <Row
        title="Date field — one day, in the form dress"
        note="The same grid the filter chip opens, in the trigger the form uses: an Input with a calendar glyph rather than a chevron, because this opens a month and not a list. The browser's own date picker is never shown — a day outside the window is drawn and not offered, and the value reads as a date rather than as digits."
      >
        <div className="grid w-[200px] gap-sm">
          <Label htmlFor="demo-arrives">Arrives</Label>
          <DateField
            id="demo-arrives"
            value={day}
            onChange={setDay}
            min="2026-09-01"
            max="2026-10-31"
            clearable
          />
        </div>
      </Row>
    </div>
  )
}

/** Ids picked so the seven tones come out in palette order, not by luck. */
const AVATAR_SAMPLE = [
  { id: 'a-6', name: 'Hajah Rosnah' },
  { id: 'a-2', name: 'Siti Nurul' },
  { id: 'a-7', name: 'Nur Amalina' },
  { id: 'a-3', name: 'Danial Iskandar' },
  { id: 'a-9', name: 'Pengiran Vahid' },
  { id: 'a-5', name: 'Aminah Haji' },
  { id: 'a-1', name: 'Mohammad Faiz' },
]

export function AvatarDemo() {
  return (
    <div className="flex flex-col gap-lg">
      <div className="flex items-center gap-lg">
        <Avatar className="size-6">
          <AvatarFallback seed="a-7">{initials('Nur Amalina')}</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback seed="a-7">{initials('Nur Amalina')}</AvatarFallback>
        </Avatar>
        <Avatar className="size-10">
          <AvatarFallback seed="a-7">{initials('Nur Amalina')}</AvatarFallback>
        </Avatar>
        <p className="text-body-sm text-muted-foreground">
          24 / 32 / 40px. Caption initials, tint ground, deep same-hue text — never a brand fill.
        </p>
      </div>
      <div className="flex items-center gap-lg">
        <span className="flex items-center gap-sm">
          {AVATAR_SAMPLE.map((person) => (
            <Avatar key={person.id}>
              <AvatarFallback seed={person.id}>{initials(person.name)}</AvatarFallback>
            </Avatar>
          ))}
        </span>
        <p className="max-w-[46ch] text-body-sm text-muted-foreground">
          The identity set: seven hues around the wheel, teal excepted — that one is the
          customer&rsquo;s. Each sits clearly off the status hue nearest it, and the form does the
          rest: a face is a circle with two letters, a status is a pill with a word. A
          person&rsquo;s hue is derived from their account id, so it never changes.
        </p>
      </div>
      <div className="flex items-center gap-lg">
        <Avatar>
          <AvatarFallback>PV</AvatarFallback>
        </Avatar>
        <p className="text-body-sm text-muted-foreground">
          Unseeded stays neutral — a placeholder standing in for nobody.
        </p>
      </div>
    </div>
  )
}

export function ActivityBarDemo() {
  return (
    <Card className="w-full max-w-[420px]">
      <div className="text-body-sm text-foreground">PV-4821 accounting pack.pdf</div>
      <div className="text-caption text-muted-foreground">Assembled by the system</div>
      <div className="mt-md grid gap-xs">
        <ActivityBar />
        <p className="text-caption text-muted-foreground">
          Rebuilding to include the latest payment
        </p>
      </div>
    </Card>
  )
}

export function SkeletonDemo() {
  return (
    <Card className="w-full max-w-[420px] space-y-md">
      <div className="flex items-center gap-sm">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex-1 space-y-xs">
          <Skeleton className="h-3 w-[40%]" />
          <Skeleton className="h-3 w-[60%]" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-[80%]" />
    </Card>
  )
}
