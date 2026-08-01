import { useState } from 'react'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronLeft, ChevronRight, GripHorizontal, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CATEGORY_ICONS, CategoryIcon } from '@/lib/categoryIcons'
import { SwipeableRow } from '@/components/SwipeableRow'
import {
  CATEGORY_COLORS,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useReorderCategories,
  useUpdateCategory,
  type Category,
  type CategoryKind,
} from '@/lib/categories'
import { useHousehold } from '@/lib/HouseholdContext'
import { cn } from '@/lib/utils'

const ICON_KEYS = Object.keys(CATEGORY_ICONS)

export function CategoriesScreen() {
  const { householdId } = useHousehold()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const { data: categories } = useCategories(householdId)
  // Drill-down (DESIGN.md §7.3, v3): a real navigation stack instead of
  // D10's inline expand — tapping a main opens its own screen of subs.
  const [openMainId, setOpenMainId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Category | 'new' | { parentId: string } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<Category | null>(null)
  const deleteCategory = useDeleteCategory(householdId)
  const reorder = useReorderCategories(householdId)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const all = (categories ?? []).filter((c) => c.kind === kind && !c.archived)
  const mains = all.filter((c) => c.parent_id === null).sort((a, b) => a.sort_order - b.sort_order)
  const subsOf = (parentId: string) => all.filter((c) => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order)
  const openMain = openMainId ? (mains.find((c) => c.id === openMainId) ?? null) : null

  async function handleReorder(list: Category[], event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = list.findIndex((c) => c.id === active.id)
    const newIndex = list.findIndex((c) => c.id === over.id)
    await reorder.mutateAsync(arrayMove(list, oldIndex, newIndex))
  }

  async function handleDelete(category: Category) {
    const result = await deleteCategory.mutateAsync(category)
    if (result === 'archived') {
      toast.info(`"${category.name}" is used in existing records — archived instead of deleted`)
    }
    if (category.id === openMainId) setOpenMainId(null)
  }

  if (openMain) {
    const subs = subsOf(openMain.id)
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 -ml-2" onClick={() => setOpenMainId(null)} aria-label="Back">
            <ChevronLeft className="size-4" />
          </Button>
          <CategoryIcon icon={openMain.icon} color={openMain.color} className="size-4 text-muted-foreground" />
          <h2 className="min-w-0 flex-1 truncate font-heading text-sm font-medium">{openMain.name}</h2>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(openMain)} aria-label="Edit category">
            <Pencil className="size-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing({ parentId: openMain.id })}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleReorder(subs, e)}>
          <SortableContext items={subs.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {subs.map((sub) => (
                <CategoryRow key={sub.id} category={sub} onEdit={() => setEditing(sub)} onDelete={() => setConfirmingDelete(sub)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {subs.length === 0 && <p className="text-sm text-muted-foreground">No sub-categories yet.</p>}

        {confirmingDelete && (
          <DeleteCategoryDialog
            category={confirmingDelete}
            subCount={subsOf(confirmingDelete.id).length}
            onConfirm={() => handleDelete(confirmingDelete)}
            onClose={() => setConfirmingDelete(null)}
          />
        )}

        {editing && (
          <CategoryDialog
            key={editing === 'new' ? 'new' : 'parentId' in editing ? `sub-${editing.parentId}` : editing.id}
            kind={kind}
            category={editing === 'new' || 'parentId' in editing ? null : editing}
            parentId={editing !== 'new' && 'parentId' in editing ? editing.parentId : null}
            nextSortOrder={editing !== 'new' && 'parentId' in editing ? subs.length : mains.length}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Tabs value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
          <TabsList>
            <TabsTrigger value="expense">Expense</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleReorder(mains, e)}>
        <SortableContext items={mains.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {mains.map((main) => {
              const subs = subsOf(main.id)
              return (
                <CategoryRow
                  key={main.id}
                  category={main}
                  title={subs.length > 0 ? `${main.name} (${subs.length})` : main.name}
                  subtitle={subs.length > 0 ? subs.map((s) => s.name).join(', ') : undefined}
                  onOpen={() => setOpenMainId(main.id)}
                  onEdit={() => setEditing(main)}
                  onDelete={() => setConfirmingDelete(main)}
                />
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>
      {mains.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}

      {confirmingDelete && (
        <DeleteCategoryDialog
          category={confirmingDelete}
          subCount={subsOf(confirmingDelete.id).length}
          onConfirm={() => handleDelete(confirmingDelete)}
          onClose={() => setConfirmingDelete(null)}
        />
      )}

      {editing && (
        <CategoryDialog
          key={editing === 'new' ? 'new' : 'parentId' in editing ? `sub-${editing.parentId}` : editing.id}
          kind={kind}
          category={editing === 'new' || 'parentId' in editing ? null : editing}
          parentId={editing !== 'new' && 'parentId' in editing ? editing.parentId : null}
          nextSortOrder={editing !== 'new' && 'parentId' in editing ? (subsOf(editing.parentId)?.length ?? 0) : mains.length}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function CategoryRow({
  category,
  title,
  subtitle,
  onOpen,
  onEdit,
  onDelete,
}: {
  category: Category
  title?: string
  subtitle?: string
  onOpen?: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }

  return (
    <li ref={setNodeRef} style={style} className="overflow-hidden rounded-lg border bg-card">
      {/* Swipe to delete, matching the transaction ledger — the always-visible
          minus button it replaces put a destructive action one stray tap away
          in a list whose other controls are all safe. */}
      <SwipeableRow onDelete={onDelete}>
        <div className="flex items-center gap-1.5 px-2 py-2 text-sm">
          <button
            type="button"
            onClick={onOpen}
            disabled={!onOpen}
            className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
          >
            <CategoryIcon icon={category.icon} color={category.color} className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{title ?? category.name}</span>
              {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
            </span>
            {onOpen && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
          </button>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onEdit} aria-label={`Edit ${category.name}`}>
            <Pencil className="size-3.5" />
          </Button>
          <button
            {...attributes}
            {...listeners}
            className="flex size-7 shrink-0 touch-none items-center justify-center text-muted-foreground"
            aria-label={`Reorder ${category.name}`}
          >
            <GripHorizontal className="size-4" />
          </button>
        </div>
      </SwipeableRow>
    </li>
  )
}

// Deleting a main takes its sub-categories with it, and (when anything
// references them) archives rather than removes — neither is guessable from
// a trash icon, so both are spelled out before the action runs.
function DeleteCategoryDialog({
  category,
  subCount,
  onConfirm,
  onClose,
}: {
  category: Category
  subCount: number
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete "{category.name}"?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          {subCount > 0 && (
            <p className="font-medium text-destructive">
              Its {subCount} sub-{subCount === 1 ? 'category' : 'categories'} will be deleted too.
            </p>
          )}
          <p>
            If any transaction, recurring rule or installment still uses it, it is archived instead of deleted, so
            those records keep their category.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Icon names ("utensils-crossed") mean nothing to the person picking one, so
// the grid is icon-only; the Emoji tab lets any emoji be a custom icon
// (DESIGN.md §4.2 v3.1) using the phone's own emoji keyboard.
function IconPicker({
  value,
  color,
  onChange,
  onColorChange,
}: {
  value: string
  color: string | null
  onChange: (icon: string) => void
  onColorChange: (color: string | null) => void
}) {
  const isEmoji = !(value in CATEGORY_ICONS)
  const [mode, setMode] = useState<'icon' | 'emoji'>(isEmoji ? 'emoji' : 'icon')

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Icon</Label>
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'icon' | 'emoji')}>
          <TabsList className="h-8">
            <TabsTrigger value="icon" className="text-xs">
              Icons
            </TabsTrigger>
            <TabsTrigger value="emoji" className="text-xs">
              Emoji
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === 'icon' ? (
        <div className="grid max-h-44 grid-cols-7 gap-1.5 overflow-y-auto rounded-lg border p-2">
          {ICON_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-label={key}
              className={cn(
                'flex aspect-square items-center justify-center rounded-lg border transition-colors active:scale-95',
                value === key ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-accent',
              )}
            >
              <CategoryIcon icon={key} color={color} className="size-5" />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <CategoryIcon icon={isEmoji ? value : null} color={color} className="size-6" />
          </span>
          <Input
            value={isEmoji ? value : ''}
            onChange={(e) => onChange([...e.target.value.trim()].slice(0, 4).join(''))}
            placeholder="Type or paste an emoji 🍜"
            aria-label="Emoji icon"
          />
        </div>
      )}

      {/* Emoji carry their own colours, so tinting belongs to the icon tab.
          Keyed off the open tab, not the saved value: someone switching from
          an emoji to an icon needs the swatches before they pick, not after. */}
      {mode === 'icon' && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => onColorChange(null)}
            aria-label="Default colour"
            className={cn(
              'flex size-7 items-center justify-center rounded-full border-2 bg-muted text-[10px] text-muted-foreground',
              color === null ? 'border-primary' : 'border-transparent',
            )}
          >
            —
          </button>
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColorChange(c)}
              aria-label={`Colour ${c}`}
              className={cn('size-7 rounded-full border-2', color === c ? 'border-foreground' : 'border-transparent')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryDialog({
  kind,
  category,
  parentId,
  nextSortOrder,
  onClose,
}: {
  kind: CategoryKind
  category: Category | null
  parentId: string | null
  nextSortOrder: number
  onClose: () => void
}) {
  const { householdId } = useHousehold()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? ICON_KEYS[0])
  const [color, setColor] = useState<string | null>(category?.color ?? null)
  const [archived, setArchived] = useState(category?.archived ?? false)
  const create = useCreateCategory(householdId)
  const update = useUpdateCategory(householdId)

  const isSub = category ? category.parent_id !== null : parentId !== null

  async function handleSave() {
    if (category) {
      await update.mutateAsync({ id: category.id, name, icon, color, archived })
    } else {
      await create.mutateAsync({ name, kind, icon, color, sortOrder: nextSortOrder, parentId })
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {category ? (isSub ? 'Edit sub-category' : 'Edit category') : isSub ? 'New sub-category' : 'New category'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <IconPicker value={icon} color={color} onChange={setIcon} onColorChange={setColor} />
          {category && (
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="category-archived">Archived</Label>
                {!isSub && <p className="text-xs text-muted-foreground">Archives its sub-categories too</p>}
              </div>
              <Switch id="category-archived" checked={archived} onCheckedChange={setArchived} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || create.isPending || update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
