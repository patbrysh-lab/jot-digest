'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useSearchParams } from 'next/navigation'

interface Integration {
  provider: string
  connected_email: string | null
  token_expires_at: string | null
  created_at: string
}

export default function SettingsPage() {
  const [integration, setIntegration] = useState<Integration | null | undefined>(undefined)
  const [disconnecting, setDisconnecting] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  const supabase = createClient()
  const searchParams = useSearchParams()
  const justConnected = searchParams.get('connected') === '1'
  const connectError  = searchParams.get('error')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setToken(session.access_token)

      const { data } = await supabase
        .from('user_integrations')
        .select('provider, connected_email, token_expires_at, created_at')
        .eq('provider', 'google_calendar')
        .maybeSingle()

      setIntegration(data ?? null)
    }
    load()
  }, [])

  async function handleConnect() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    window.location.href = `/api/auth/google/start?token=${session.access_token}`
  }

  async function handleDisconnect() {
    if (!token) return
    setDisconnecting(true)
    await fetch('/api/integrations/google_calendar', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setIntegration(null)
    setDisconnecting(false)
  }

  const loading = integration === undefined

  return (
    <div className="px-4 pt-8 pb-4">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Settings</p>
        <h1 className="text-[32px] font-bold text-slate-50 tracking-tight leading-none">Integrations</h1>
        <p className="text-slate-500 text-sm mt-1.5">Connect external services to enhance your workflow.</p>
      </div>

      {/* Flash messages */}
      {justConnected && (
        <div
          className="rounded-2xl px-4 py-3 mb-5 text-sm"
          style={{ color: '#5eead4', background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.2)' }}
        >
          Google Calendar connected successfully.
        </div>
      )}
      {connectError && (
        <div
          className="rounded-2xl px-4 py-3 mb-5 text-sm"
          style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          Connection failed: {connectError.replace(/_/g, ' ')}
        </div>
      )}

      {/* Google Calendar card */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          {/* Google Calendar icon */}
          <div
            className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{
              background: 'rgba(96,165,250,0.1)',
              border: '1px solid rgba(96,165,250,0.2)',
            }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="#60a5fa" strokeWidth="1.5"/>
              <path d="M16 2v4M8 2v4M3 10h18" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M8 14h2v2H8v-2zM11 14h2v2h-2v-2zM14 14h2v2h-2v-2z" fill="#60a5fa"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-sm font-semibold text-slate-100">Google Calendar</h2>
              {!loading && integration && (
                <span
                  className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ color: '#2dd4bf', background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.2)' }}
                >
                  Connected
                </span>
              )}
            </div>

            {loading ? (
              <div className="h-3 w-32 rounded mt-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
            ) : integration ? (
              <p className="text-xs text-slate-500 mt-0.5">
                {integration.connected_email ?? 'Google account'}
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-0.5">
                See free/busy slots in your Sprint view.
              </p>
            )}
          </div>

          {/* Action button */}
          <div className="shrink-0 mt-0.5">
            {loading ? (
              <div className="h-8 w-20 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }} />
            ) : integration ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="btn-primary py-1.5 px-3 text-xs"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        {/* What this enables */}
        {!integration && !loading && (
          <div
            className="mt-4 pt-4 space-y-2"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            {[
              'See free/busy windows on the Sprint pick screen',
              'Know exactly when you can fit a 15-min, 30-min, or hour sprint',
            ].map(feature => (
              <div key={feature} className="flex items-start gap-2">
                <span className="text-[10px] mt-0.5" style={{ color: '#7c3aed' }}>✦</span>
                <p className="text-xs text-slate-600">{feature}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="text-[11px] text-slate-700 mt-6 text-center px-4 leading-relaxed">
        Jot Digest requests read-only calendar access. No events are created or modified.
      </p>
    </div>
  )
}
