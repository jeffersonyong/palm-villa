import type { Metadata } from 'next'

import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Sign in — Palm Villa Operations',
}

/**
 * The staff sign-in screen. Anyone with a session never sees it — proxy.ts
 * bounces them straight to their destination — so it renders for exactly one
 * audience: staff without a session, on any device from the front desk
 * desktop to a guard's phone.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams

  return <LoginForm next={typeof next === 'string' ? next : undefined} />
}
