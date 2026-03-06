'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { ApprovedAction, Priority } from '@/types'
import { format } from 'date-fns'

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'text-ink-400 bg-ink-50 border-ink-200' },
  med: { label: 'Med', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  high: { label: 'High', color: 'text-red-700 bg-red-50 border-red-200' },
}

export default function ApprovedPage() {
  const [actions, setActions] = useState<ApprovedAction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'done' | 'snoozed' | 'all'>('active')
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('approved_actions')
      .select('*')
      .order('created_at', { ascending: false })
    setActions(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: ApprovedAction['status']) {
    await supabase.from('approved_actions').update({ status }).eq('id', id)
    setActions(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  async function updatePriority(id: string, priority: Priority) {
    await supabase.from('approved_actions').update({ priority }).eq('id', id)
    setActions(prev => prev.map(a => a.id === id ? { ...a, priority } : a))
  }

  async function updateDueDate(id: string, due_date: string | null) {
    await supabase.from('approved_actions').update({ due_date }).eq('id', id)
    setActions(prev => prev.map(a => a.id === id ? { ...a, due_date } : a))
  }

  const filtered = filter === 'all' ? actions : actions.filter(a => a.status === filter)
  const counts = {
    active: actions.filter(a => a.status === 'active').length,
    done: actions.filter(a => a.status === 'done').length,
    snoozed: actions.filter(a => a.status === 'snoozed').length,
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Approved Actions</h1>
        <p className="text-ink-400 text-sm mt-0.5">{counts.active} active · {counts.done} done · {counts.snoozed} snoozed</p>
      </div>

      {/* Filter tabs */}
      <div className="flex bg-ink-50 rounded-xl p-1 mb-5">
        {([['active', 'Active'], ['snoozed', 'Snoozed'], ['done', 'Done'], ['all', 'All']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
              filter === val ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="card p-4 h-20 animate-pulse bg-ink-50" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">
            {filter === 'done' ? '✅' : filter === 'snoozed' ? '😴' : '📋'}
          </div>
          <p className="text-ink-400 text-sm">
            {filter === 'active' ? 'No active actions. Run a digest to get started!' : `No ${filter} actions.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2 animate-fade-in">
          {filtered.map(action => (
            <ApprovedCard
              key={action.id}
              action={action}
              onStatusChange={updateStatus}
              onPriorityChange={updatePriority}
              onDueDateChange={updateDueDate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ApprovedCard({
  action,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
}: {
  action: ApprovedAction
  onStatusChange: (id: string, status: ApprovedAction['status']) => void
  onPriorityChange: (id: string, priority: Priority) => void
  onDueDateChange: (id: string, due_date: string | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isDone = action.status === 'done'
  const priConfig = PRIORITY_CONFIG[action.priority]

  return (
    <div className={`card p-4 transition-all ${isDone ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Done toggle */}
        <button
          onClick={() => onStatusChange(action.id, isDone ? 'active' : 'done')}
          className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${
            isDone ? 'bg-sage-500 border-sage-500' : 'border-ink-300 hover:border-sage-400'
          }`}
        >
          {isDone && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium text-ink-900 ${isDone ? 'line-through' : ''}`}>
            {action.title}
          </p>
          {action.details && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-amber-600 hover:text-amber-700 mt-0.5">
              {expanded ? 'Less' : 'Details'}
            </button>
          )}
          {expanded && action.details && (
            <p className="text-xs text-ink-500 mt-1 leading-relaxed">{action.details}</p>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Priority */}
            <select
              value={action.priority}
              onChange={e => onPriorityChange(action.id, e.target.value as Priority)}
              className={`text-xs border rounded-md px-2 py-0.5 font-medium cursor-pointer focus:outline-none ${priConfig.color}`}
            >
              <option value="low">Low</option>
              <option value="med">Med</option>
              <option value="high">High</option>
            </select>

            {/* Due date */}
            <input
              type="date"
              value={action.due_date || ''}
              onChange={e => onDueDateChange(action.id, e.target.value || null)}
              className="text-xs border border-ink-200 rounded-md px-2 py-0.5 text-ink-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />

            {/* Snooze */}
            {action.status !== 'done' && (
              <button
                onClick={() => onStatusChange(action.id, action.status === 'snoozed' ? 'active' : 'snoozed')}
                className="text-xs text-ink-400 hover:text-ink-700 border border-ink-200 rounded-md px-2 py-0.5 transition-colors"
              >
                {action.status === 'snoozed' ? '🔔 Unsnooze' : '😴 Snooze'}
              </button>
            )}
          </div>

          {action.due_date && (
            <p className="text-[11px] text-ink-300 mt-1">
              Due {format(new Date(action.due_date), 'MMM d, yyyy')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
