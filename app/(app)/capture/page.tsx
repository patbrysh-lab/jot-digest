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

const STATE_BADGES: Record<string, { label: string; color: string }> = {
  captured:    { label: 'Captured',    color: 'bg-amber-100 text-amber-700' },
  triaged:     { label: 'Triaged',     color: 'bg-green-100 text-green-700' },
  ready:       { label: 'Ready',       color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-700' },
  done:        { label: 'Done',        color: 'bg-ink-100 text-ink-500' },
  archived:    { label: 'Archived',    color: 'bg-ink-50 text-ink-400' },
}

const TYPE_LABELS: Record<string, string> = {
  task: 'Task', curiosity: 'Curiosity', content: 'Content',
  event: 'Event', idea: 'Idea', reference: 'Ref', catch_all: 'Misc',
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

  // URL auto-detect + preview
  useEffect(() => {
    const trimmed = text.trim()
    if (!isUrl(trimmed)) {
      setUrlPreview(null)
      setUrlError('')
      lastFetchedUrl.current = ''
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
      return
    }
    if (trimmed === lastFetchedUrl.current) return
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)

    fetchDebounceRef.current = setTimeout(async () => {
      setUrlFetching(true)
      setUrlError('')
      setUrlPreview(null)
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
      } catch {
        setUrlError('Could not fetch URL')
      } finally {
        setUrlFetching(false)
      }
    }, 600)

    return () => { if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current) }
  }, [text])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || !userId) return
    setSubmitting(true)
    setAddError('')
    setSubmitPhase('saving')

    const trimmed = text.trim()
    const detectedUrl = isUrl(trimmed) ? trimmed : null

    const rawText = detectedUrl && urlPreview
      ? [
          `URL: ${detectedUrl}`,
          `Title: ${urlPreview.title}`,
          urlPreview.description && `Description: ${urlPreview.description}`,
          urlPreview.mainText && `Content: ${urlPreview.mainText}`,
        ].filter(Boolean).join('\n')
      : trimmed

    const { data: item, error } = await supabase
      .from('items')
      .insert({
        user_id: userId,
        raw_text: rawText,
        url: detectedUrl,
        url_summary: urlPreview ?? null,
        source: detectedUrl ? 'url' : 'manual',
        state: 'captured',
        context: 'unknown',
      })
      .select()
      .single()

    if (error || !item) {
      setAddError(error?.message || 'Failed to save')
      setSubmitting(false)
      setSubmitPhase(null)
      return
    }

    // Add to list immediately, clear form
    setItems(prev => [item, ...prev])
    setText('')
    setUrlPreview(null)
    setUrlError('')
    lastFetchedUrl.current = ''

    // State history: captured
    await supabase.from('state_history').insert({
      item_id: item.id,
      from_state: null,
      to_state: 'captured',
      changed_by: 'user',
    })

    // Trigger enrichment
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
      } catch {
        // Enrichment failed silently — item stays as captured
      }
    }

    setEnrichingIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
    setSubmitting(false)
    setSubmitPhase(null)
  }

  async function handleArchive(id: string) {
    await supabase.from('items').update({ state: 'archived' }).eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const textIsUrl = isUrl(text.trim())
  const filtered = items.filter(item =>
    !search || (item.raw_text || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Capture</h1>
        <p className="text-ink-400 text-sm mt-0.5">{items.length} {items.length === 1 ? 'item' : 'items'}</p>
      </div>

      <form onSubmit={handleAdd} className="card p-4 mb-5">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What's on your mind? Or paste a URL…"
          className="input resize-none min-h-[80px] mb-3 font-sans"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(e as any) }}
        />

        {textIsUrl && (
          <div className="mb-3">
            {urlFetching && (
              <div className="flex items-center gap-2 text-xs text-ink-400 bg-ink-50 rounded-lg px-3 py-2.5">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Fetching page info…
              </div>
            )}
            {urlPreview && !urlFetching && (
              <div className="bg-ink-50 border border-ink-100 rounded-lg overflow-hidden">
                {urlPreview.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlPreview.image} alt="" className="w-full h-32 object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                )}
                <div className="px-3 py-2.5">
                  <p className="text-xs font-semibold text-ink-800 leading-snug">{urlPreview.title}</p>
                  {urlPreview.description && (
                    <p className="text-xs text-ink-500 mt-0.5 leading-relaxed line-clamp-2">{urlPreview.description}</p>
                  )}
                  <p className="text-[10px] text-ink-300 mt-1">{urlPreview.siteName}</p>
                </div>
              </div>
            )}
            {urlError && !urlFetching && (
              <div className="flex items-center gap-1.5 text-xs text-ink-400 bg-ink-50 rounded-lg px-3 py-2.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {urlError} — will still save.
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting || !text.trim() || urlFetching}
            className="btn-primary whitespace-nowrap ml-auto"
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {submitPhase === 'enriching' ? 'Enriching…' : 'Saving…'}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Capture
              </span>
            )}
          </button>
        </div>
        {addError && (
          <p className="text-xs text-red-600 mt-2 bg-red-50 border border-red-200 rounded px-2 py-1">{addError}</p>
        )}
        <p className="text-[11px] text-ink-300 mt-2">⌘+Enter to submit</p>
      </form>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          className="input"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 bg-ink-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-ink-50 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-ink-400 text-sm">
            {items.length === 0 ? 'Nothing captured yet. Start jotting!' : 'No items match.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 animate-fade-in">
          {filtered.map(item => (
            <CaptureCard
              key={item.id}
              item={item}
              enriching={enrichingIds.has(item.id)}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CaptureCard({
  item,
  enriching,
  onArchive,
}: {
  item: Item
  enriching: boolean
  onArchive: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (item.url && item.url_summary) {
    const s = item.url_summary
    return (
      <div className="card p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <svg className="w-3 h-3 text-ink-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              <span className="text-[10px] text-ink-400 truncate">
                {s.siteName || new URL(item.url).hostname.replace(/^www\./, '')}
              </span>
            </div>
            <p className="text-sm font-semibold text-ink-900 leading-snug mb-0.5">{s.title}</p>
            {s.description && (
              <p className="text-xs text-ink-500 leading-relaxed line-clamp-2">{s.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[11px] text-ink-300">{format(new Date(item.created_at), 'MMM d, h:mm a')}</span>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-amber-600 hover:text-amber-700 hover:underline"
                onClick={e => e.stopPropagation()}
              >
                Open ↗
              </a>
              <ItemBadges item={item} enriching={enriching} />
            </div>
          </div>
          <button
            onClick={() => onArchive(item.id)}
            className="shrink-0 p-1.5 rounded-lg text-ink-300 hover:text-ink-600 hover:bg-ink-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.75 7.5h16.5M8.25 7.5l.75-4.5h6l.75 4.5" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  const displayText = item.raw_text || ''
  const isLong = displayText.length > 120

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink-800 leading-relaxed break-words">
            {isLong && !expanded ? displayText.slice(0, 120) + '…' : displayText}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-amber-600 mt-1">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[11px] text-ink-300">{format(new Date(item.created_at), 'MMM d, h:mm a')}</span>
            <ItemBadges item={item} enriching={enriching} />
          </div>
        </div>
        <button
          onClick={() => onArchive(item.id)}
          className="shrink-0 p-1.5 rounded-lg text-ink-300 hover:text-ink-600 hover:bg-ink-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.75 7.5h16.5M8.25 7.5l.75-4.5h6l.75 4.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function ItemBadges({ item, enriching }: { item: Item; enriching: boolean }) {
  if (enriching) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
        <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Enriching
      </span>
    )
  }

  const badge = STATE_BADGES[item.state]
  return (
    <>
      {badge && (
        <span className={`text-[10px] rounded px-1.5 py-0.5 ${badge.color}`}>{badge.label}</span>
      )}
      {item.item_type && (
        <span className="text-[10px] bg-ink-100 text-ink-500 rounded px-1.5 py-0.5">
          {TYPE_LABELS[item.item_type] ?? item.item_type}
        </span>
      )}
      {item.context && item.context !== 'unknown' && (
        <span className="text-[10px] bg-ink-50 text-ink-400 rounded px-1.5 py-0.5">{item.context}</span>
      )}
    </>
  )
}
