'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { InboxItem } from '@/types'
import { format } from 'date-fns'

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setAddError('')
    const tags = tagInput.trim() ? tagInput.split(',').map(t => t.trim()).filter(Boolean) : []
    const insertData: any = {
      raw_text: text.trim(),
      source: 'manual',
      status: 'inbox',
      tags: tags.length > 0 ? tags : null,
    }
    if (userId) insertData.user_id = userId
    const { error } = await supabase.from('inbox_items').insert(insertData)
    if (error) {
      setAddError(error.message)
    } else {
      setText('')
      setTagInput('')
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
          placeholder="What's on your mind? Jot it down..."
          className="input resize-none min-h-[80px] mb-3 font-sans"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(e as any) }}
        />
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            placeholder="Tags (comma separated)"
            className="input flex-1 text-xs"
          />
          <button type="submit" disabled={submitting || !text.trim()} className="btn-primary whitespace-nowrap">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
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