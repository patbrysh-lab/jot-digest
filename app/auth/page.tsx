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
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else window.location.href = '/capture'
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Check your email to confirm your account.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">

      {/* Brand mark */}
      <div className="mb-12 text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-3xl mb-5"
          style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.3) 0%, rgba(99,102,241,0.2) 100%)',
            border: '1px solid rgba(124,58,237,0.35)',
            boxShadow: '0 0 40px rgba(124,58,237,0.25), 0 1px 0 rgba(255,255,255,0.08) inset',
          }}
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"
            style={{ color: '#c4b5fd' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-slate-50 tracking-tight">Jot Digest</h1>
        <p className="text-slate-500 mt-2 text-sm">Capture everything. Distill what matters.</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm card p-7">
        <h2 className="text-xl font-semibold text-slate-100 mb-1">
          {mode === 'sign-in' ? 'Welcome back' : 'Create account'}
        </h2>
        <p className="text-slate-600 text-sm mb-7">
          {mode === 'sign-in' ? 'Sign in to your workspace.' : 'Start capturing your ideas.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-widest">
              Email
            </label>
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
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-widest">
              Password
            </label>
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
            <div
              className="text-sm rounded-xl px-4 py-3"
              style={{
                color: '#fca5a5',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              {error}
            </div>
          )}
          {message && (
            <div
              className="text-sm rounded-xl px-4 py-3"
              style={{
                color: '#5eead4',
                background: 'rgba(20,184,166,0.1)',
                border: '1px solid rgba(20,184,166,0.2)',
              }}
            >
              {message}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 mt-2 text-base">
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading…
              </span>
            ) : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 pt-6 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(''); setMessage('') }}
            className="text-sm text-slate-600 hover:text-slate-400 transition-colors"
          >
            {mode === 'sign-in' ? "No account? Sign up free" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
