import { useEffect, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { HouseholdSetup } from './components/HouseholdSetup'
import { fetchOwnMember, type HouseholdMember } from './lib/household'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'

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
      <div className="flex min-h-svh items-center justify-center bg-white dark:bg-slate-950">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <AuthScreen />
  }

  if (!member) {
    return <HouseholdSetup onCreated={setMember} />
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <p className="text-sm">Signed in as {member.display_name}. Screens land in later phases.</p>
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
      >
        Sign out
      </button>
    </div>
  )
}

export default App
