'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { Item, NextStep } from '@/types'
import Link from 'next/link'

type SprintItem = Item & { next_steps: NextStep[] }

type Duration = '15' | '30' | '60' | '120'

const DURATION_CONFIG: Record<Duration, {
  label: string
  sublabel: string
  efforts: string[]
  max: number
}> = {
  '15':  { label: '15 min',  sublabel: 'Quick hits',      efforts: ['quick'],              max: 3 },
  '30':  { label: '30 min',  sublabel: 'Focused session', efforts: ['quick', 'session'],   max: 5 },
  '60':  { label: '1 hour',  sublabel: 'Deep work',       efforts: ['quick', 'session'],   max: 8 },
  '120': { label: '2 hours', sublabel: 'Long haul',       efforts: ['session', 'project'], max: 6 },
}

type Phase = 'pick' | 'loading' | 'sprint' | 'done'

/* Sheet state */
type SheetMode = 'branching' | 'generative'
interface SheetState {
  item: SprintItem
  mode: SheetMode
  /* branching only */
  outcomes: string[]
  selectedOutcome: string | null
  pendingFollowUps: string[]          // titles to accept
  acceptedFollowUps: Set<number>      // indices accepted
  /* generative only */
  note: string
  noteSaved: boolean
  suggestions: string[]               // returned by Claude
  acceptedSuggestions: Set<number>
  loadingSuggestions: boolean
}

function itemTitle(item: Item): string {
  if (item.url && item.url_summary?.title) return item.url_summary.title
  return (item.raw_text || '').split('\n')[0].slice(0, 120)
}

function priorityScore(item: Item): number {
  return (item.importance ?? 0) + (item.time_sensitivity ?? 0) + (item.avoidance_score ?? 0) * 0.3
}

