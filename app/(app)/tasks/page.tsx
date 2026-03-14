'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { Item, NextStep, ItemContext, ItemEffort } from '@/types'
import { format } from 'date-fns'

const CONTEXTS: ItemContext[] = ['work', 'personal', 'music', 'golf', 'travel', 'creative', 'unknown']
const EFFORTS: Array<ItemEffort | 'none'> = ['quick', 'session', 'project', 'none']

const EFFORT_BADGES: Record<string, { label: string; color: string }> = {
  quick:   { label: 'Quick',    color: 'bg-green-100 text-green-700' },
  session: { label: 'Session',  color: 'bg-blue-100 text-blue-700' },
  project: { label: 'Project',  color: 'bg-purple-100 text-purple-700' },
  none:    { label: 'No effort', color: 'bg-ink-100 text-ink-400' },
}

const CONTEXT_ICONS: Record<string, string> = {
  work: '💼', personal: '🏠', music: '🎵', golf: '⛳',
  travel: '✈️', creative: '🎨', unknown: '•',
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

    if (!showDone) {
      query = query.not('state', 'eq', 'done')
    }

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

  // Group by context → effort
  const grouped = CONTEXTS.reduce((acc, ctx) => {
    const ctxItems = items.filter(i => i.context === ctx)
    if (ctxItems.length === 0) return acc

    const byEffort = EFFORTS.reduce((eAcc, effort) => {
      const effortItems = effort === 'none'
        ? ctxItems.filter(i => !i.effort)
        : ctxItems.filter(i => i.effort === effort)
      if (effortItems.length === 0) return eAcc
      return { ...eAcc, [effort]: effortItems }
    }, {} as Record<string, ItemWithSteps[]>)

    if (Object.keys(byEffort).length === 0) return acc
    return { ...acc, [ctx]: byEffort }
  }, {} as Record<string, Record<string, ItemWithSteps[]>>)

  const activeCount = items.filter(i => i.state !== 'done').length

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Tasks</h1>
        <p className="text-ink-400 text-sm mt-0.5">{activeCount} active</p>
      </div>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setShowDone(false)}
          className={`tag cursor-pointer ${!showDone ? 'bg-ink-800 text-white' : 'hover:bg-ink-200'}`}
        >
          Active
        </button>
        <button
          onClick={() => setShowDone(true)}
          className={`tag cursor-pointer ${showDone ? 'bg-ink-800 text-white' : 'hover:bg-ink-200'}`}
        >
          + Done
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 bg-ink-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-ink-50 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-ink-400 text-sm">No items here. Capture something first.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {CONTEXTS.filter(ctx => grouped[ctx]).map(ctx => (
            <div key={ctx}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">{CONTEXT_ICONS[ctx]}</span>
                <h2 className="font-display text-lg font-semibold text-ink-800 capitalize">{ctx}</h2>
                <span className="text-xs text-ink-300">
                  {Object.values(grouped[ctx]).flat().length}
                </span>
              </div>

              <div className="space-y-5">
                {EFFORTS.filter(effort => grouped[ctx][effort]).map(effort => (
                  <div key={effort}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${EFFORT_BADGES[effort].color}`}>
                        {EFFORT_BADGES[effort].label}
                      </span>
                      <div className="flex-1 h-px bg-ink-100" />
                    </div>
                    <div className="space-y-2">
                      {grouped[ctx][effort].map(item => (
                        <TaskCard
                          key={item.id}
                          item={item}
                          onDone={markDone}
                          onArchive={markArchived}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskCard({
  item,
  onDone,
  onArchive,
}: {
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

  const isLong = displayText.length > 100

  return (
    <div className={`card p-4 transition-all ${isDone ? 'opacity-50' : 'hover:shadow-md'}`}>
      <div className="flex items-start gap-3">
        {/* Done toggle */}
        <button
          onClick={() => !isDone && onDone(item.id)}
          className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            isDone
              ? 'bg-sage-500 border-sage-500'
              : 'border-ink-300 hover:border-sage-500'
          }`}
        >
          {isDone && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm text-ink-800 leading-relaxed break-words ${isDone ? 'line-through text-ink-400' : ''}`}>
            {isLong && !expanded ? displayText.slice(0, 100) + '…' : displayText}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-amber-600 mt-0.5">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}

          {/* Next step */}
          {activeStep && !isDone && (
            <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
              <svg className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
              </svg>
              <p className="text-xs text-amber-800 leading-snug">{activeStep.text}</p>
            </div>
          )}

          {/* Scores + meta */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {item.importance != null && (
              <span className="text-[10px] text-ink-400">
                imp <span className="font-semibold text-ink-600">{item.importance}/5</span>
              </span>
            )}
            {item.time_sensitivity != null && (
              <span className="text-[10px] text-ink-400">
                urgency <span className="font-semibold text-ink-600">{item.time_sensitivity}/5</span>
              </span>
            )}
            {item.avoidance_score != null && (
              <span className="text-[10px] text-ink-400">
                avoid <span className="font-semibold text-ink-600">{item.avoidance_score}/10</span>
              </span>
            )}
            {item.horizon && (
              <span className="text-[10px] bg-ink-50 text-ink-400 rounded px-1.5 py-0.5">{item.horizon}</span>
            )}
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-amber-600 hover:text-amber-700 hover:underline"
                onClick={e => e.stopPropagation()}
              >
                Open ↗
              </a>
            )}
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
