import { useState } from 'react'
import type { FormEvent } from 'react'
import { createHouseholdForUser, type HouseholdMember } from '../lib/household'

interface Props {
  onCreated: (member: HouseholdMember) => void
}

// First-run only (DESIGN.md §5). Joining an existing household via an
// invite code is phase 1 scope.
export function HouseholdSetup({ onCreated }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const member = await createHouseholdForUser(displayName.trim())
      onCreated(member)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-white p-4 dark:bg-slate-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 p-6 shadow-sm dark:border-slate-800"
      >
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Set up your household</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            What should we call you? Your partner can join later.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-slate-700 dark:text-slate-300">Display name</span>
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {submitting ? 'Creating…' : 'Create household'}
        </button>
      </form>
    </div>
  )
}
