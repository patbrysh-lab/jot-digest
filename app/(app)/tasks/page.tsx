'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { Item, NextStep, ItemContext, ItemEffort } from '@/types'
import { format } from 'date-fns'

const CONTEXTS: ItemContext[] = ['work', 'personal', 'music', 'golf', 'travel', 'creative', 'unknown']
const EFFORTS: Array<ItemEffort | 'none'> = ['quick', 'session', 'project', 'none']

const EFFORT_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  quick:   { label: 'Quick',     color: '#2dd4bf', bg: 'rgba(45,212,191,0.1)',  border: 'rgba(45,212,191,0.2)' },
  session: { label: 'Session',   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  project: { label: 'Project',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.22)' },
  none:    { label: 'Misc',      color: '#475569', bg: 'rgba(71,85,105,0.08)',  border: 'rgba(71,85,105,0.12)' },
}

const CONTEXT_STYLES: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  work:     { icon: '💼', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',   border: 'rgba(96,165,250,0.22)' },
  personal: { icon: '🏠', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.22)' },
  music:    { icon: '🎵', color: '#f472b6', bg: 'rgba(244,114,182,0.12)', border: 'rgba(244,114,182,0.22)' },
  golf:     { icon: '⛳', color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.22)' },
  travel:   { icon: '✈️', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.22)' },
  creative: { icon: '🎨', color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.22)' },
  unknown:  { icon: '·',  color: '#334155', bg: 'rgba(51,65,85,0.1)',     border: 'rgba(51,65,85,0.15)' },
}

type ItemWithSteps = Item & { next_steps: NextStep[] }

