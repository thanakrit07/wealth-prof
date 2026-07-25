import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CategoriesScreen } from '@/features/categories/CategoriesScreen'
import { ChangePasswordDialog } from '@/features/settings/ChangePasswordDialog'
import { InviteSection } from '@/features/settings/InviteSection'
import { useHousehold } from '@/lib/HouseholdContext'
import { supabase } from '@/lib/supabase'

export function SettingsScreen() {
  const { self, members } = useHousehold()
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)

  return (
    <div className="space-y-6 p-4">
      <section>
        <h2 className="text-sm font-medium text-muted-foreground">Household</h2>
        <ul className="mt-2 space-y-1">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: m.color }} />
              {m.display_name}
              {m.id === self.id && <span className="text-muted-foreground">(you)</span>}
            </li>
          ))}
        </ul>
      </section>

      <InviteSection />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Data</h2>
        <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
          Manage categories
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Account</h2>
        <Button variant="outline" onClick={() => setPasswordOpen(true)}>
          Change password
        </Button>
      </section>

      <Button variant="outline" onClick={() => supabase.auth.signOut()}>
        Sign out
      </Button>

      <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Categories</DialogTitle>
          </DialogHeader>
          <CategoriesScreen />
        </DialogContent>
      </Dialog>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  )
}