export default function SprintPage() {
  const [phase, setPhase]       = useState<Phase>('pick')
  const [duration, setDuration] = useState<Duration | null>(null)
  const [items, setItems]       = useState<SprintItem[]>([])
  const [checked, setChecked]   = useState<Set<string>>(new Set())  // fully processed
  const [tapping, setTapping]   = useState<Set<string>>(new Set())  // checkbox tap animation
  const [sheet, setSheet]       = useState<SheetState | null>(null)
  const [userId, setUserId]     = useState<string | null>(null)
  const [token, setToken]       = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null)
      setToken(data.session?.access_token ?? null)
    })
  }, [])

  /* ─── Item loading ─── */
  const startSprint = useCallback(async (d: Duration) => {
    setDuration(d)
    setPhase('loading')

    const cfg = DURATION_CONFIG[d]
    const { data } = await supabase
      .from('items')
      .select('*, next_steps(id, text, type, status, expires_at)')
      .in('state', ['ready', 'triaged'])
      .limit(60)

    const pool = (data || []) as SprintItem[]
    const filtered = pool.filter(i => i.effort && cfg.efforts.includes(i.effort))
    const sorted = [...filtered].sort((a, b) => priorityScore(b) - priorityScore(a))
    const batch = sorted.slice(0, cfg.max)

    setItems(batch)
    setChecked(new Set())
    setTapping(new Set())
    setSheet(null)
    setPhase('sprint')
  }, [supabase])

  /* ─── Create follow-up item + link + enrich ─── */
  const createFollowUp = useCallback(async (title: string, parentId: string) => {
    if (!userId) return
    const { data: newItem } = await supabase
      .from('items')
      .insert({ user_id: userId, raw_text: title, state: 'captured', source: 'manual', context: 'unknown' })
      .select()
      .single()
    if (!newItem) return

    await supabase.from('item_links').insert({
      item_a_id: parentId,
      item_b_id: newItem.id,
      relationship: 'spawned_from_completion',
    })

    if (token) {
      fetch(`/api/items/${newItem.id}/enrich`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
  }, [userId, token, supabase])

  /* ─── Mark item done in DB ─── */
  const markDoneInDB = useCallback(async (item: SprintItem) => {
    await Promise.all([
      supabase.from('items').update({ state: 'done' }).eq('id', item.id),
      supabase.from('state_history').insert({
        item_id: item.id,
        from_state: item.state,
        to_state: 'done',
        changed_by: 'user',
      }),
    ])
  }, [supabase])

  /* ─── Fully complete an item (after sheet or immediately) ─── */
  const completeItem = useCallback((id: string) => {
    setChecked(prev => {
      const next = new Set(prev).add(id)
      return next
    })
    setTapping(prev => { const s = new Set(prev); s.delete(id); return s })
  }, [])

  /* ─── Handle checkbox tap ─── */
  async function handleCheck(item: SprintItem) {
    if (checked.has(item.id) || tapping.has(item.id)) return

    // Optimistic tap animation
    setTapping(prev => new Set(prev).add(item.id))

    // Write to DB
    await markDoneInDB(item)

    const mode = item.completion_mode
    if (!mode || mode === 'closes') {
      completeItem(item.id)
      return
    }

    if (mode === 'branching') {
      const outcomes = item.possible_outcomes ?? []
      if (outcomes.length === 0) {
        completeItem(item.id)
        return
      }
      setSheet({
        item,
        mode: 'branching',
        outcomes,
        selectedOutcome: null,
        pendingFollowUps: [],
        acceptedFollowUps: new Set(),
        note: '',
        noteSaved: false,
        suggestions: [],
        acceptedSuggestions: new Set(),
        loadingSuggestions: false,
      })
      return
    }

    if (mode === 'generative') {
      setSheet({
        item,
        mode: 'generative',
        outcomes: [],
        selectedOutcome: null,
        pendingFollowUps: [],
        acceptedFollowUps: new Set(),
        note: '',
        noteSaved: false,
        suggestions: [],
        acceptedSuggestions: new Set(),
        loadingSuggestions: false,
      })
    }
  }

  /* ─── Branching: user picked an outcome ─── */
  async function handleOutcomeSelect(outcome: string) {
    if (!sheet || sheet.mode !== 'branching') return
    const templates = sheet.item.follow_up_templates ?? {}
    const followUps = templates[outcome] ?? []

    // Record outcome
    await supabase.from('items').update({ completion_outcome: outcome }).eq('id', sheet.item.id)

    setSheet(s => s ? {
      ...s,
      selectedOutcome: outcome,
      pendingFollowUps: followUps,
      acceptedFollowUps: new Set(followUps.map((_, i) => i)), // all pre-accepted
    } : null)
  }

  /* ─── Branching: commit follow-ups and close ─── */
  async function handleBranchingDone() {
    if (!sheet || sheet.mode !== 'branching') return
    const { item, pendingFollowUps, acceptedFollowUps } = sheet

    const accepted = pendingFollowUps.filter((_, i) => acceptedFollowUps.has(i))
    await Promise.all(accepted.map(t => createFollowUp(t, item.id)))

    if (accepted.length > 0) {
      await supabase.from('items').update({ follow_up_generated: true }).eq('id', item.id)
    }

    setSheet(null)
    completeItem(item.id)
  }

  /* ─── Generative: save note, get suggestions ─── */
  async function handleGenerativeSubmit() {
    if (!sheet || sheet.mode !== 'generative' || !sheet.note.trim()) return

    setSheet(s => s ? { ...s, noteSaved: true, loadingSuggestions: true } : null)

    // Create captured item from the note
    await createFollowUp(sheet.note.trim(), sheet.item.id)
    await supabase.from('items')
      .update({ completion_outcome: sheet.note.trim(), follow_up_generated: true })
      .eq('id', sheet.item.id)

    // Ask Claude for suggestions
    let suggestions: string[] = []
    if (token) {
      try {
        const res = await fetch(`/api/items/${sheet.item.id}/follow-ups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ completion_note: sheet.note.trim() }),
        })
        if (res.ok) {
          const data = await res.json()
          suggestions = data.suggestions ?? []
        }
      } catch { /* best-effort */ }
    }

    setSheet(s => s ? {
      ...s,
      loadingSuggestions: false,
      suggestions,
      acceptedSuggestions: new Set(suggestions.map((_, i) => i)),
    } : null)
  }

  /* ─── Generative: accept suggestions and close ─── */
  async function handleGenerativeDone() {
    if (!sheet || sheet.mode !== 'generative') return
    const { item, suggestions, acceptedSuggestions } = sheet

    const accepted = suggestions.filter((_, i) => acceptedSuggestions.has(i))
    if (accepted.length > 0) {
      await Promise.all(accepted.map(t => createFollowUp(t, item.id)))
    }

    setSheet(null)
    completeItem(item.id)
  }

  /* ─── Sheet skip ─── */
  function dismissSheet() {
    if (!sheet) return
    setSheet(null)
    completeItem(sheet.item.id)
  }

  /* ─── All done? ─── */
  const allDone = items.length > 0 && checked.size >= items.length && !sheet
  useEffect(() => {
    if (allDone) {
      const t = setTimeout(() => setPhase('done'), 500)
      return () => clearTimeout(t)
    }
  }, [allDone])

  function reset() {
    setPhase('pick')
    setDuration(null)
    setItems([])
    setChecked(new Set())
    setTapping(new Set())
    setSheet(null)
  }

  if (phase === 'pick')    return <PickScreen onPick={startSprint} />
  if (phase === 'loading') return <LoadingScreen />
  if (phase === 'done')    return <DoneScreen items={items} checkedIds={checked} onReset={reset} />

  return (
    <>
      <SprintScreen
        items={items}
        checked={checked}
        tapping={tapping}
        duration={duration!}
        onCheck={handleCheck}
        onAbandon={reset}
        sheetOpen={!!sheet}
      />
      {sheet && (
        <CompletionSheet
          sheet={sheet}
          onOutcomeSelect={handleOutcomeSelect}
          onBranchingDone={handleBranchingDone}
          onToggleFollowUp={i => setSheet(s => {
            if (!s) return s
            const next = new Set(s.acceptedFollowUps)
            next.has(i) ? next.delete(i) : next.add(i)
            return { ...s, acceptedFollowUps: next }
          })}
          onNoteChange={note => setSheet(s => s ? { ...s, note } : null)}
          onGenerativeSubmit={handleGenerativeSubmit}
          onToggleSuggestion={i => setSheet(s => {
            if (!s) return s
            const next = new Set(s.acceptedSuggestions)
            next.has(i) ? next.delete(i) : next.add(i)
            return { ...s, acceptedSuggestions: next }
          })}
          onGenerativeDone={handleGenerativeDone}
          onSkip={dismissSheet}
        />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Pick screen
═══════════════════════════════════════════════════════════════════════════ */

function PickScreen({ onPick }: { onPick: (d: Duration) => void }) {
  return (
    <div className="px-4 pt-8 pb-4">
      <div className="mb-10">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Sprint</p>
        <h1 className="text-[32px] font-bold text-slate-50 tracking-tight leading-none">
          How much time<br />do you have?
        </h1>
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

/* ═══════════════════════════════════════════════════════════════════════════
   Loading screen
═══════════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════════
   Sprint checklist screen
═══════════════════════════════════════════════════════════════════════════ */

function SprintScreen({
  items, checked, tapping, duration, onCheck, onAbandon, sheetOpen,
}: {
  items: SprintItem[]
  checked: Set<string>
  tapping: Set<string>
  duration: Duration
  onCheck: (item: SprintItem) => void
  onAbandon: () => void
  sheetOpen: boolean
}) {
  const cfg = DURATION_CONFIG[duration]
  const doneCount = checked.size

  if (items.length === 0) {
    return (
      <div className="px-4 pt-8 pb-4">
        <div className="mb-8">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">
            Sprint · {cfg.label}
          </p>
          <h1 className="text-[28px] font-bold text-slate-50 tracking-tight leading-none">Nothing queued</h1>
          <p className="text-slate-500 text-sm mt-2">
            No ready or triaged items match this duration. Try triaging some captures first.
          </p>
        </div>
        <button onClick={onAbandon} className="btn-secondary">Back</button>
      </div>
    )
  }

  return (
    <div className="px-4 pt-8 pb-4">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">
            Sprint · {cfg.label}
          </p>
          <h1 className="text-[28px] font-bold text-slate-50 tracking-tight leading-none">
            {doneCount < items.length ? `${items.length - doneCount} remaining` : 'All done'}
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
      <div className="h-1 rounded-full mb-7 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(doneCount / items.length) * 100}%`,
            background: 'linear-gradient(90deg, #14b8a6, #0d9488)',
            boxShadow: '0 0 8px rgba(20,184,166,0.5)',
          }}
        />
      </div>

      {/* Item list */}
      <div className="space-y-3">
        {items.map((item, idx) => {
          const isDone    = checked.has(item.id)
          const isTapping = tapping.has(item.id)
          const activeStep = item.next_steps?.find(s => s.status === 'active')
          const title = itemTitle(item)

          return (
            <div
              key={item.id}
              className="card p-4 transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${idx * 50}ms`, opacity: isDone ? 0.38 : 1 }}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <button
                  onClick={() => onCheck(item)}
                  disabled={isDone || isTapping || sheetOpen}
                  className="shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 disabled:cursor-default"
                  style={
                    isDone ? {
                      background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
                      border: '1.5px solid transparent',
                      boxShadow: '0 0 0 3px rgba(20,184,166,0.18)',
                    } : isTapping ? {
                      background: 'rgba(20,184,166,0.12)',
                      border: '1.5px solid rgba(20,184,166,0.5)',
                    } : {
                      background: 'transparent',
                      border: '1.5px solid rgba(255,255,255,0.18)',
                    }
                  }
                  onMouseEnter={e => {
                    if (!isDone && !isTapping && !sheetOpen)
                      (e.currentTarget as HTMLElement).style.borderColor = '#14b8a6'
                  }}
                  onMouseLeave={e => {
                    if (!isDone && !isTapping && !sheetOpen)
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.18)'
                  }}
                >
                  {isDone && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                  {isTapping && (
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

/* ═══════════════════════════════════════════════════════════════════════════
   Completion sheet (branching + generative)
═══════════════════════════════════════════════════════════════════════════ */

function CompletionSheet({
  sheet,
  onOutcomeSelect,
  onBranchingDone,
  onToggleFollowUp,
  onNoteChange,
  onGenerativeSubmit,
  onToggleSuggestion,
  onGenerativeDone,
  onSkip,
}: {
  sheet: SheetState
  onOutcomeSelect: (o: string) => void
  onBranchingDone: () => void
  onToggleFollowUp: (i: number) => void
  onNoteChange: (s: string) => void
  onGenerativeSubmit: () => void
  onToggleSuggestion: (i: number) => void
  onGenerativeDone: () => void
  onSkip: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const title = itemTitle(sheet.item).slice(0, 60) + (itemTitle(sheet.item).length > 60 ? '…' : '')

  // Focus textarea when generative sheet opens
  useEffect(() => {
    if (sheet.mode === 'generative' && !sheet.noteSaved) {
      setTimeout(() => textareaRef.current?.focus(), 120)
    }
  }, [sheet.mode, sheet.noteSaved])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
        onClick={onSkip}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
        style={{ maxWidth: 672, margin: '0 auto' }}
      >
        <div
          className="mx-3 mb-3 rounded-3xl overflow-hidden"
          style={{
            background: 'rgba(10,11,20,0.92)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-8 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
          </div>

          <div className="px-5 pb-6 pt-2">
            {/* Item label */}
            <p className="text-[11px] text-slate-600 mb-4 truncate">
              <span
                className="inline-block mr-1.5 w-1.5 h-1.5 rounded-full align-middle"
                style={{ background: '#14b8a6', boxShadow: '0 0 4px rgba(20,184,166,0.7)' }}
              />
              {title}
            </p>

            {sheet.mode === 'branching' ? (
              <BranchingContent
                sheet={sheet}
                onOutcomeSelect={onOutcomeSelect}
                onToggleFollowUp={onToggleFollowUp}
                onDone={onBranchingDone}
                onSkip={onSkip}
              />
            ) : (
              <GenerativeContent
                sheet={sheet}
                textareaRef={textareaRef}
                onNoteChange={onNoteChange}
                onSubmit={onGenerativeSubmit}
                onToggleSuggestion={onToggleSuggestion}
                onDone={onGenerativeDone}
                onSkip={onSkip}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── Branching sub-content ─── */

function BranchingContent({
  sheet, onOutcomeSelect, onToggleFollowUp, onDone, onSkip,
}: {
  sheet: SheetState
  onOutcomeSelect: (o: string) => void
  onToggleFollowUp: (i: number) => void
  onDone: () => void
  onSkip: () => void
}) {
  if (!sheet.selectedOutcome) {
    return (
      <>
        <h3 className="text-base font-semibold text-slate-100 mb-4">How did it go?</h3>
        <div className="flex flex-col gap-2 mb-4">
          {sheet.outcomes.map(outcome => (
            <button
              key={outcome}
              onClick={() => onOutcomeSelect(outcome)}
              className="w-full text-left px-4 py-3 rounded-2xl text-sm font-medium text-slate-200 transition-all duration-150 active:scale-[0.98]"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.15)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,58,237,0.35)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.09)'
              }}
            >
              {outcome}
            </button>
          ))}
        </div>
        <button onClick={onSkip} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
          Skip
        </button>
      </>
    )
  }

  // Outcome selected — show follow-ups
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <span
          className="text-xs font-semibold rounded-full px-2.5 py-1"
          style={{ color: '#2dd4bf', background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.2)' }}
        >
          {sheet.selectedOutcome}
        </span>
      </div>

      {sheet.pendingFollowUps.length > 0 ? (
        <>
          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-3">
            Suggested follow-ups
          </p>
          <div className="space-y-2 mb-5">
            {sheet.pendingFollowUps.map((title, i) => {
              const accepted = sheet.acceptedFollowUps.has(i)
              return (
                <button
                  key={i}
                  onClick={() => onToggleFollowUp(i)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm text-left transition-all duration-150"
                  style={accepted ? {
                    background: 'rgba(124,58,237,0.15)',
                    border: '1px solid rgba(124,58,237,0.35)',
                    color: '#c4b5fd',
                  } : {
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: '#64748b',
                  }}
                >
                  <div
                    className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-all"
                    style={accepted ? {
                      background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                    } : {
                      border: '1.5px solid rgba(255,255,255,0.18)',
                    }}
                  >
                    {accepted && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                  <span className="leading-snug">{title}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={onDone} className="btn-primary flex-1 justify-center py-2.5">
              {sheet.acceptedFollowUps.size > 0
                ? `Add ${sheet.acceptedFollowUps.size} follow-up${sheet.acceptedFollowUps.size > 1 ? 's' : ''}`
                : 'Done'}
            </button>
            <button onClick={onSkip} className="btn-secondary px-4">
              Skip
            </button>
          </div>
        </>
      ) : (
        <button onClick={onDone} className="btn-primary w-full justify-center py-2.5">
          Done
        </button>
      )}
    </>
  )
}

/* ─── Generative sub-content ─── */

function GenerativeContent({
  sheet, textareaRef, onNoteChange, onSubmit, onToggleSuggestion, onDone, onSkip,
}: {
  sheet: SheetState
  textareaRef: React.RefObject<HTMLTextAreaElement>
  onNoteChange: (s: string) => void
  onSubmit: () => void
  onToggleSuggestion: (i: number) => void
  onDone: () => void
  onSkip: () => void
}) {
  // Phase 1: input
  if (!sheet.noteSaved) {
    return (
      <>
        <h3 className="text-base font-semibold text-slate-100 mb-3">What came out of this?</h3>
        <textarea
          ref={textareaRef}
          value={sheet.note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="New idea, blocker discovered, thread to pull…"
          rows={3}
          className="w-full px-4 py-3 text-sm text-slate-100 placeholder-slate-600 resize-none rounded-2xl bg-transparent focus:outline-none mb-4 leading-relaxed"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
          onFocus={e => {
            (e.target as HTMLElement).style.borderColor = 'rgba(124,58,237,0.5)'
            ;(e.target as HTMLElement).style.boxShadow = '0 0 0 3px rgba(124,58,237,0.1)'
          }}
          onBlur={e => {
            (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.09)'
            ;(e.target as HTMLElement).style.boxShadow = 'none'
          }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit() }}
        />
        <div className="flex gap-2">
          <button
            onClick={onSubmit}
            disabled={!sheet.note.trim()}
            className="btn-primary flex-1 justify-center py-2.5"
          >
            Capture + suggest
          </button>
          <button onClick={onSkip} className="btn-secondary px-4">
            Skip
          </button>
        </div>
      </>
    )
  }

  // Phase 2: loading suggestions
  if (sheet.loadingSuggestions) {
    return (
      <div className="flex items-center gap-3 py-4">
        <svg className="w-4 h-4 animate-spin text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="text-sm text-slate-500">Finding follow-ups…</p>
      </div>
    )
  }

  // Phase 3: suggestions (or just done if none)
  if (sheet.suggestions.length === 0) {
    return (
      <>
        <div
          className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-2xl"
          style={{ background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.18)' }}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#2dd4bf' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <p className="text-xs text-slate-400">Captured: <span className="text-slate-300">"{sheet.note.slice(0, 50)}{sheet.note.length > 50 ? '…' : ''}"</span></p>
        </div>
        <button onClick={onDone} className="btn-primary w-full justify-center py-2.5">
          Done
        </button>
      </>
    )
  }

  return (
    <>
      <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-3">
        Suggested follow-ups
      </p>
      <div className="space-y-2 mb-5">
        {sheet.suggestions.map((title, i) => {
          const accepted = sheet.acceptedSuggestions.has(i)
          return (
            <button
              key={i}
              onClick={() => onToggleSuggestion(i)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm text-left transition-all duration-150"
              style={accepted ? {
                background: 'rgba(124,58,237,0.15)',
                border: '1px solid rgba(124,58,237,0.35)',
                color: '#c4b5fd',
              } : {
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: '#64748b',
              }}
            >
              <div
                className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-all"
                style={accepted ? {
                  background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                } : {
                  border: '1.5px solid rgba(255,255,255,0.18)',
                }}
              >
                {accepted && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
              <span className="leading-snug">{title}</span>
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <button onClick={onDone} className="btn-primary flex-1 justify-center py-2.5">
          {sheet.acceptedSuggestions.size > 0
            ? `Add ${sheet.acceptedSuggestions.size} task${sheet.acceptedSuggestions.size > 1 ? 's' : ''}`
            : 'Done'}
        </button>
        <button onClick={onSkip} className="btn-secondary px-4">
          Skip
        </button>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Done screen
═══════════════════════════════════════════════════════════════════════════ */

function DoneScreen({ items, checkedIds, onReset }: {
  items: SprintItem[]
  checkedIds: Set<string>
  onReset: () => void
}) {
  const completed = items.filter(i => checkedIds.has(i.id))

  return (
    <div className="px-4 pt-8 pb-4">
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
          {completed.length === 1 ? 'You cleared 1 item.' : `You cleared ${completed.length} items.`}
        </p>
      </div>

      {completed.length > 0 && (
        <div className="card p-4 mb-6 space-y-2.5">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-3">Completed</p>
          {completed.map(item => (
            <div key={item.id} className="flex items-start gap-2.5">
              <div
                className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #14b8a6, #0d9488)', boxShadow: '0 0 0 2px rgba(20,184,166,0.15)' }}
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
