'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { Item, NextStep, ItemEntity, ItemState, ItemContext, ItemType } from '@/types'
import { format } from 'date-fns'

type FullItem = Item & { next_steps: NextStep[]; item_entities: ItemEntity[] }

const STATE_STYLES: Record<string, { color: string; bg: string; border: string; label: string }> = {
  captured:    { label: 'Captured',    color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)' },
  triaged:     { label: 'Triaged',     color: '#2dd4bf', bg: 'rgba(45,212,191,0.1)',   border: 'rgba(45,212,191,0.2)' },
  ready:       { label: 'Ready',       color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.2)' },
  in_progress: { label: 'In Progress', color: '#a78bfa', bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.25)' },
  done:        { label: 'Done',        color: '#475569', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.05)' },
  archived:    { label: 'Archived',    color: '#334155', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.03)' },
}

const TYPE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  task:       { color: '#a78bfa', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.22)' },
  curiosity:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.18)' },
  content:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.18)' },
  event:      { color: '#f472b6', bg: 'rgba(244,114,182,0.1)',  border: 'rgba(244,114,182,0.18)' },
  idea:       { color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.18)' },
  reference:  { color: '#22d3ee', bg: 'rgba(34,211,238,0.1)',   border: 'rgba(34,211,238,0.18)' },
  catch_all:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.14)' },
}

const CONTEXT_STYLES: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  work:     { icon: '💼', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',   border: 'rgba(96,165,250,0.22)' },
  personal: { icon: '🏠', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.22)' },
  music:    { icon: '🎵', color: '#f472b6', bg: 'rgba(244,114,182,0.12)', border: 'rgba(244,114,182,0.22)' },
  golf:     { icon: '⛳', color: '#4ade80', bg: 'rgba(74,222,128,0.12)',   border: 'rgba(74,222,128,0.22)' },
  travel:   { icon: '✈️', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',   border: 'rgba(251,191,36,0.22)' },
  creative: { icon: '🎨', color: '#fb923c', bg: 'rgba(251,146,60,0.12)',   border: 'rgba(251,146,60,0.22)' },
  unknown:  { icon: '·',  color: '#475569', bg: 'rgba(71,85,105,0.08)',    border: 'rgba(71,85,105,0.12)' },
}

const EFFORT_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  quick:   { color: '#2dd4bf', bg: 'rgba(45,212,191,0.1)',  border: 'rgba(45,212,191,0.2)' },
  session: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  project: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.22)' },
}

