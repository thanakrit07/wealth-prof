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

// Swipe left on a list row to reveal Delete (DESIGN.md §7.3) — the touch
// route. Hovering or tab-focusing the row reveals the same button the same
// way: previously it was aria-hidden + tabIndex={-1} until swiped open,
// which only a touchscreen can do, leaving mouse and keyboard users with no
// route to it at all.
export function SwipeableRow({ onDelete, children }: Props) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [revealed, setRevealed] = useState(false)
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

  // Swiped past the halfway point (touch) or hovering/focused (mouse,
  // keyboard) both mean the same thing: show the button.
  const open = offset < -REVEAL_WIDTH / 2 || revealed
  const x = dragging ? offset : open ? -REVEAL_WIDTH : 0

  return (
    <div className="relative overflow-hidden" onMouseEnter={() => setRevealed(true)} onMouseLeave={() => setRevealed(false)}>
      {/* Content comes first in the DOM (not just visually) so Tab reaches
          the row's own content before its secondary Delete action. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // Opaque, and matching the list it sits in, so the delete button
        // behind it never shows through while sliding. z-10: both this and
        // the button are positioned elements, and the button now comes
        // after this in the DOM (for Tab order) — without an explicit
        // stacking order that would paint the button on top permanently,
        // not just where the content has actually slid out of the way.
        className="relative z-9 touch-pan-y bg-card"
        style={{
          transform: `translateX(${x}px)`,
          transition: dragging ? undefined : 'transform 150ms ease-out',
        }}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => {
          setOffset(0)
          setRevealed(false)
          onDelete()
        }}
        onFocus={() => setRevealed(true)}
        onBlur={() => setRevealed(false)}
        aria-label="Delete"
        // -outline-offset: the row's own overflow-hidden (needed to hide this
        // button pre-reveal) also clips a normal outward-offset focus ring,
        // since the button sits flush against the row's edges. Drawing the
        // ring inset instead keeps it inside the clipped region.
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive text-destructive-foreground focus-visible:outline-offset-[-2px]"
        style={{ width: REVEAL_WIDTH }}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}
