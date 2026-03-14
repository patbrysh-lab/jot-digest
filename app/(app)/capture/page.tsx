'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { Item, UrlSummary } from '@/types'
import { format } from 'date-fns'

function isUrl(str: string): boolean {
  try {
    const url = new URL(str.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch { return false }
}

/* ─── Per-type color palette ─── */
const TYPE_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  task:       { label: 'Task',      color: '#a78bfa', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.22)' },
  curiosity:  { label: 'Curiosity', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  content:    { label: 'Content',   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  event:      { label: 'Event',     color: '#f472b6', bg: 'rgba(244,114,182,0.1)', border: 'rgba(244,114,182,0.2)' },
  idea:       { label: 'Idea',      color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)' },
  reference:  { label: 'Reference', color: '#22d3ee', bg: 'rgba(34,211,238,0.1)',  border: 'rgba(34,211,238,0.2)' },
  catch_all:  { label: 'Misc',      color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.12)' },
}

const STATE_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  captured:    { label: 'Captured',    color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)' },
  triaged:     { label: 'Triaged',     color: '#2dd4bf', bg: 'rgba(45,212,191,0.1)',   border: 'rgba(45,212,191,0.2)' },
  ready:       { label: 'Ready',       color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.2)' },
  in_progress: { label: 'In Progress', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.2)' },
  done:        { label: 'Done',        color: '#475569', bg: 'rgba(71,85,105,0.1)',    border: 'rgba(71,85,105,0.15)' },
}

export default function CapturePage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitPhase, setSubmitPhase] = useState<'saving' | 'enriching' | null>(null)
  const [addError, setAddError] = useState('')
  const [search, setSearch] = useState('')
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set())
  const [userId, setUserId] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)

  const [urlPreview, setUrlPreview] = useState<UrlSummary | null>(null)
  const [urlFetching, setUrlFetching] = useState(false)
  const [urlError, setUrlError] = useState('')
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFetchedUrl = useRef<string>('')

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('items')
      .select('*')
      .not('state', 'eq', 'archived')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  useEffect(() => {
    const trimmed = text.trim()
    if (!isUrl(trimmed)) {
      setUrlPreview(null); setUrlError(''); lastFetchedUrl.current = ''
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
      return
    }
    if (trimmed === lastFetchedUrl.current) return
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)

    fetchDebounceRef.current = setTimeout(async () => {
      setUrlFetching(true); setUrlError(''); setUrlPreview(null)
      lastFetchedUrl.current = trimmed
      try {
        const res = await fetch('/api/inbox/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        })
        const data = await res.json()
        if (res.ok) setUrlPreview(data)
        else setUrlError(data.error || 'Could not fetch URL')
      } catch { setUrlError('Could not fetch URL') }
      finally { setUrlFetching(false) }
    }, 600)

    return () => { if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current) }
  }, [text])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || !userId) return
    setSubmitting(true); setAddError(''); setSubmitPhase('saving')

    const trimmed = text.trim()
    const detectedUrl = isUrl(trimmed) ? trimmed : null
    const rawText = detectedUrl && urlPreview
      ? [`URL: ${detectedUrl}`, `Title: ${urlPreview.title}`,
          urlPreview.description && `Description: ${urlPreview.description}`,
          urlPreview.mainText && `Content: ${urlPreview.mainText}`]
          .filter(Boolean).join('\n')
      : trimmed

    const { data: item, error } = await supabase
      .from('items')
      .insert({
        user_id: userId, raw_text: rawText, url: detectedUrl,
        url_summary: urlPreview ?? null,
        source: detectedUrl ? 'url' : 'manual',
        state: 'captured', context: 'unknown',
      })
      .select().single()

    if (error || !item) {
      setAddError(error?.message || 'Failed to save')
      setSubmitting(false); setSubmitPhase(null); return
    }

    setItems(prev => [item, ...prev])
    setText(''); setUrlPreview(null); setUrlError(''); lastFetchedUrl.current = ''

    await supabase.from('state_history').insert({ item_id: item.id, from_state: null, to_state: 'captured', changed_by: 'user' })

    setSubmitPhase('enriching')
    setEnrichingIds(prev => new Set(prev).add(item.id))
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      try {
        await fetch(`/api/items/${item.id}/enrich`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        await loadItems()
      } catch { /* enrichment failed silently */ }
    }

    setEnrichingIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
    setSubmitting(false); setSubmitPhase(null)
  }

  async function handleArchive(id: string) {
    await supabase.from('items').update({ state: 'archived' }).eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const textIsUrl = isUrl(text.trim())
  const filtered = items.filter(i => !search || (i.raw_text || '').toLowerCase().includes(search.toLowerCase()))
  const today = format(new Date(), 'EEEE, MMMM d').toUpperCase()

  return (
    <div className="px-4 pt-8 pb-4">

      {/* Page header */}
      <div className="mb-6">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">{today}</p>
        <h1 className="text-[32px] font-bold text-slate-50 tracking-tight leading-none">Capture</h1>
        <p className="text-slate-500 text-sm mt-1.5">Everything you think matters. Nothing lost.</p>
      </div>

      {/* ─── Hero compose area ─── */}
      <form onSubmit={handleAdd} className="mb-6">
        <div
          className="relative overflow-hidden transition-all duration-200"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '20px',
            border: focused
              ? '1px solid rgba(124,58,237,0.5)'
              : '1px solid rgba(255,255,255,0.09)',
            boxShadow: focused
              ? '0 0 0 3px rgba(124,58,237,0.1), 0 8px 32px rgba(0,0,0,0.4)'
              : '0 4px 24px rgba(0,0,0,0.35)',
          }}
        >
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="What's on your mind?"
            className="w-full min-h-[130px] px-5 py-5 text-base text-slate-100 placeholder-slate-600 resize-none bg-transparent focus:outline-none leading-relaxed"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(e as any) }}
          />

          {/* URL preview inline */}
          {textIsUrl && (
            <div className="px-4 pb-3">
              {urlFetching && (
                <div className="flex items-center gap-2 text-xs text-slate-600 py-2">
                  <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Fetching page…
                </div>
              )}
              {urlPreview && !urlFetching && (
                <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {urlPreview.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urlPreview.image} alt="" className="w-full h-24 object-cover opacity-70"
                      onError={e => (e.currentTarget.style.display = 'none')} />
                  )}
                  <div className="px-3 py-2.5">
                    <p className="text-xs font-semibold text-slate-200 leading-snug">{urlPreview.title}</p>
                    {urlPreview.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{urlPreview.description}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1">{urlPreview.siteName}</p>
                  </div>
                </div>
              )}
              {urlError && !urlFetching && (
                <p className="text-xs text-slate-600 py-1.5">
                  <span className="text-amber-500">⚠</span> {urlError} — will still save.
                </p>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-[11px] text-slate-600 font-medium select-none">
              {submitting
                ? (submitPhase === 'enriching' ? '✦ Enriching with AI…' : 'Saving…')
                : '⌘↵ to capture'}
            </span>
            <button
              type="submit"
              disabled={submitting || !text.trim() || urlFetching}
              className="btn-primary py-2 text-xs"
            >
              {submitting ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15"/>
                  </svg>
                  Capture
                </>
              )}
            </button>
          </div>
        </div>

        {addError && (
          <p className="text-xs mt-2 px-4 py-2.5 rounded-xl" style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {addError}
          </p>
        )}
      </form>

      {/* Search */}
      <div className="relative mb-5">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm transition-all"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#cbd5e1',
          }}
          onFocus={e => {
            (e.target as HTMLInputElement).style.borderColor = 'rgba(124,58,237,0.5)'
            ;(e.target as HTMLInputElement).style.outline = 'none'
          }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.06)' }}
        />
      </div>

      {/* Items list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="h-4 rounded-lg w-3/4 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-3 rounded-lg w-1/3" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4 opacity-30">✦</div>
          <p className="text-slate-500 text-sm">
            {items.length === 0 ? 'Your mind is clear. Start capturing.' : 'Nothing matches.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, i) => (
            <div key={item.id} className="animate-fade-in" style={{ animationDelay: `${i * 0.04}s` }}>
              <CaptureCard item={item} enriching={enrichingIds.has(item.id)} onArchive={handleArchive} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CaptureCard({ item, enriching, onArchive }: { item: Item; enriching: boolean; onArchive: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const typeStyle = item.item_type ? TYPE_STYLES[item.item_type] : null
  const stateStyle = STATE_STYLES[item.state]

  const archiveBtn = (
    <button
      onClick={() => onArchive(item.id)}
      className="shrink-0 p-1.5 rounded-xl transition-all duration-150 opacity-0 group-hover:opacity-100"
      style={{ color: '#334155' }}
      onMouseEnter={e => (e.currentTarget.style.color = '#64748b')}
      onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>
  )

  /* ── URL card ── */
  if (item.url && item.url_summary) {
    const s = item.url_summary
    return (
      <div className="card card-hover group p-4">
        {s.image && (
          <div className="relative rounded-xl overflow-hidden mb-3 h-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.image} alt="" className="w-full h-full object-cover opacity-50" onError={e => (e.currentTarget.parentElement!.style.display = 'none')} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(8,10,18,0.9) 0%, transparent 60%)' }} />
          </div>
        )}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100 leading-snug mb-0.5">{s.title}</p>
            {s.description && (
              <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{s.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <span className="text-[10px] text-slate-600">
                {s.siteName || new URL(item.url).hostname.replace(/^www\./, '')}
              </span>
              <span className="text-slate-700">·</span>
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors font-medium"
                onClick={e => e.stopPropagation()}>
                Open ↗
              </a>
              <span className="text-[10px] text-slate-700 ml-auto">
                {format(new Date(item.created_at), 'MMM d')}
              </span>
              <div className="flex gap-1 flex-wrap">
                <StateBadge stateStyle={stateStyle} enriching={enriching} />
                {typeStyle && <ColorPill label={typeStyle.label} color={typeStyle.color} bg={typeStyle.bg} border={typeStyle.border} />}
              </div>
            </div>
          </div>
          {archiveBtn}
        </div>
      </div>
    )
  }

  /* ── Text card ── */
  const displayText = item.raw_text || ''
  const isLong = displayText.length > 140

  return (
    <div className="card card-hover group p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 leading-relaxed break-words">
            {isLong && !expanded ? displayText.slice(0, 140) + '…' : displayText}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(!expanded)}
              className="text-xs text-violet-400 hover:text-violet-300 mt-1 transition-colors">
              {expanded ? 'Less' : 'More'}
            </button>
          )}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className="text-[10px] text-slate-700">
              {format(new Date(item.created_at), 'MMM d, h:mm a')}
            </span>
            <StateBadge stateStyle={stateStyle} enriching={enriching} />
            {typeStyle && <ColorPill label={typeStyle.label} color={typeStyle.color} bg={typeStyle.bg} border={typeStyle.border} />}
            {item.context && item.context !== 'unknown' && (
              <span className="text-[10px] text-slate-600 capitalize">{item.context}</span>
            )}
          </div>
        </div>
        {archiveBtn}
      </div>
    </div>
  )
}

function StateBadge({ stateStyle, enriching }: { stateStyle: typeof STATE_STYLES[string] | undefined; enriching: boolean }) {
  if (enriching) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-1.5 py-0.5 font-medium"
        style={{ color: '#a78bfa', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)' }}>
        <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Enriching
      </span>
    )
  }
  if (!stateStyle) return null
  return (
    <ColorPill label={stateStyle.label} color={stateStyle.color} bg={stateStyle.bg} border={stateStyle.border} />
  )
}

function ColorPill({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span className="inline-flex items-center text-[10px] rounded-full px-1.5 py-0.5 font-medium"
      style={{ color, background: bg, border: `1px solid ${border}` }}>
      {label}
    </span>
  )
}
