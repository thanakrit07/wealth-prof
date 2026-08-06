import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  // True while `footer` is a picker (keypad/category/instrument/calendar)
  // rather than the compact Save/Delete row — gives every picker the same
  // elevated, roomy surface so switching between them (e.g. Amount →
  // Category) doesn't reflow the page under it or read as a different kind
  // of thing each time.
  panelOpen?: boolean
}

// Only a drag starting this close to the left edge arms the dismiss gesture
// — the same region iOS's own edge-swipe-back uses, so it never competes
// with an ordinary tap or a vertical scroll started anywhere else on the
// page (SwipeableRow's row-swipe is the same idea, applied per-row instead).
const EDGE_WIDTH = 24
const DIRECTION_LOCK = 8
const DISMISS_FRACTION = 0.3

function useEdgeSwipeToDismiss(onDismiss: () => void) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const armed = useRef(false)
  const width = useRef(typeof window === 'undefined' ? 0 : window.innerWidth)

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.clientX > EDGE_WIDTH) return
    start.current = { x: e.clientX, y: e.clientY }
    armed.current = true
    width.current = e.currentTarget.clientWidth || window.innerWidth
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!armed.current || !start.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (!dragging) {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return
      if (Math.abs(dy) > Math.abs(dx)) {
        // Vertical intent (scrolling the page) — release the gesture.
        armed.current = false
        return
      }
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setOffset(Math.max(0, dx))
  }

  function onPointerUp() {
    if (dragging && offset > width.current * DISMISS_FRACTION) {
      onDismiss()
    }
    setOffset(0)
    setDragging(false)
    armed.current = false
    start.current = null
  }

  return {
    offset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      style: {
        transform: offset ? `translateX(${offset}px)` : undefined,
        transition: dragging ? undefined : 'transform 200ms ease-out',
      },
    },
  }
}

// Full-screen replacement for the Transaction/Recurring Rule/Installment
// Plan Drawer (v3.6, ADR-0006): a Drawer capped at viewport height was
// already fighting the in-app keypad for room on small phones, and moving
// every picker into one shared bottom panel needs a fixed amount of screen
// at the bottom regardless of how many rows sit above it. Same shell as the
// existing Settings full-screen page in App.tsx. Swipe in from the left
// edge to dismiss, the same gesture closing the tab bar's own screens back
// to Records would use if this app had that kind of navigation stack.
//
// Portalled to `document.body` rather than rendered in place: an edit sheet
// is opened from inside a screen, which sits inside AppShell's own
// scrollable `<main>` (unlike the FAB's add flow and Settings, both
// siblings of AppShell in App.tsx). On iOS Safari, a `position: fixed`
// element nested inside a scrolling ancestor does not reliably stay pinned
// to the viewport — it can lag or jump with the container's scroll, which
// is what "the header doesn't stay on top" actually was. Portalling out
// from under that ancestor is the standard fix, and it means no call site
// has to think about where it happens to sit in the tree.
export function EntryPage({ title, onClose, children, footer, panelOpen }: Props) {
  const { offset, handlers } = useEdgeSwipeToDismiss(onClose)

  return createPortal(
    <div className="fixed inset-0 z-30 touch-pan-y" {...handlers}>
      <div
        className="flex h-full flex-col bg-background"
        style={{ boxShadow: offset ? '-16px 0 32px -12px rgb(0 0 0 / 0.25)' : undefined }}
      >
        <header className="sticky top-0 flex items-center gap-2 border-b bg-background px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back">
            <ChevronLeft className="size-5" />
          </Button>
          <h1 className="font-heading text-sm font-medium">{title}</h1>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 pt-3 pb-4">{children}</div>
        <div
          className={cn(
            'px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] transition-[min-height]',
            panelOpen
              ? 'min-h-[40vh] rounded-t-2xl border-t bg-popover shadow-[0_-8px_20px_-6px_rgb(0_0_0_/_0.15)]'
              : 'border-t bg-background',
          )}
        >
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  )
}
