'use client'

import { useActionState } from 'react'

import { PortalBrand } from '@/components/portal/portal-brand'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { signInAction, type SignInState } from './actions'

/**
 * The sign-in card: the sidebar's brand block above a hairline card, one
 * primary fill (design.md §Components — Cards, Buttons). No Fraunces — the
 * display face belongs to the public site and each portal screen's h1, and
 * this screen is chrome, not content.
 */

const initialState: SignInState = { status: 'idle' }

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(signInAction, initialState)

  return (
    <div className="w-full max-w-[360px]">
      <div className="mb-lg">
        <PortalBrand />
      </div>

      <Card>
        <h1 className="text-body-md-strong text-foreground">Sign in</h1>
        <p className="mt-xs text-body-sm text-muted-foreground">
          Staff accounts are created by an administrator.
        </p>

        <form action={formAction} className="mt-lg grid gap-lg">
          {next ? <input type="hidden" name="next" value={next} /> : null}

          <div className="grid gap-sm">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              autoFocus
              aria-invalid={state.fieldErrors?.email ? true : undefined}
            />
            <FieldError message={state.fieldErrors?.email} />
          </div>

          <div className="grid gap-sm">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
              aria-invalid={state.fieldErrors?.password ? true : undefined}
            />
            <FieldError message={state.fieldErrors?.password} />
          </div>

          {state.status === 'error' && state.message ? (
            <Callout role="alert">{state.message}</Callout>
          ) : null}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>

      <p className="mt-lg text-body-sm text-muted-foreground">
        Locked out? Ask an administrator to reset your password.
      </p>
    </div>
  )
}
