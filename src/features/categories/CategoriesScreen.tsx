import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CATEGORY_ICONS, CategoryIcon } from '@/lib/categoryIcons'
import {
  swapCategorySortOrder,
  useCategories,
  useCreateCategory,
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
  // 'new' = new main; { parentId } = new sub under that main; a Category = edit.
  const [editing, setEditing] = useState<Category | 'new' | { parentId: string } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const all = (categories ?? []).filter((c) => c.kind === kind)
  const mains = all.filter((c) => c.parent_id === null).sort((a, b) => a.sort_order - b.sort_order)
  const subsByParent = new Map<string, Category[]>()
  for (const c of all) {
    if (c.parent_id === null) continue
    const list = subsByParent.get(c.parent_id) ?? []
    list.push(c)
    subsByParent.set(c.parent_id, list)
  }
  for (const list of subsByParent.values()) list.sort((a, b) => a.sort_order - b.sort_order)

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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

      <ul className="space-y-1">
        {mains.map((category, i) => {
          const subs = subsByParent.get(category.id) ?? []
          const isExpanded = expanded.has(category.id)
          return (
            <li key={category.id}>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <button
                  type="button"
                  onClick={() => subs.length > 0 && toggleExpanded(category.id)}
                  className={cn('flex size-5 items-center justify-center', subs.length === 0 && 'invisible')}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                <CategoryIcon icon={category.icon} className="size-4 text-muted-foreground" />
                <span className={category.archived ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>
                  {category.name}
                </span>
                {subs.length > 0 && <span className="text-xs text-muted-foreground">{subs.length}</span>}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={i === 0}
                  onClick={() => swapCategorySortOrder(category, mains[i - 1])}
                  aria-label="Move up"
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={i === mains.length - 1}
                  onClick={() => swapCategorySortOrder(category, mains[i + 1])}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setEditing({ parentId: category.id })}
                  aria-label="Add sub-category"
                >
                  <Plus className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(category)} aria-label="Edit">
                  <Pencil className="size-3.5" />
                </Button>
              </div>

              {isExpanded && subs.length > 0 && (
                <ul className="ml-7 mt-1 space-y-1 border-l pl-3">
                  {subs.map((sub, j) => (
                    <li key={sub.id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                      <CategoryIcon icon={sub.icon} className="size-3.5 text-muted-foreground" />
                      <span className={sub.archived ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>
                        {sub.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={j === 0}
                        onClick={() => swapCategorySortOrder(sub, subs[j - 1])}
                        aria-label="Move up"
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={j === subs.length - 1}
                        onClick={() => swapCategorySortOrder(sub, subs[j + 1])}
                        aria-label="Move down"
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(sub)} aria-label="Edit">
                        <Pencil className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
        {mains.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
      </ul>

      {editing && (
        <CategoryDialog
          key={editing === 'new' ? 'new' : 'parentId' in editing ? `sub-${editing.parentId}` : editing.id}
          kind={kind}
          category={editing === 'new' || 'parentId' in editing ? null : editing}
          parentId={editing !== 'new' && 'parentId' in editing ? editing.parentId : null}
          nextSortOrder={
            editing !== 'new' && 'parentId' in editing
              ? (subsByParent.get(editing.parentId)?.length ?? 0)
              : mains.length
          }
          onClose={() => setEditing(null)}
        />
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
  const [archived, setArchived] = useState(category?.archived ?? false)
  const create = useCreateCategory(householdId)
  const update = useUpdateCategory(householdId)

  const isSub = category ? category.parent_id !== null : parentId !== null

  async function handleSave() {
    if (category) {
      await update.mutateAsync({ id: category.id, name, icon, archived })
    } else {
      await create.mutateAsync({ name, kind, icon, sortOrder: nextSortOrder, parentId })
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
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICON_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <CategoryIcon icon={key} className="size-4" />
                      {key}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {category && (
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="category-archived">Archived</Label>
                {!isSub && (
                  <p className="text-xs text-muted-foreground">Archives its sub-categories too</p>
                )}
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