export default function TasksPage() {
  const [items, setItems] = useState<ItemWithSteps[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)

  const supabase = createClient()

  const loadItems = useCallback(async () => {
    let query = supabase
      .from('items')
      .select('*, next_steps(id, text, type, status, expires_at)')
      .not('state', 'eq', 'archived')
      .order('created_at', { ascending: false })

    if (!showDone) query = query.not('state', 'eq', 'done')

    const { data } = await query
    setItems((data || []) as ItemWithSteps[])
    setLoading(false)
  }, [showDone])

  useEffect(() => { loadItems() }, [loadItems])

  async function markDone(id: string) {
    await supabase.from('items').update({ state: 'done' }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, state: 'done' as const } : i))
  }

  async function markArchived(id: string) {
    await supabase.from('items').update({ state: 'archived' }).eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const grouped = CONTEXTS.reduce((acc, ctx) => {
    const ctxItems = items.filter(i => i.context === ctx)
    if (!ctxItems.length) return acc
    const byEffort = EFFORTS.reduce((eAcc, effort) => {
      const effortItems = effort === 'none' ? ctxItems.filter(i => !i.effort) : ctxItems.filter(i => i.effort === effort)
      if (!effortItems.length) return eAcc
      return { ...eAcc, [effort]: effortItems }
    }, {} as Record<string, ItemWithSteps[]>)
    if (!Object.keys(byEffort).length) return acc
    return { ...acc, [ctx]: byEffort }
  }, {} as Record<string, Record<string, ItemWithSteps[]>>)

  const activeCount = items.filter(i => i.state !== 'done').length
  const today = format(new Date(), 'EEEE, MMMM d').toUpperCase()

  return (
    <div className="px-4 pt-8 pb-4">

      {/* Page header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">{today}</p>
          <h1 className="text-[32px] font-bold text-slate-50 tracking-tight leading-none">Tasks</h1>
          <p className="text-slate-500 text-sm mt-1.5">{activeCount} active</p>
        </div>

        {/* Segmented control */}
        <div className="seg-control">
          <button onClick={() => setShowDone(false)} className={`seg-btn ${!showDone ? 'active' : ''}`}>
            Active
          </button>
          <button onClick={() => setShowDone(true)} className={`seg-btn ${showDone ? 'active' : ''}`}>
            Done
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 rounded-lg w-3/4 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-3 rounded-lg w-1/2" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ))}
        </div>
      ) : !Object.keys(grouped).length ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4 opacity-30">✓</div>
          <p className="text-slate-500 text-sm">No items. Capture something first.</p>
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          {CONTEXTS.filter(ctx => grouped[ctx]).map(ctx => {
            const cs = CONTEXT_STYLES[ctx]
            const total = Object.values(grouped[ctx]).flat().length
            return (
              <div key={ctx}>
                {/* Context header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-9 h-9 rounded-2xl flex items-center justify-center text-sm shrink-0"
                    style={{ background: cs.bg, border: `1px solid ${cs.border}` }}
                  >
                    {cs.icon}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold capitalize leading-none" style={{ color: cs.color }}>
                      {ctx}
                    </h2>
                    <p className="text-[10px] text-slate-600 mt-0.5">{total} item{total !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className="space-y-5 pl-0">
                  {EFFORTS.filter(effort => grouped[ctx][effort]).map(effort => {
                    const es = EFFORT_STYLES[effort]
                    return (
                      <div key={effort}>
                        {/* Effort sub-header */}
                        <div className="flex items-center gap-2 mb-2.5">
                          <span
                            className="text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0"
                            style={{ color: es.color, background: es.bg, border: `1px solid ${es.border}` }}
                          >
                            {es.label}
                          </span>
                          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                        </div>
                        <div className="space-y-2">
                          {grouped[ctx][effort].map(item => (
                            <TaskCard key={item.id} item={item} onDone={markDone} onArchive={markArchived} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TaskCard({ item, onDone, onArchive }: {
  item: ItemWithSteps
  onDone: (id: string) => void
  onArchive: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const activeStep = item.next_steps?.find(s => s.status === 'active')
  const isDone = item.state === 'done'

  const displayText = item.url && item.url_summary?.title
    ? item.url_summary.title
    : (item.raw_text || '').split('\n')[0]

  const isLong = displayText.length > 110

  /* Inline scores — only if enriched */
  const hasScores = item.importance != null
  function sc(v: number, max: number) {
    const p = v / max
    return p >= 0.8 ? '#f87171' : p >= 0.5 ? '#fbbf24' : '#64748b'
  }

  return (
    <div
      className="card card-hover group p-4 transition-all duration-200"
      style={isDone ? { opacity: 0.4 } : undefined}
    >
      <div className="flex items-start gap-3">

        {/* Done toggle */}
        <button
          onClick={() => !isDone && onDone(item.id)}
          className="shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200"
          style={isDone ? {
            background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
            border: '1.5px solid transparent',
            boxShadow: '0 0 0 3px rgba(20,184,166,0.18)',
          } : {
            background: 'transparent',
            border: '1.5px solid rgba(255,255,255,0.18)',
          }}
          onMouseEnter={e => { if (!isDone) (e.currentTarget as HTMLElement).style.borderColor = '#14b8a6' }}
          onMouseLeave={e => { if (!isDone) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.18)' }}
        >
          {isDone && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p
            className="text-sm leading-relaxed break-words"
            style={{
              color: isDone ? '#334155' : '#e2e8f0',
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            {isLong && !expanded ? displayText.slice(0, 110) + '…' : displayText}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(!expanded)}
              className="text-xs text-violet-400 hover:text-violet-300 mt-0.5 transition-colors">
              {expanded ? 'Less' : 'More'}
            </button>
          )}

          {/* Next step — left-border callout */}
          {activeStep && !isDone && (
            <div className="next-step-callout mt-2.5">
              <p className="text-xs leading-snug" style={{ color: '#c4b5fd' }}>
                <span style={{ color: '#7c3aed', marginRight: 6, fontWeight: 600 }}>→</span>
                {activeStep.text}
              </p>
            </div>
          )}

          {/* Scores + meta — minimal inline */}
          <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
            {hasScores && (
              <span className="text-[10px] text-slate-600 font-mono flex items-center gap-1.5">
                {item.importance != null && (
                  <span>imp <span style={{ color: sc(item.importance, 5) }}>{item.importance}</span></span>
                )}
                {item.time_sensitivity != null && (
                  <>
                    <span style={{ color: '#1e293b' }}>·</span>
                    <span>urg <span style={{ color: sc(item.time_sensitivity, 5) }}>{item.time_sensitivity}</span></span>
                  </>
                )}
                {item.avoidance_score != null && (
                  <>
                    <span style={{ color: '#1e293b' }}>·</span>
                    <span>avoid <span style={{ color: sc(item.avoidance_score, 10) }}>{item.avoidance_score}</span></span>
                  </>
                )}
              </span>
            )}
            {item.horizon && (
              <span className="text-[10px] text-slate-600 capitalize">{item.horizon}</span>
            )}
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors ml-auto"
                onClick={e => e.stopPropagation()}>
                Open ↗
              </a>
            )}
          </div>
        </div>

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
      </div>
    </div>
  )
}
