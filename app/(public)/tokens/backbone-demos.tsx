'use client'

import { CalendarDays, Check, Copy, Trash2 } from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
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
        note="rounded-xl · border-border · shadow-overlay over bg-scrim. Title is display-xs in Inter — a modal heading is a section heading, so the display face stays off it."
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
        note="The small-overlay exception: control radius on the invert surface, because a 14px corner on a caption chip reads as a pill. One TooltipProvider wraps the surface — never one per tooltip."
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

export function AvatarDemo() {
  return (
    <div className="flex items-center gap-lg">
      <Avatar className="size-6">
        <AvatarFallback>JY</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>PV</AvatarFallback>
      </Avatar>
      <Avatar className="size-10">
        <AvatarFallback>SN</AvatarFallback>
      </Avatar>
      <p className="text-body-sm text-muted-foreground">
        24 / 32 / 40px. Muted ground, caption initials — never a brand fill.
      </p>
    </div>
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
