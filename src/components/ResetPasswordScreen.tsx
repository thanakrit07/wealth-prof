import { useState } from 'react'
import type { FormEvent } from 'react'
import { AuthLayout, authInputClass, authPrimaryButtonClass } from './AuthLayout'
import { supabase } from '../lib/supabase'

interface Props {
  onDone: () => void
}

export function ResetPasswordScreen({ onDone }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
    } else {
      onDone()
    }
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a new password to finish resetting your account."
      onSubmit={handleSubmit}
    >
      <label className="block space-y-1">
        <span className="text-sm text-foreground/80">New password</span>
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={authInputClass}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-foreground/80">Confirm password</span>
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={authInputClass}
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button type="submit" disabled={submitting} className={authPrimaryButtonClass}>
        {submitting ? 'Saving…' : 'Save new password'}
      </button>
    </AuthLayout>
  )
}
