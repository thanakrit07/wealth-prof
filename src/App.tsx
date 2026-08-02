import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import type { Tab } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ErrorScreen } from '@/components/ErrorScreen'
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
        {/* Inside the shell, so a screen that throws leaves the bottom nav
            usable — tapping any other tab is itself the recovery, and the
            resetKeys below clear the error when it happens. */}
        <ErrorBoundary
          resetKeys={[tab]}
          fallback={(error, reset) => (
            <ErrorScreen
              error={error}
              variant="inline"
              onRetry={reset}
              onGoHome={() => {
                setTab('transactions')
                reset()
              }}
            />
          )}
        >
          {screens[tab as Tab] ?? screens.home}
        </ErrorBoundary>
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

  // Outer net for anything the per-tab boundary can't catch (the shell, the
  // providers, a materialiser). Nothing of the app is left to navigate with
  // here, so recovery is a reload at the bare path.
  return (
    <ErrorBoundary fallback={(error) => <ErrorScreen error={error} variant="screen" />}>
      <SignedInApp self={member} />
    </ErrorBoundary>
  )
}

export default App
