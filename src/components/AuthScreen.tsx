import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'sign-in' | 'sign-up' | 'forgot-password'

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setNotice(null)

    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else if (mode === 'forgot-password') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) {
        setError(error.message)
      } else {
        setNotice('If that email has an account, a reset link has been sent.')
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else if (data.user && data.user.identities && data.user.identities.length === 0) {
        // Supabase signUp() never reveals whether an email is already registered
        // (anti-enumeration): a genuinely new signup gets a non-empty
        // `identities` array, an existing-and-confirmed email gets an empty
        // one with no error and no new email sent. Without this check the
        // user is told to "check your email" for a mail that never arrives.
        setError('This email already has an account — use "Sign in" instead.')
      } else {
        setNotice('Check your email to confirm your account, then sign in.')
      }
    }
    setSubmitting(false)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-white p-4 dark:bg-slate-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 p-6 shadow-sm dark:border-slate-800"
      >
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Wealth Prof</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {mode === 'sign-in' && 'Sign in to continue.'}
            {mode === 'sign-up' && 'Create an account.'}
            {mode === 'forgot-password' && "Enter your email and we'll send a reset link."}
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-slate-700 dark:text-slate-300">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        {mode !== 'forgot-password' && (
          <label className="block space-y-1">
            <span className="text-sm text-slate-700 dark:text-slate-300">Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        )}

        {mode === 'sign-in' && (
          <button
            type="button"
            onClick={() => {
              setMode('forgot-password')
              setError(null)
              setNotice(null)
            }}
            className="block text-sm text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
          >
            Forgot password?
          </button>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {submitting
            ? 'Please wait…'
            : mode === 'sign-in'
              ? 'Sign in'
              : mode === 'sign-up'
                ? 'Sign up'
                : 'Send reset link'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'sign-up' ? 'sign-in' : mode === 'sign-in' ? 'sign-up' : 'sign-in')
            setError(null)
            setNotice(null)
          }}
          className="w-full text-center text-sm text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
        >
          {mode === 'sign-in' && "Don't have an account? Sign up"}
          {mode === 'sign-up' && 'Already have an account? Sign in'}
          {mode === 'forgot-password' && 'Back to sign in'}
        </button>
      </form>
    </div>
  )
}
