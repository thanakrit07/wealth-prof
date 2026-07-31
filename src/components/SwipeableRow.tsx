import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'

const REVEAL_WIDTH = 72
// Past this much horizontal travel the gesture is a swipe, not a tap or a
// vertical scroll — small enough to feel responsive, large enough that
// scrolling the list never snags a row open.
const DIRECTION_LOCK = 8

interface Props {
  onDelete: () => void
  children: ReactNode
}

// Swipe left on a list row to reveal Delete (DESIGN.md §7.3). Pointer events
// only — no drag library — and the row stays fully tappable, so the gesture
// is additive rather than the only way to reach the action.
export function SwipeableRow({ onDelete, children }: Props) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; offset: number } | null>(null)
  const axis = useRef<'undecided' | 'horizontal' | 'vertical'>('undecided')

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY, offset }
    axis.current = 'undecided'
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y

    if (axis.current === 'undecided') {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return
      // Vertical intent wins ties so the list scrolls normally.
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
      if (axis.current === 'horizontal') {
        setDragging(true)
        e.currentTarget.setPointerCapture(e.pointerId)
      }
    }
    if (axis.current !== 'horizontal') return

    // Clamp: left reveals the action, right only closes it.
    setOffset(Math.max(-REVEAL_WIDTH, Math.min(0, start.current.offset + dx)))
  }

  function onPointerUp() {
    if (start.current) {
      const opened = offset < -REVEAL_WIDTH / 2
      setOffset(opened ? -REVEAL_WIDTH : 0)
    }
    start.current = null
    axis.current = 'undecided'
    setDragging(false)
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      <button
        type="button"
        onClick={() => {
          setOffset(0)
          onDelete()
        }}
        // Hidden from assistive tech while closed: tapping the row itself
        // opens the editor, which has its own always-visible delete button.
        aria-hidden={offset === 0}
        tabIndex={offset === 0 ? -1 : 0}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive text-destructive-foreground"
        style={{ width: REVEAL_WIDTH }}
      >
        <Trash2 className="size-4" />
      </button>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative touch-pan-y bg-background"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? undefined : 'transform 150ms ease-out',
        }}
      >
        {children}
      </div>
    </div>
  )
}
