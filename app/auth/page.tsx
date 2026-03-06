'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        window.location.href = '/inbox'
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email to confirm your account, then sign in.')
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Logo / Brand */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-ink-900 mb-4">
          <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-semibold text-ink-900">Jot Digest</h1>
        <p className="text-ink-400 mt-1 text-sm">Capture everything. Distill what matters.</p>
      </div>

      <div className="w-full max-w-sm card p-6">
        <h2 className="font-display text-lg font-semibold text-ink-800 mb-6">
          {mode === 'sign-in' ? 'Welcome back' : 'Create account'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1.5 uppercase tracking-wide">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1.5 uppercase tracking-wide">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {message && (
            <div className="text-sm text-sage-700 bg-sage-50 border border-sage-200 rounded-lg px-3 py-2">
              {message}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? 'Loading...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(''); setMessage('') }}
            className="text-sm text-ink-500 hover:text-ink-800 transition-colors"
          >
            {mode === 'sign-in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