function sc(v: number, max: number) {
  const p = v / max
  return p >= 0.8 ? '#f87171' : p >= 0.5 ? '#fbbf24' : '#64748b'
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
    setLoading(true)
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

  const today = format(new Date(), 'EEEE, MMMM d').toUpperCase()

  return (
    <div className="px-4 pt-8 pb-4">

      {/* Page header */}
      <div className="mb-7">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">{today}</p>
        <h1 className="text-[32px] font-bold text-slate-50 tracking-tight leading-none">Analyst</h1>
        <p className="text-slate-500 text-sm mt-1.5">{loading ? '…' : `${items.length} item${items.length !== 1 ? 's' : ''}`}</p>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5 space-y-4">
        {/* State */}
        <div>
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">State</p>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {STATES.map(opt => {
              const active = stateFilter === opt
              const ss = opt !== 'all' ? STATE_STYLES[opt] : null
              return (
                <button
                  key={opt}
                  onClick={() => setStateFilter(opt as any)}
                  className="shrink-0 text-[10px] font-semibold rounded-full px-2.5 py-1 transition-all duration-150 capitalize whitespace-nowrap"
                  style={active
                    ? (ss ? { color: ss.color, background: ss.bg, border: `1px solid ${ss.border}` }
                          : { color: '#c4b5fd', background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.35)' })
                    : { color: '#475569', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }
                  }
                >
                  {opt === 'in_progress' ? 'in progress' : opt}
                </button>
              )
            })}
          </div>
        </div>

        {/* Context */}
        <div>
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Context</p>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {CONTEXTS.map(opt => {
              const active = contextFilter === opt
              const cs = opt !== 'all' ? CONTEXT_STYLES[opt] : null
              return (
                <button
                  key={opt}
                  onClick={() => setContextFilter(opt as any)}
                  className="shrink-0 text-[10px] font-semibold rounded-full px-2.5 py-1 transition-all duration-150 capitalize whitespace-nowrap flex items-center gap-1"
                  style={active
                    ? (cs ? { color: cs.color, background: cs.bg, border: `1px solid ${cs.border}` }
                          : { color: '#c4b5fd', background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.35)' })
                    : { color: '#475569', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }
                  }
                >
                  {cs && <span>{cs.icon}</span>}
                  {opt}
                </button>
              )
            })}
          </div>
        </div>

        {/* Type */}
        <div>
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Type</p>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {TYPES.map(opt => {
              const active = typeFilter === opt
              const ts = opt !== 'all' ? TYPE_STYLES[opt] : null
              return (
                <button
                  key={opt}
                  onClick={() => setTypeFilter(opt as any)}
                  className="shrink-0 text-[10px] font-semibold rounded-full px-2.5 py-1 transition-all duration-150 capitalize whitespace-nowrap"
                  style={active
                    ? (ts ? { color: ts.color, background: ts.bg, border: `1px solid ${ts.border}` }
                          : { color: '#c4b5fd', background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.35)' })
                    : { color: '#475569', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }
                  }
                >
                  {opt.replace('_', ' ')}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 rounded-lg w-3/4 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-3 rounded-lg w-full mb-1.5" style={{ background: 'rgba(255,255,255,0.04)' }} />
              <div className="h-3 rounded-lg w-1/2" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4 opacity-30">◎</div>
          <p className="text-slate-500 text-sm">No items match these filters.</p>
        </div>
      ) : (
        <div className="space-y-3 animate-fade-in">
          {items.map((item, idx) => (
            <AnalystCard key={item.id} item={item} idx={idx} />
          ))}
        </div>
      )}
    </div>
  )
}

function AnalystCard({ item, idx }: { item: FullItem; idx: number }) {
  const [expanded, setExpanded] = useState(false)
  const activeStep = item.next_steps?.find(s => s.status === 'active')
  const hasScores = item.importance != null
  const ss = STATE_STYLES[item.state]
  const ts = item.item_type ? TYPE_STYLES[item.item_type] : null
  const cs = item.context ? CONTEXT_STYLES[item.context] : null
  const es = item.effort ? EFFORT_STYLES[item.effort] : null

  const title = item.url && item.url_summary?.title
    ? item.url_summary.title
    : (item.raw_text || '').split('\n')[0].slice(0, 120)

  return (
    <div
      className="card card-hover group p-4 transition-all duration-200"
      style={{ animationDelay: `${idx * 30}ms` }}
    >
      {/* Header row */}
      <div className="flex items-start gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-100 leading-snug break-words">{title}</p>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors mt-0.5 inline-block"
            >
              {new URL(item.url).hostname.replace(/^www\./, '')} ↗
            </a>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-[10px] font-semibold text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded-lg"
          style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}
        >
          {expanded ? 'Less' : 'More'}
        </button>
      </div>

      {/* Pills row */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        {ss && (
          <span
            className="text-[10px] font-semibold rounded-full px-2 py-0.5"
            style={{ color: ss.color, background: ss.bg, border: `1px solid ${ss.border}` }}
          >
            {ss.label}
          </span>
        )}
        {ts && item.item_type && (
          <span
            className="text-[10px] font-semibold rounded-full px-2 py-0.5 capitalize"
            style={{ color: ts.color, background: ts.bg, border: `1px solid ${ts.border}` }}
          >
            {item.item_type.replace('_', ' ')}
          </span>
        )}
        {cs && item.context && item.context !== 'unknown' && (
          <span
            className="text-[10px] font-semibold rounded-full px-2 py-0.5 capitalize flex items-center gap-1"
            style={{ color: cs.color, background: cs.bg, border: `1px solid ${cs.border}` }}
          >
            <span className="text-[9px]">{cs.icon}</span>
            {item.context}
          </span>
        )}
        {es && item.effort && (
          <span
            className="text-[10px] font-semibold rounded-full px-2 py-0.5 capitalize"
            style={{ color: es.color, background: es.bg, border: `1px solid ${es.border}` }}
          >
            {item.effort}
          </span>
        )}
        {item.horizon && (
          <span
            className="text-[10px] text-slate-600 capitalize rounded-full px-2 py-0.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            {item.horizon}
          </span>
        )}
        <span className="text-[10px] text-slate-700 ml-auto">
          {format(new Date(item.created_at), 'MMM d')}
        </span>
      </div>

      {/* Inline scores */}
      {hasScores && (
        <div className="flex items-center gap-2.5 mb-2.5">
          <span className="text-[10px] text-slate-600 font-mono flex items-center gap-1.5">
            {item.importance != null && (
              <span>imp <span style={{ color: sc(item.importance, 5) }}>{item.importance}</span></span>
            )}
            {item.actionability_score != null && (
              <>
                <span style={{ color: '#1e293b' }}>·</span>
                <span>act <span style={{ color: sc(item.actionability_score, 5) }}>{item.actionability_score}</span></span>
              </>
            )}
            {item.time_sensitivity != null && (
              <>
                <span style={{ color: '#1e293b' }}>·</span>
                <span>urg <span style={{ color: sc(item.time_sensitivity, 5) }}>{item.time_sensitivity}</span></span>
              </>
            )}
            {item.curiosity_score != null && (
              <>
                <span style={{ color: '#1e293b' }}>·</span>
                <span>cur <span style={{ color: sc(item.curiosity_score, 5) }}>{item.curiosity_score}</span></span>
              </>
            )}
            {item.avoidance_score != null && (
              <>
                <span style={{ color: '#1e293b' }}>·</span>
                <span>avoid <span style={{ color: sc(item.avoidance_score, 10) }}>{item.avoidance_score}</span></span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Next step callout */}
      {activeStep && (
        <div className="next-step-callout mb-2.5">
          <p className="text-xs leading-snug" style={{ color: '#c4b5fd' }}>
            <span style={{ color: '#7c3aed', marginRight: 6, fontWeight: 600 }}>→</span>
            {activeStep.text}
          </p>
        </div>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div
          className="pt-3 mt-2 space-y-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {item.item_entities && item.item_entities.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Entities</p>
              <div className="flex flex-wrap gap-1.5">
                {item.item_entities.map(e => (
                  <span
                    key={e.id}
                    className="text-[10px] rounded-lg px-2 py-0.5"
                    style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <span style={{ color: '#475569' }}>{e.entity_type}: </span>{e.entity_value}
                  </span>
                ))}
              </div>
            </div>
          )}
          {item.raw_text && (
            <div>
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Raw</p>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{item.raw_text}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
