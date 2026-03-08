'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { InboxItem, UrlSummary } from '@/types'
import { format } from 'date-fns'

function isUrl(str: string): boolean {
  const trimmed = str.trim()
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [addError, setAddError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  // URL preview state
  const [urlPreview, setUrlPreview] = useState<UrlSummary | null>(null)
  const [urlFetching, setUrlFetching] = useState(false)
  const [urlError, setUrlError] = useState('')
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFetchedUrl = useRef<string>('')

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null)
    })
  }, [])

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('inbox_items')
      .select('*')
      .eq('status', 'inbox')
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  // Detect URL in text and auto-fetch preview
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
        if (res.ok) {
          setUrlPreview(data)
        } else {
          setUrlError(data.error || 'Could not fetch URL')
        }
      } catch {
        setUrlError('Could not fetch URL')
      } finally {
        setUrlFetching(false)
      }
    }, 600)

    return () => {
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
    }
  }, [text])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setAddError('')

    const tags = tagInput.trim() ? tagInput.split(',').map(t => t.trim()).filter(Boolean) : []
    const trimmed = text.trim()
    const detectedUrl = isUrl(trimmed) ? trimmed : null

    // Build raw_text: if URL with a preview title, make it descriptive for Claude
    let rawText = trimmed
    if (detectedUrl && urlPreview) {
      const parts = [`URL: ${detectedUrl}`, `Title: ${urlPreview.title}`]
      if (urlPreview.description) parts.push(`Description: ${urlPreview.description}`)
      if (urlPreview.mainText) parts.push(`Content: ${urlPreview.mainText}`)
      rawText = parts.join('\n')
    }

    const insertData: any = {
      raw_text: rawText,
      source: detectedUrl ? 'url' : 'manual',
      status: 'inbox',
      tags: tags.length > 0 ? tags : null,
      url: detectedUrl,
      url_summary: urlPreview ?? null,
    }
    if (userId) insertData.user_id = userId

    const { error } = await supabase.from('inbox_items').insert(insertData)
    if (error) {
      setAddError(error.message)
    } else {
      setText('')
      setTagInput('')
      setUrlPreview(null)
      setUrlError('')
      lastFetchedUrl.current = ''
      await loadItems()
    }
    setSubmitting(false)
  }

  async function handleArchive(id: string) {
    await supabase.from('inbox_items').update({ status: 'archived' }).eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const allTags = Array.from(new Set(items.flatMap(i => i.tags || [])))
  const filtered = items.filter(item => {
    const matchesSearch = !search || item.raw_text.toLowerCase().includes(search.toLowerCase())
    const matchesTag = !filterTag || (item.tags || []).includes(filterTag)
    return matchesSearch && matchesTag
  })

  const textIsUrl = isUrl(text.trim())

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Inbox</h1>
        <p className="text-ink-400 text-sm mt-0.5">{items.length} {items.length === 1 ? 'item' : 'items'} waiting</p>
      </div>

      <form onSubmit={handleAdd} className="card p-4 mb-5">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What's on your mind? Or paste a URL…"
          className="input resize-none min-h-[80px] mb-3 font-sans"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(e as any) }}
        />

        {/* URL preview */}
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
                {urlError} — URL and note will still be saved.
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            placeholder="Tags (comma separated)"
            className="input flex-1 text-xs"
          />
          <button type="submit" disabled={submitting || !text.trim() || urlFetching} className="btn-primary whitespace-nowrap">
            {submitting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
            Add
          </button>
        </div>
        {addError && (
          <p className="text-xs text-red-600 mt-2 bg-red-50 border border-red-200 rounded px-2 py-1">{addError}</p>
        )}
        <p className="text-[11px] text-ink-300 mt-2">⌘+Enter to submit</p>
      </form>

      <div className="space-y-2 mb-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search inbox..." className="input" />
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterTag('')} className={`tag cursor-pointer ${!filterTag ? 'bg-ink-800 text-white' : 'hover:bg-ink-200'}`}>All</button>
            {allTags.map(tag => (
              <button key={tag} onClick={() => setFilterTag(filterTag === tag ? '' : tag)} className={`tag cursor-pointer ${filterTag === tag ? 'bg-ink-800 text-white' : 'hover:bg-ink-200'}`}>{tag}</button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card p-4 animate-pulse"><div className="h-4 bg-ink-100 rounded w-3/4 mb-2" /><div className="h-3 bg-ink-50 rounded w-1/4" /></div>)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-ink-400 text-sm">{items.length === 0 ? 'Your inbox is empty. Start jotting!' : 'No items match your filter.'}</p>
        </div>
      ) : (
        <div className="space-y-2 animate-fade-in">
          {filtered.map(item => <InboxCard key={item.id} item={item} onArchive={handleArchive} />)}
        </div>
      )}
    </div>
  )
}

function InboxCard({ item, onArchive }: { item: InboxItem; onArchive: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)

  if (item.source === 'url' && item.url) {
    const s = item.url_summary
    return (
      <div className="card p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {s ? (
              <>
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-3 h-3 text-ink-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  <span className="text-[10px] text-ink-400 truncate">{s.siteName || new URL(item.url).hostname.replace(/^www\./, '')}</span>
                </div>
                <p className="text-sm font-semibold text-ink-900 leading-snug mb-0.5">{s.title}</p>
                {s.description && (
                  <p className="text-xs text-ink-500 leading-relaxed line-clamp-2">{s.description}</p>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-ink-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                <p className="text-xs text-ink-600 truncate">{item.url}</p>
              </div>
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
              {(item.tags || []).map(tag => <span key={tag} className="tag">{tag}</span>)}
            </div>
          </div>
          <button onClick={() => onArchive(item.id)} className="shrink-0 p-1.5 rounded-lg text-ink-300 hover:text-ink-600 hover:bg-ink-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.75 7.5h16.5M8.25 7.5l.75-4.5h6l.75 4.5" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  const isLong = item.raw_text.length > 120
  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink-800 leading-relaxed break-words">
            {isLong && !expanded ? item.raw_text.slice(0, 120) + '…' : item.raw_text}
          </p>
          {isLong && <button onClick={() => setExpanded(!expanded)} className="text-xs text-amber-600 mt-1">{expanded ? 'Show less' : 'Show more'}</button>}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[11px] text-ink-300">{format(new Date(item.created_at), 'MMM d, h:mm a')}</span>
            {(item.tags || []).map(tag => <span key={tag} className="tag">{tag}</span>)}
          </div>
        </div>
        <button onClick={() => onArchive(item.id)} className="shrink-0 p-1.5 rounded-lg text-ink-300 hover:text-ink-600 hover:bg-ink-50 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.75 7.5h16.5M8.25 7.5l.75-4.5h6l.75 4.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
