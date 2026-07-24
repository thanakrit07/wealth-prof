import { useState } from 'react'
import type { FormEvent } from 'react'
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
    <div className="flex min-h-svh items-center justify-center bg-white p-4 dark:bg-slate-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 p-6 shadow-sm dark:border-slate-800"
      >
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Set a new password</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Choose a new password to finish resetting your account.</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-slate-700 dark:text-slate-300">New password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-700 dark:text-slate-300">Confirm password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  )
}
