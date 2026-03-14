'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { Item, NextStep, ItemEntity, ItemState, ItemContext, ItemType } from '@/types'
import { format } from 'date-fns'

type FullItem = Item & { next_steps: NextStep[]; item_entities: ItemEntity[] }

const STATE_COLORS: Record<string, string> = {
  captured:    'bg-amber-100 text-amber-700',
  triaged:     'bg-green-100 text-green-700',
  ready:       'bg-blue-100 text-blue-700',
  in_progress: 'bg-purple-100 text-purple-700',
  done:        'bg-ink-100 text-ink-500',
  archived:    'bg-ink-50 text-ink-400',
}

function scoreColor(value: number, max: number): string {
  const pct = value / max
  if (pct >= 0.8) return 'text-red-600 font-bold'
  if (pct >= 0.6) return 'text-amber-600 font-semibold'
  return 'text-ink-500'
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
        <h1 className="font-display text-2xl font-semibold text-ink-900">Analyst</h1>
        <p className="text-ink-400 text-sm mt-0.5">{items.length} items</p>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5 space-y-3">
        <FilterRow label="State" options={STATES} active={stateFilter} onChange={v => setStateFilter(v as any)} />
        <FilterRow label="Context" options={CONTEXTS} active={contextFilter} onChange={v => setContextFilter(v as any)} />
        <FilterRow label="Type" options={TYPES} active={typeFilter} onChange={v => setTypeFilter(v as any)} display={v => v.replace('_', ' ')} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 bg-ink-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-ink-50 rounded w-full mb-1" />
              <div className="h-3 bg-ink-50 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-ink-400 text-sm">No items match these filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
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
      <p className="text-[10px] text-ink-400 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`tag cursor-pointer capitalize ${active === opt ? 'bg-ink-800 text-white' : 'hover:bg-ink-200'}`}
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

  const title = item.url && item.url_summary?.title
    ? item.url_summary.title
    : (item.raw_text || '').split('\n')[0].slice(0, 100)

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-900 leading-snug break-words">{title}</p>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-amber-600 hover:underline"
            >
              {new URL(item.url).hostname.replace(/^www\./, '')} ↗
            </a>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-[10px] text-ink-400 hover:text-ink-600 px-1.5 py-0.5 rounded border border-ink-100 hover:border-ink-300"
        >
          {expanded ? 'Less' : 'More'}
        </button>
      </div>

      {/* Tags row */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className={`text-[10px] rounded px-1.5 py-0.5 ${STATE_COLORS[item.state] ?? 'bg-ink-100 text-ink-500'}`}>
          {item.state}
        </span>
        {item.item_type && (
          <span className="text-[10px] bg-ink-100 text-ink-500 rounded px-1.5 py-0.5">
            {item.item_type.replace('_', ' ')}
          </span>
        )}
        {item.context && item.context !== 'unknown' && (
          <span className="text-[10px] bg-ink-50 text-ink-400 rounded px-1.5 py-0.5">{item.context}</span>
        )}
        {item.effort && (
          <span className="text-[10px] bg-ink-50 text-ink-400 rounded px-1.5 py-0.5">{item.effort}</span>
        )}
        {item.horizon && (
          <span className="text-[10px] bg-ink-50 text-ink-400 rounded px-1.5 py-0.5">{item.horizon}</span>
        )}
        <span className="text-[10px] text-ink-300 ml-auto">{format(new Date(item.created_at), 'MMM d')}</span>
      </div>

      {/* Scores grid */}
      {hasScores && (
        <div className="grid grid-cols-5 gap-1 bg-ink-50 rounded-lg px-2 py-1.5 mb-2">
          {[
            { label: 'Imp',   value: item.importance,          max: 5 },
            { label: 'Act',   value: item.actionability_score,  max: 5 },
            { label: 'Urg',   value: item.time_sensitivity,     max: 5 },
            { label: 'Cur',   value: item.curiosity_score,      max: 5 },
            { label: 'Avoid', value: item.avoidance_score,      max: 10 },
          ].map(({ label, value, max }) => (
            <div key={label} className="text-center">
              <div className={`text-xs ${value != null ? scoreColor(value, max) : 'text-ink-300'}`}>
                {value ?? '–'}
              </div>
              <div className="text-[9px] text-ink-300">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Next step */}
      {activeStep && (
        <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2 mb-2">
          <svg className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
          <p className="text-xs text-amber-800 leading-snug">{activeStep.text}</p>
        </div>
      )}

      {/* Expanded: entities + raw text */}
      {expanded && (
        <div className="pt-2 border-t border-ink-100 space-y-2 mt-2">
          {item.item_entities && item.item_entities.length > 0 && (
            <div>
              <p className="text-[10px] text-ink-400 uppercase tracking-wide mb-1">Entities</p>
              <div className="flex flex-wrap gap-1">
                {item.item_entities.map(e => (
                  <span key={e.id} className="text-[10px] bg-ink-100 text-ink-600 rounded px-1.5 py-0.5">
                    <span className="text-ink-400">{e.entity_type}: </span>{e.entity_value}
                  </span>
                ))}
              </div>
            </div>
          )}
          {item.raw_text && (
            <div>
              <p className="text-[10px] text-ink-400 uppercase tracking-wide mb-1">Raw text</p>
              <p className="text-xs text-ink-600 leading-relaxed whitespace-pre-wrap">{item.raw_text}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
