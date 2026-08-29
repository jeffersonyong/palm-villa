import { OperationsSurface } from '@/components/operations-surface'

/**
 * Chrome for the sign-in screen: a centered column on the white ground,
 * nothing else. It fronts the operations surfaces, so it takes the monochrome
 * register (design.md — two accents, one system): the one primary fill on the
 * screen is ink in light, white in dark, never teal.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-lg py-2xl">
      <OperationsSurface />
      {children}
    </div>
  )
}
