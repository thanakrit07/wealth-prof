import { useState } from 'react'
import type { FormEvent } from 'react'
import { AuthLayout, authInputClass, authLinkButtonClass, authPrimaryButtonClass } from './AuthLayout'
import { createHouseholdForUser, type HouseholdMember } from '../lib/household'
import { joinHouseholdWithCode } from '../lib/invite'

interface Props {
  onCreated: (member: HouseholdMember) => void
  inviteCode?: string | null
}

// First-run only (DESIGN.md §5): either create a brand-new household, or
// (with an invite code, e.g. from a shared link) join the partner's
// existing one instead.
export function HouseholdSetup({ onCreated, inviteCode }: Props) {
  const [mode, setMode] = useState<'create' | 'join'>(inviteCode ? 'join' : 'create')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState(inviteCode ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const member =
        mode === 'create'
          ? await createHouseholdForUser(displayName.trim())
          : await joinHouseholdWithCode(code.trim(), displayName.trim())
      onCreated(member)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title={mode === 'create' ? 'Set up your household' : 'Join your household'}
      subtitle={
        mode === 'create'
          ? 'What should we call you? Your partner can join later.'
          : "Enter the invite code your partner shared, and what we should call you."
      }
      onSubmit={handleSubmit}
    >
      {mode === 'join' && (
        <label className="block space-y-1">
          <span className="text-sm text-foreground/80">Invite code</span>
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${authInputClass} font-mono`}
          />
        </label>
      )}

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
        {submitting ? 'Please wait…' : mode === 'create' ? 'Create household' : 'Join household'}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'create' ? 'join' : 'create')
          setError(null)
        }}
        className={authLinkButtonClass}
      >
        {mode === 'create' ? 'Have an invite code? Join instead' : "Don't have a code? Create a new household"}
      </button>
    </AuthLayout>
  )
}
