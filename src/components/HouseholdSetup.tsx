import { useState } from 'react'
import type { FormEvent } from 'react'
import { AuthLayout, authInputClass, authPrimaryButtonClass } from './AuthLayout'
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
    <AuthLayout
      title="Set up your household"
      subtitle="What should we call you? Your partner can join later."
      onSubmit={handleSubmit}
    >
      <label className="block space-y-1">
        <span className="text-sm text-foreground/80">Display name</span>
        <input
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={authInputClass}
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button type="submit" disabled={submitting} className={authPrimaryButtonClass}>
        {submitting ? 'Creating…' : 'Create household'}
      </button>
    </AuthLayout>
  )
}
