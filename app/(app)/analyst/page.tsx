'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { Item, NextStep, ItemEntity, ItemState, ItemContext, ItemType } from '@/types'
import { format } from 'date-fns'

type FullItem = Item & { next_steps: NextStep[]; item_entities: ItemEntity[] }

const STATE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  captured:    { color: '#fbbf24', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.2)' },
  triaged:     { color: '#2dd4bf', bg: 'rgba(20,184,166,0.1)',   border: 'rgba(20,184,166,0.2)' },
  ready:       { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.2)' },
  in_progress: { color: '#a78bfa', bg: 'rgba(124,58,237,0.12)',  border: 'rgba(124,58,237,0.25)' },
  done:        { color: '#475569', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.05)' },
  archived:    { color: '#334155', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.03)' },
}

function scoreColor(value: number, max: number): string {
  const pct = value / max
  if (pct >= 0.8) return '#f87171'
  if (pct >= 0.6) return '#fbbf24'
  return '#64748b'
}

const STATES: Array<ItemState | 'all'> = ['all', 'captured', 'triaged', 'ready', 'in_progress', 'done', 'archived']
const CONTEXTS: Array<ItemContext | 'all'> = ['all', 'work', 'personal', 'music', 'golf', 'travel', 'creative', 'unknown']
const TYPES: Array<ItemType | 'all'> = ['all', 'task', 'curiosity', 'content', 'event', 'idea', 'reference', 'catch_all']

export default function AnalystPage() {
  const [items, setItems] = useState<FullItem[]>([])
  const [loading, setLoading] = useState(true)
  const [stateFilter, setStateFilter] = useState<ItemState | 'all'>('all')
  const [contextFilter, setContextFilter] = useState<ItemContext | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')

  const supabase = createClient()

  const loadItems = useCallback(async () => {
    let query = supabase
      .from('items')
      .select('*, next_steps(id, text, type, status), item_entities(id, entity_type, entity_value)')
      .order('created_at', { ascending: false })

    if (stateFilter !== 'all') query = query.eq('state', stateFilter)
    if (contextFilter !== 'all') query = query.eq('context', contextFilter)
    if (typeFilter !== 'all') query = query.eq('item_type', typeFilter)

    const { data } = await query
    setItems((data || []) as FullItem[])
    setLoading(false)
  }, [stateFilter, contextFilter, typeFilter])

  useEffect(() => { loadItems() }, [loadItems])

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Analyst</h1>
        <p className="text-slate-500 text-sm mt-0.5">{items.length} items</p>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5 space-y-3">
        <FilterRow
          label="State"
          options={STATES}
          active={stateFilter}
          onChange={v => setStateFilter(v as any)}
        />
        <FilterRow
          label="Context"
          options={CONTEXTS}
          active={contextFilter}
          onChange={v => setContextFilter(v as any)}
        />
        <FilterRow
          label="Type"
          options={TYPES}
          active={typeFilter}
          onChange={v => setTypeFilter(v as any)}
          display={v => v.replace('_', ' ')}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 rounded w-3/4 mb-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-3 rounded w-full mb-1.5" style={{ background: 'rgba(255,255,255,0.04)' }} />
              <div className="h-3 rounded w-2/3" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-sm">No items match these filters.</p>
        </div>
      ) : (
        <div className="space-y-2 animate-fade-in">
          {items.map(item => <AnalystCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}

function FilterRow({
  label,
  options,
  active,
  onChange,
  display,
}: {
  label: string
  options: string[]
  active: string
  onChange: (v: string) => void
  display?: (v: string) => string
}) {
  return (
    <div>
      <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className="tag cursor-pointer capitalize transition-all"
            style={active === opt ? { background: '#7c3aed', color: 'white', borderColor: '#7c3aed' } : {}}
          >
            {display ? display(opt) : opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function AnalystCard({ item }: { item: FullItem }) {
  const [expanded, setExpanded] = useState(false)
  const activeStep = item.next_steps?.find(s => s.status === 'active')
  const hasScores = item.importance != null
  const ss = STATE_STYLES[item.state]

  const title = item.url && item.url_summary?.title
    ? item.url_summary.title
    : (item.raw_text || '').split('\n')[0].slice(0, 100)

  const pillBase: React.CSSProperties = {
    color: '#64748b',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.04)',
  }

  return (
    <div className="card p-4 transition-all hover:border-white/10">
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-100 leading-snug break-words">{title}</p>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
            >
              {new URL(item.url).hostname.replace(/^www\./, '')} ↗
            </a>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300 transition-colors px-1.5 py-0.5 rounded"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {expanded ? 'Less' : 'More'}
        </button>
      </div>

      {/* Tags row */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {ss && (
          <span
            className="text-[10px] rounded-full px-1.5 py-0.5"
            style={{ color: ss.color, background: ss.bg, border: `1px solid ${ss.border}` }}
          >
            {item.state}
          </span>
        )}
        {item.item_type && (
          <span
            className="text-[10px] rounded-full px-1.5 py-0.5"
            style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {item.item_type.replace('_', ' ')}
          </span>
        )}
        {item.context && item.context !== 'unknown' && (
          <span className="text-[10px] rounded-full px-1.5 py-0.5" style={pillBase}>{item.context}</span>
        )}
        {item.effort && (
          <span className="text-[10px] rounded-full px-1.5 py-0.5" style={pillBase}>{item.effort}</span>
        )}
        {item.horizon && (
          <span className="text-[10px] rounded-full px-1.5 py-0.5" style={pillBase}>{item.horizon}</span>
        )}
        <span className="text-[10px] text-slate-600 ml-auto">
          {format(new Date(item.created_at), 'MMM d')}
        </span>
      </div>

      {/* Scores grid */}
      {hasScores && (
        <div
          className="grid grid-cols-5 gap-1 rounded-lg px-2 py-1.5 mb-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
        >
          {[
            { label: 'Imp',   value: item.importance,         max: 5 },
            { label: 'Act',   value: item.actionability_score, max: 5 },
            { label: 'Urg',   value: item.time_sensitivity,    max: 5 },
            { label: 'Cur',   value: item.curiosity_score,     max: 5 },
            { label: 'Avoid', value: item.avoidance_score,     max: 10 },
          ].map(({ label, value, max }) => (
            <div key={label} className="text-center">
              <div
                className="text-xs font-semibold"
                style={{ color: value != null ? scoreColor(value, max) : '#334155' }}
              >
                {value ?? '–'}
              </div>
              <div className="text-[9px] text-slate-600">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Next step */}
      {activeStep && (
        <div
          className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 mb-2"
          style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)' }}
        >
          <svg className="w-3 h-3 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#8b5cf6' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
          <p className="text-xs leading-snug" style={{ color: '#c4b5fd' }}>{activeStep.text}</p>
        </div>
      )}

      {/* Expanded: entities + raw text */}
      {expanded && (
        <div
          className="pt-2.5 mt-2 space-y-2.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {item.item_entities && item.item_entities.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1.5">Entities</p>
              <div className="flex flex-wrap gap-1">
                {item.item_entities.map(e => (
                  <span
                    key={e.id}
                    className="text-[10px] rounded px-1.5 py-0.5"
                    style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span style={{ color: '#475569' }}>{e.entity_type}: </span>{e.entity_value}
                  </span>
                ))}
              </div>
            </div>
          )}
          {item.raw_text && (
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1.5">Raw text</p>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{item.raw_text}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
