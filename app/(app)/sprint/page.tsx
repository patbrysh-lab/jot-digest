'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { Item, NextStep } from '@/types'
import Link from 'next/link'

type SprintItem = Item & { next_steps: NextStep[] }

type Duration = '15' | '30' | '60' | '120'

const DURATION_CONFIG: Record<Duration, {
  label: string
  sublabel: string
  minutes: number
  efforts: string[]
  max: number
}> = {
  '15':  { label: '15 min',  sublabel: 'Quick hits',        minutes: 15,  efforts: ['quick'],              max: 3 },
  '30':  { label: '30 min',  sublabel: 'Focused session',   minutes: 30,  efforts: ['quick', 'session'],   max: 5 },
  '60':  { label: '1 hour',  sublabel: 'Deep work',         minutes: 60,  efforts: ['quick', 'session'],   max: 8 },
  '120': { label: '2 hours', sublabel: 'Long haul',         minutes: 120, efforts: ['session', 'project'], max: 6 },
}

type Phase = 'pick' | 'loading' | 'sprint' | 'done'

function itemTitle(item: Item): string {
  if (item.url && item.url_summary?.title) return item.url_summary.title
  return (item.raw_text || '').split('\n')[0].slice(0, 120)
}

function priorityScore(item: Item): number {
  return (item.importance ?? 0) + (item.time_sensitivity ?? 0) + (item.avoidance_score ?? 0) * 0.3
}

