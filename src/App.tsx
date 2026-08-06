import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import type { Tab } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ErrorScreen } from '@/components/ErrorScreen'
import { AuthScreen } from './components/AuthScreen'
import { HouseholdSetup } from './components/HouseholdSetup'
import { ResetPasswordScreen } from './components/ResetPasswordScreen'
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
  // Records is the landing tab (DESIGN.md §7.1 v3.5): the daily habit is
  // "open → jot what was spent → check what's recorded". The url key stays
  // 'transactions' so existing bookmarks/URL state keep working.
  const [tab, setTab] = useUrlState('tab', 'transactions')
  const [category, setCategory] = useUrlState('cat', '')
  const [account, setAccount] = useUrlState('acct', '')
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Records/Balances/Upcoming — the tab bar's own keys — mapped onto the
  // URL's legacy tab names so an old bookmark for the removed Overview/Plan
  // tabs still lands somewhere sensible instead of a blank screen.
  const resolvedTab: Tab =
    tab === 'accounts' ? 'balances' : tab === 'plan' ? 'upcoming' : tab === 'home' || tab === 'transactions' ? 'records' : (tab as Tab)

  const screens: Record<Tab, React.ReactNode> = {
    records: (
      <TransactionsScreen
        month={month}
        person={person as PersonFilter}
        search={search}
        categoryId={category || null}
        onClearCategory={() => setCategory('')}
        accountId={account || null}
        onClearAccount={() => setAccount('')}
      />
    ),
    balances: (
      <AccountsScreen
        person={person as PersonFilter}
        onOpenAccount={(accountId) => {
          setAccount(accountId)
          setTab('transactions')
        }}
      />
    ),
    upcoming: <PlanScreen />,
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
        tab={resolvedTab}
        onTabChange={(t) => setTab(t)}
        onQuickAdd={() => setQuickAddOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        search={search}
        onSearchChange={setSearch}
      >
        {/* Inside the shell, so a screen that throws leaves the bottom nav
            usable — tapping any other tab is itself the recovery, and the
            resetKeys below clear the error when it happens. */}
        <ErrorBoundary
          resetKeys={[resolvedTab]}
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
          {screens[resolvedTab] ?? screens.records}
        </ErrorBoundary>
      </AppShell>
      <TransactionSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
      {settingsOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-background">
          <header className="sticky top-0 flex items-center gap-2 border-b bg-background px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(false)} aria-label="Back">
              <ChevronLeft className="size-5" />
            </Button>
            <h1 className="font-heading text-sm font-medium">Settings</h1>
          </header>
          <div className="flex-1 overflow-y-auto">
            <SettingsScreen />
          </div>
        </div>
      )}
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
