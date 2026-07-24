import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useHousehold } from '@/lib/HouseholdContext'

const SHARED = 'shared'

interface Props {
  value: string | null
  onChange: (ownerId: string | null) => void
}

// Radix Select can't hold an empty-string value, so 'shared' stands in for
// owner_id = null (DESIGN.md §4.2 ownership convention) and is translated
// back at the boundary.
export function OwnerSelect({ value, onChange }: Props) {
  const { members } = useHousehold()

  return (
    <Select value={value ?? SHARED} onValueChange={(v) => onChange(v === SHARED ? null : v)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SHARED}>Shared</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