export default function SprintPage() {
  const [phase, setPhase] = useState<Phase>('pick')
  const [duration, setDuration] = useState<Duration | null>(null)
  const [items, setItems] = useState<SprintItem[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [completing, setCompleting] = useState<Set<string>>(new Set())

  const supabase = createClient()

  const startSprint = useCallback(async (d: Duration) => {
    setDuration(d)
    setPhase('loading')

    const cfg = DURATION_CONFIG[d]

    let query = supabase
      .from('items')
      .select('*, next_steps(id, text, type, status, expires_at)')
      .in('state', ['ready', 'triaged'])
      .order('importance', { ascending: false, nullsFirst: false })

    // Fetch a generous pool then filter + sort client-side
    const { data } = await query.limit(50)
    const pool = (data || []) as SprintItem[]

    // Filter by effort
    const filtered = pool.filter(item => {
      if (!item.effort) return false
      return cfg.efforts.includes(item.effort)
    })

    // Sort by composite priority score desc
    const sorted = [...filtered].sort((a, b) => priorityScore(b) - priorityScore(a))

    // Take up to max
    const batch = sorted.slice(0, cfg.max)

    setItems(batch)
    setChecked(new Set())
    setPhase('sprint')
  }, [supabase])

  async function handleCheck(item: SprintItem) {
    if (checked.has(item.id) || completing.has(item.id)) return

    setCompleting(prev => new Set(prev).add(item.id))

    // Mark done in DB
    await Promise.all([
      supabase.from('items').update({ state: 'done' }).eq('id', item.id),
      supabase.from('state_history').insert({
        item_id: item.id,
        from_state: item.state,
        to_state: 'done',
        changed_by: 'user',
      }),
    ])

    setCompleting(prev => { const s = new Set(prev); s.delete(item.id); return s })
    setChecked(prev => {
      const next = new Set(prev).add(item.id)
      if (next.size === items.length) {
        // Small delay so last checkmark animates before transition
        setTimeout(() => setPhase('done'), 600)
      }
      return next
    })
  }

  function reset() {
    setPhase('pick')
    setDuration(null)
    setItems([])
    setChecked(new Set())
    setCompleting(new Set())
  }

  if (phase === 'pick') return <PickScreen onPick={startSprint} />
  if (phase === 'loading') return <LoadingScreen />
  if (phase === 'sprint') {
    return (
      <SprintScreen
        items={items}
        checked={checked}
        completing={completing}
        duration={duration!}
        onCheck={handleCheck}
        onAbandon={reset}
      />
    )
  }
  return <DoneScreen items={items} checkedIds={checked} onReset={reset} />
}

/* ─────────────────────────────── Pick screen ─────────────────────────────── */

function PickScreen({ onPick }: { onPick: (d: Duration) => void }) {
  return (
    <div className="px-4 pt-8 pb-4 flex flex-col min-h-[70vh]">
      <div className="mb-10">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Sprint</p>
        <h1 className="text-[32px] font-bold text-slate-50 tracking-tight leading-none">How much time<br />do you have?</h1>
        <p className="text-slate-500 text-sm mt-2">We'll build a focused batch from your ready items.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(DURATION_CONFIG) as [Duration, typeof DURATION_CONFIG[Duration]][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onPick(key)}
            className="card card-hover p-5 text-left flex flex-col gap-1 transition-all duration-200 active:scale-[0.97]"
          >
            <span className="text-xl font-bold text-slate-50 tracking-tight">{cfg.label}</span>
            <span className="text-xs text-slate-500">{cfg.sublabel}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────── Loading screen ──────────────────────────── */

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
      <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="text-slate-500 text-sm">Building your sprint…</p>
    </div>
  )
}

/* ────────────────────────────── Sprint screen ───────────────────────────── */

function SprintScreen({
  items,
  checked,
  completing,
  duration,
  onCheck,
  onAbandon,
}: {
  items: SprintItem[]
  checked: Set<string>
  completing: Set<string>
  duration: Duration
  onCheck: (item: SprintItem) => void
  onAbandon: () => void
}) {
  const cfg = DURATION_CONFIG[duration]
  const doneCount = checked.size

  if (items.length === 0) {
    return (
      <div className="px-4 pt-8 pb-4 flex flex-col min-h-[70vh]">
        <div className="mb-8">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Sprint · {cfg.label}</p>
          <h1 className="text-[28px] font-bold text-slate-50 tracking-tight leading-none">Nothing queued</h1>
          <p className="text-slate-500 text-sm mt-2">No ready or triaged items match this duration. Try triaging some captures first.</p>
        </div>
        <button onClick={onAbandon} className="btn-secondary self-start">
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 pt-8 pb-4">
      {/* Header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Sprint · {cfg.label}</p>
          <h1 className="text-[28px] font-bold text-slate-50 tracking-tight leading-none">
            {doneCount < items.length
              ? `${items.length - doneCount} remaining`
              : 'All done'}
          </h1>
          <p className="text-slate-500 text-sm mt-1.5">{doneCount} of {items.length} complete</p>
        </div>
        <button
          onClick={onAbandon}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors pb-1"
        >
          Abandon
        </button>
      </div>

      {/* Progress bar */}
      <div
        className="h-1 rounded-full mb-7 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${items.length ? (doneCount / items.length) * 100 : 0}%`,
            background: 'linear-gradient(90deg, #14b8a6, #0d9488)',
            boxShadow: '0 0 8px rgba(20,184,166,0.5)',
          }}
        />
      </div>

      {/* Item list */}
      <div className="space-y-3">
        {items.map((item, idx) => {
          const isDone = checked.has(item.id)
          const isCompleting = completing.has(item.id)
          const activeStep = item.next_steps?.find(s => s.status === 'active')
          const title = itemTitle(item)

          return (
            <div
              key={item.id}
              className="card p-4 transition-all duration-300 animate-fade-in"
              style={{
                animationDelay: `${idx * 60}ms`,
                opacity: isDone ? 0.4 : 1,
              }}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <button
                  onClick={() => onCheck(item)}
                  disabled={isDone || isCompleting}
                  className="shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200"
                  style={isDone ? {
                    background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
                    border: '1.5px solid transparent',
                    boxShadow: '0 0 0 3px rgba(20,184,166,0.18)',
                  } : isCompleting ? {
                    background: 'rgba(20,184,166,0.15)',
                    border: '1.5px solid rgba(20,184,166,0.4)',
                  } : {
                    background: 'transparent',
                    border: '1.5px solid rgba(255,255,255,0.18)',
                  }}
                  onMouseEnter={e => {
                    if (!isDone && !isCompleting)
                      (e.currentTarget as HTMLElement).style.borderColor = '#14b8a6'
                  }}
                  onMouseLeave={e => {
                    if (!isDone && !isCompleting)
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.18)'
                  }}
                >
                  {isDone && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                  {isCompleting && (
                    <svg className="w-3 h-3 animate-spin text-teal-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
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
                    {title}
                  </p>
                  {activeStep && !isDone && (
                    <div className="next-step-callout mt-2.5">
                      <p className="text-xs leading-snug" style={{ color: '#c4b5fd' }}>
                        <span style={{ color: '#7c3aed', marginRight: 6, fontWeight: 600 }}>→</span>
                        {activeStep.text}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─────────────────────────────── Done screen ────────────────────────────── */

function DoneScreen({
  items,
  checkedIds,
  onReset,
}: {
  items: SprintItem[]
  checkedIds: Set<string>
  onReset: () => void
}) {
  const completed = items.filter(i => checkedIds.has(i.id))

  return (
    <div className="px-4 pt-8 pb-4 flex flex-col min-h-[70vh]">
      {/* Hero */}
      <div className="mb-10 text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-3xl mb-5"
          style={{
            background: 'linear-gradient(135deg, rgba(20,184,166,0.25), rgba(13,148,136,0.15))',
            border: '1px solid rgba(20,184,166,0.35)',
            boxShadow: '0 0 40px rgba(20,184,166,0.2)',
          }}
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#5eead4' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-[32px] font-bold text-slate-50 tracking-tight leading-none">Sprint complete</h1>
        <p className="text-slate-500 text-sm mt-2">
          {completed.length === 1
            ? 'You cleared 1 item.'
            : `You cleared ${completed.length} items.`}
        </p>
      </div>

      {/* Completed items recap */}
      {completed.length > 0 && (
        <div
          className="card p-4 mb-6 space-y-2.5"
        >
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-3">Completed</p>
          {completed.map(item => (
            <div key={item.id} className="flex items-start gap-2.5">
              <div
                className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
                  boxShadow: '0 0 0 2px rgba(20,184,166,0.15)',
                }}
              >
                <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-sm text-slate-400 leading-snug">{itemTitle(item)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onReset} className="btn-primary flex-1 justify-center py-3">
          New sprint
        </button>
        <Link href="/capture" className="btn-secondary flex-1 justify-center py-3 text-center">
          Capture
        </Link>
      </div>
    </div>
  )
}
