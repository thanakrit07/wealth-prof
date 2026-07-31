import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { Tab } from '@/components/layout/AppShell'
import { AuthScreen } from './components/AuthScreen'
import { HouseholdSetup } from './components/HouseholdSetup'
import { ResetPasswordScreen } from './components/ResetPasswordScreen'
import { OverviewScreen } from '@/features/home/OverviewScreen'
import { TransactionsScreen } from '@/features/transactions/TransactionsScreen'
import { TransactionSheet } from '@/features/transactions/TransactionSheet'
import { AccountsScreen } from '@/features/accounts/AccountsScreen'
import { InstallmentMaterialiser } from '@/features/installments/InstallmentMaterialiser'
import { PlanScreen } from '@/features/plan/PlanScreen'
import { RecurringMaterialiser } from '@/features/plan/RecurringMaterialiser'
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
  // Transactions is the landing tab (DESIGN.md §7.1 v3.1): the daily habit
  // is "open → jot what was spent → check what's recorded".
  const [tab, setTab] = useUrlState('tab', 'transactions')
  const [category, setCategory] = useUrlState('cat', '')
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const screens: Record<Tab, React.ReactNode> = {
    home: (
      <OverviewScreen
        month={month}
        person={person as PersonFilter}
        onCategorySelect={(id) => {
          setCategory(id)
          setTab('transactions')
        }}
      />
    ),
    transactions: (
      <TransactionsScreen
        month={month}
        person={person as PersonFilter}
        categoryId={category || null}
        onClearCategory={() => setCategory('')}
      />
    ),
    accounts: <AccountsScreen />,
    plan: <PlanScreen />,
    settings: <SettingsScreen />,
  }

  return (
    <HouseholdProvider self={self}>
      <RecurringMaterialiser />
      <InstallmentMaterialiser />
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
  const { session, loading: sessionLoading, passwordRecovery, clearPasswordRecovery } = useSession()
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

  if (passwordRecovery) {
    return <ResetPasswordScreen onDone={clearPasswordRecovery} />
  }

  if (!session) {
    return <AuthScreen />
  }

  if (!member) {
    const inviteCode = new URLSearchParams(window.location.search).get('invite')
    return <HouseholdSetup onCreated={setMember} inviteCode={inviteCode} />
  }

  return <SignedInApp self={member} />
}

export default App
