import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

// Full-screen replacement for the Transaction/Recurring Rule/Installment
// Plan Drawer (v3.6, ADR-0006): a Drawer capped at viewport height was
// already fighting the in-app keypad for room on small phones, and moving
// every picker into one shared bottom panel needs a fixed amount of screen
// at the bottom regardless of how many rows sit above it. Same shell as the
// existing Settings full-screen page in App.tsx.
export function EntryPage({ title, onClose, children, footer }: Props) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-background">
      <header className="sticky top-0 flex items-center gap-2 border-b bg-background px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back">
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="font-heading text-sm font-medium">{title}</h1>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pt-3 pb-4">{children}</div>
      <div className="border-t bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">{footer}</div>
    </div>
  )
}
