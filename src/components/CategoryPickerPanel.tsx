import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { CategoryIcon } from '@/lib/categoryIcons'
import type { Category, CategoryKind } from '@/lib/categories'
import { cn } from '@/lib/utils'

// Top-N tiles shown before the "More" tile (7 + More = 2 rows of 4).
const COLLAPSED_TILES = 7

interface Props {
  categories: Category[]
  kind: CategoryKind
  selectedId: string | null
  // `hasSubs` tells the caller whether this pick just opened a sub tray (so
  // it should leave the panel open for the refinement) or was a leaf choice
  // (a sub tile, or a main with nothing under it) with nothing left to do.
  onSelect: (category: Category, hasSubs: boolean) => void
}

// The category grid, lifted out of TransactionSheet (v3.6) so Recurring Rule
// and Installment Plan get the same picker instead of a plain <Select> —
// all three forms now open this from the same shared bottom panel (D17,
// ADR-0006). Sub-categories drop their icon here: at this density, against
// their own main's icon two rows up, a second icon per tile added noise
// without adding information.
export function CategoryPickerPanel({ categories, kind, selectedId, onSelect }: Props) {
  const [gridExpanded, setGridExpanded] = useState(false)
  // D10: which main category's subs are showing (Money Manager's chevron
  // pattern — a main with subs expands them in place instead of selecting
  // immediately). Auto-opens when the current selection is a sub.
  const [expandedMainId, setExpandedMainId] = useState<string | null>(null)

  useEffect(() => {
    const current = categories.find((c) => c.id === selectedId)
    if (current?.parent_id) setExpandedMainId(current.parent_id)
  }, [categories, selectedId])

  const relevant = categories.filter((c) => !c.archived && !c.system && c.kind === kind)
  const bySortOrder = (a: Category, b: Category) => a.sort_order - b.sort_order
  const mainCategories = relevant.filter((c) => c.parent_id === null).sort(bySortOrder)
  const subsOf = (parentId: string) => relevant.filter((c) => c.parent_id === parentId).sort(bySortOrder)

  const needsMoreTile = mainCategories.length > COLLAPSED_TILES + 1
  const selectedCategory = selectedId ? relevant.find((c) => c.id === selectedId) : null
  const selectedMainId = selectedCategory ? (selectedCategory.parent_id ?? selectedCategory.id) : null
  const selectionHidden =
    selectedMainId != null && mainCategories.slice(COLLAPSED_TILES).some((c) => c.id === selectedMainId)
  const showAll = gridExpanded || !needsMoreTile || selectionHidden
  const visibleCategories = showAll ? mainCategories : mainCategories.slice(0, COLLAPSED_TILES)
  const expandedSubs = expandedMainId ? subsOf(expandedMainId) : []

  // One flat tile list so "More" takes part in row arithmetic like any other
  // tile — otherwise the sub tray lands under the wrong line whenever the
  // grid is collapsed.
  type Tile = { kind: 'main'; category: Category } | { kind: 'more' }
  const tiles: Tile[] = [
    ...visibleCategories.map((category): Tile => ({ kind: 'main', category })),
    ...(showAll ? [] : ([{ kind: 'more' }] as Tile[])),
  ]

  // D10: the sub tray goes right after the last tile of the row holding the
  // tapped main, not after the whole grid, so it reads as belonging to that
  // row instead of appearing a full row away.
  const expandedTileIndex = tiles.findIndex((t) => t.kind === 'main' && t.category.id === expandedMainId)
  const subRowAfter =
    expandedSubs.length === 0
      ? -1
      : expandedTileIndex < 0
        ? tiles.length - 1
        : Math.min(Math.floor(expandedTileIndex / 4) * 4 + 3, tiles.length - 1)

  return (
    <div className="max-h-full overflow-y-auto">
      <div className="grid grid-cols-4 gap-1.5">
        {tiles.map((tile, i) => {
          const c = tile.kind === 'main' ? tile.category : null
          const hasSubs = c ? subsOf(c.id).length > 0 : false
          const isExpandedMain = c != null && expandedMainId === c.id
          const showTrayAfter = i === subRowAfter
          return (
            <Fragment key={c ? c.id : '__more__'}>
              {c ? (
                <button
                  type="button"
                  // Selecting the main is always enough to save; the subs
                  // just open alongside as an optional refinement, so a main
                  // with children is never a dead end.
                  onClick={() => {
                    onSelect(c, hasSubs)
                    setExpandedMainId(hasSubs && !isExpandedMain ? c.id : null)
                  }}
                  className={cn(
                    'relative flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px] leading-tight',
                    selectedId === c.id
                      ? 'border-primary bg-primary/10'
                      : isExpandedMain
                        ? 'border-primary/40'
                        : 'border-border',
                    isExpandedMain && showTrayAfter && 'rounded-b-none border-b-transparent',
                  )}
                >
                  <CategoryIcon icon={c.icon} color={c.color} className="size-4.5" />
                  <span className="w-full truncate text-center">{c.name}</span>
                  {hasSubs && (
                    <ChevronDown
                      className={cn(
                        'absolute top-0.5 right-0.5 size-3 text-muted-foreground transition-transform',
                        isExpandedMain && 'rotate-180',
                      )}
                    />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setGridExpanded(true)}
                  className="flex flex-col items-center gap-0.5 rounded-lg border border-dashed border-border px-1 py-1.5 text-[11px] leading-tight text-muted-foreground"
                >
                  <MoreHorizontal className="size-4.5" />
                  <span>More</span>
                </button>
              )}

              {showTrayAfter && (
                // -mt-1.5 cancels the grid gap so the tray butts against the
                // row above; the matching accent border keeps it reading as
                // attached to the tapped main rather than a new row of peers
                // (D10 — sub categories shown close to their parent).
                <div className="col-span-4 -mt-1.5 grid grid-cols-4 gap-1.5 rounded-lg rounded-t-none border border-t-0 border-primary/40 bg-muted/50 p-1.5">
                  {expandedSubs.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => onSelect(sub, false)}
                      className={cn(
                        'flex items-center justify-center rounded-lg border bg-background px-1 py-2 text-center text-[11px] leading-tight',
                        selectedId === sub.id ? 'border-primary bg-primary/10' : 'border-border',
                      )}
                    >
                      <span className="w-full truncate">{sub.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
