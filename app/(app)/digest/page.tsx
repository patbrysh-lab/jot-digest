'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'
import { format, subDays } from 'date-fns'

export default function DigestPage() {
  const [rangeStart, setRangeStart] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [rangeEnd, setRangeEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [itemCount, setItemCount] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)
  const [recentDigests, setRecentDigests] = useState<any[]>([])
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function checkItems() {
    setChecking(true)
    const { count } = await supabase
      .from('inbox_items')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'inbox')
      .gte('created_at', rangeStart)
      .lte('created_at', rangeEnd + 'T23:59:59')
    setItemCount(count || 0)
    setChecking(false)
  }

  useEffect(() => { checkItems() }, [rangeStart, rangeEnd])

  useEffect(() => {
    async function loadDigests() {
      const { data } = await supabase
        .from('digest_runs')
        .select('id, created_at, range_start, range_end')
        .order('created_at', { ascending: false })
        .limit(5)
      setRecentDigests(data || [])
    }
    loadDigests()
  }, [])

  async function handleRunDigest() {
    if (!itemCount) return
    setLoading(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    const currentToken = session?.access_token

    if (!currentToken) {
      setError('Not logged in. Please refresh the page and try again.')
      setLoading(false)
      return
    }

    const response = await fetch('/api/digest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ rangeStart, rangeEnd }),
    })

    if (!response.ok) {
      const data = await response.json()
      setError(data.error || 'Failed to run digest')
      setLoading(false)
      return
    }

    const { digestRunId } = await response.json()
    router.push(`/review/${digestRunId}`)
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Run Digest</h1>
        <p className="text-ink-400 text-sm mt-0.5">Select a date range and let Claude process your inbox.</p>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-4">Date Range</h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-ink-500 mb-1.5">From</label>
            <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1.5">To</label>
            <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="input" />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-5">
          {[
            { label: 'Today', days: 0 },
            { label: 'Last 3 days', days: 3 },
            { label: 'Last week', days: 7 },
            { label: 'Last 2 weeks', days: 14 },
          ].map(({ label, days }) => (
            <button
              key={label}
              onClick={() => {
                setRangeStart(format(subDays(new Date(), days), 'yyyy-MM-dd'))
                setRangeEnd(format(new Date(), 'yyyy-MM-dd'))
              }}
              className="btn-secondary text-xs py-1 px-2.5"
            >
              {label}
            </button>
          ))}
        </div>

        <div className={`rounded-lg px-4 py-3 mb-5 text-sm ${
          itemCount === null || checking
            ? 'bg-ink-50 text-ink-400'
            : itemCount === 0
            ? 'bg-amber-50 text-amber-700 border border-amber-200'
            : 'bg-sage-50 text-sage-700 border border-sage-200'
        }`}>
          {checking ? (
            <span className="animate-pulse">Checking...</span>
          ) : itemCount === null ? (
            'Select a range to see available items'
          ) : itemCount === 0 ? (
            '⚠️ No inbox items in this range. Add some notes first!'
          ) : (
            `✓ ${itemCount} inbox ${itemCount === 1 ? 'item' : 'items'} ready to digest`
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleRunDigest}
          disabled={loading || !itemCount || checking}
          className="btn-primary w-full justify-center text-base py-3"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing with Claude...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Run Digest
            </>
          )}
        </button>
      </div>

      {recentDigests.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Recent Digests</h2>
          <div className="space-y-2">
            {recentDigests.map(d => (
              <button
                key={d.id}
                onClick={() => router.push(`/review/${d.id}`)}
                className="card p-4 w-full text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-800">
                      {format(new Date(d.range_start), 'MMM d')} – {format(new Date(d.range_end), 'MMM d, yyyy')}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">Ran {format(new Date(d.created_at), 'MMM d, h:mm a')}</p>
                  </div>
                  <svg className="w-4 h-4 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}