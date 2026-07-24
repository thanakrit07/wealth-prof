import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { Tab } from '@/components/layout/AppShell'
import { AuthScreen } from './components/AuthScreen'
import { HouseholdSetup } from './components/HouseholdSetup'
import { HomeScreen } from '@/features/home/HomeScreen'
import { TransactionsScreen } from '@/features/transactions/TransactionsScreen'
import { TransactionSheet } from '@/features/transactions/TransactionSheet'
import { AccountsScreen } from '@/features/accounts/AccountsScreen'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { fetchOwnMember, type HouseholdMember } from './lib/household'
import { HouseholdProvider } from './lib/HouseholdContext'
import { useUrlState } from './hooks/useUrlState'
import { currentMonthKey } from './lib/month'
import type { PersonFilter } from './lib/filters'
import { useSession } from './lib/useSession'

function SignedInApp({ self }: { self: HouseholdMember }) {
  const [month, setMonth] = useUrlState('month', currentMonthKey())
  const [person, setPerson] = useUrlState('person', 'all')
  const [tab, setTab] = useUrlState('tab', 'home')
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const screens: Record<Tab, React.ReactNode> = {
    home: <HomeScreen month={month} person={person as PersonFilter} />,
    transactions: <TransactionsScreen month={month} person={person as PersonFilter} />,
    accounts: <AccountsScreen />,
    settings: <SettingsScreen />,
  }

  return (
    <HouseholdProvider self={self}>
      <AppShell
        month={month}
        onMonthChange={setMonth}
        person={person as PersonFilter}
        onPersonChange={(p) => setPerson(p)}
        tab={tab as Tab}
        onTabChange={(t) => setTab(t)}
        onQuickAdd={() => setQuickAddOpen(true)}
      >
        {screens[tab as Tab] ?? screens.home}
      </AppShell>
      <TransactionSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </HouseholdProvider>
  )
}

function App() {
  const { session, loading: sessionLoading } = useSession()
  const [member, setMember] = useState<HouseholdMember | null>(null)
  const [memberLoading, setMemberLoading] = useState(true)

  useEffect(() => {
    if (!session) {
      setMember(null)
      setMemberLoading(false)
      return
    }
    let cancelled = false
    setMemberLoading(true)
    fetchOwnMember(session.user.id)
      .then((result) => {
        if (!cancelled) setMember(result)
      })
      .finally(() => {
        if (!cancelled) setMemberLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  if (sessionLoading || (session && memberLoading)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <AuthScreen />
  }

  if (!member) {
    return <HouseholdSetup onCreated={setMember} />
  }

  return <SignedInApp self={member} />
}

export default App
