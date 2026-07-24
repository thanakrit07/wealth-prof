import { useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react'
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

const ICON_KEYS = Object.keys(CATEGORY_ICONS)

export function CategoriesScreen() {
  const { householdId } = useHousehold()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const { data: categories } = useCategories(householdId)
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  const list = (categories ?? []).filter((c) => c.kind === kind).sort((a, b) => a.sort_order - b.sort_order)

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
        {list.map((category, i) => (
          <li
            key={category.id}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <CategoryIcon icon={category.icon} className="size-4 text-muted-foreground" />
            <span className={category.archived ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>
              {category.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={i === 0}
              onClick={() => swapCategorySortOrder(category, list[i - 1])}
              aria-label="Move up"
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={i === list.length - 1}
              onClick={() => swapCategorySortOrder(category, list[i + 1])}
              aria-label="Move down"
            >
              <ArrowDown className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(category)} aria-label="Edit">
              <Pencil className="size-3.5" />
            </Button>
          </li>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
      </ul>

      {editing && (
        <CategoryDialog
          key={editing === 'new' ? 'new' : editing.id}
          kind={kind}
          category={editing === 'new' ? null : editing}
          nextSortOrder={list.length}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function CategoryDialog({
  kind,
  category,
  nextSortOrder,
  onClose,
}: {
  kind: CategoryKind
  category: Category | null
  nextSortOrder: number
  onClose: () => void
}) {
  const { householdId } = useHousehold()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? ICON_KEYS[0])
  const [archived, setArchived] = useState(category?.archived ?? false)
  const create = useCreateCategory(householdId)
  const update = useUpdateCategory(householdId)

  async function handleSave() {
    if (category) {
      await update.mutateAsync({ id: category.id, name, icon, archived })
    } else {
      await create.mutateAsync({ name, kind, icon, sortOrder: nextSortOrder })
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
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
              <Label htmlFor="category-archived">Archived</Label>
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
