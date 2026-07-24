import type { FormEvent, ReactNode } from 'react'
import { Heart } from 'lucide-react'

interface Props {
  title: string
  subtitle: string
  onSubmit: (event: FormEvent) => void
  children: ReactNode
}

// Shared shell for the signed-out screens: blush canvas, soft pastel
// blobs, and a frosted card. The heart is the app's signature mark.
export function AuthLayout({ title, subtitle, onSubmit, children }: Props) {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background p-4">
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -right-16 size-80 rounded-full bg-accent/70 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-1/3 size-56 rounded-full bg-secondary/80 blur-3xl" />

      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-sm space-y-4 rounded-3xl border bg-card/80 p-6 shadow-xl shadow-primary/10 backdrop-blur"
      >
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-medium text-foreground">
            {title}
            <Heart aria-hidden className="size-5 fill-primary text-primary" />
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </form>
    </div>
  )
}

export const authInputClass =
  'w-full rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-ring/50'

export const authPrimaryButtonClass =
  'gradient-love w-full rounded-xl px-3 py-2 text-sm font-medium text-white shadow-md shadow-primary/25 disabled:opacity-50'

export const authLinkButtonClass =
  'w-full text-center text-sm text-muted-foreground underline-offset-2 hover:underline'
