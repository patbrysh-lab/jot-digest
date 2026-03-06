'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useParams, useRouter } from 'next/navigation'
import type { ProposedAction, ProposedProject, DigestRun, InboxItem } from '@/types'
import { format } from 'date-fns'

type Tab = 'actions' | 'projects' | 'notes'

export default function ReviewPage() {
  const { digestRunId } = useParams<{ digestRunId: string }>()
  const [run, setRun] = useState<DigestRun | null>(null)
  const [actions, setActions] = useState<ProposedAction[]>([])
  const [projects, setProjects] = useState<ProposedProject[]>([])
  const [tab, setTab] = useState<Tab>('actions')
  const [loading, setLoading] = useState(true)
  const [inboxMap, setInboxMap] = useState<Record<string, InboxItem>>({})
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<string[]>([])
  const router = useRouter()
  const supabase = createClient()

  const load = useCallback(async () => {
    const [{ data: runData }, { data: actionsData }, { data: projectsData }] = await Promise.all([
      supabase.from('digest_runs').select('*').eq('id', digestRunId).single(),
      supabase.from('proposed_actions').select('*').eq('digest_run_id', digestRunId).order('confidence', { ascending: false }),
      supabase.from('proposed_projects').select('*').eq('digest_run_id', digestRunId),
    ])
    setRun(runData)
    setActions(actionsData || [])
    setProjects(projectsData || [])

    // Load inbox items for context
    if (actionsData && actionsData.length > 0) {
      const allIds = actionsData.flatMap((a: ProposedAction) => a.derived_from || [])
      if (allIds.length > 0) {
        const { data: inboxData } = await supabase
          .from('inbox_items')
          .select('*')
          .in('id', allIds)
        const map: Record<string, InboxItem> = {}
        ;(inboxData || []).forEach((item: InboxItem) => { map[item.id] = item })
        setInboxMap(map)
      }
    }
    setLoading(false)
  }, [digestRunId])

  useEffect(() => { load() }, [load])

  async function handleApprove(action: ProposedAction) {
    const res = await fetch('/api/actions/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId: action.id }),
    })
    if (res.ok) {
      setActions(prev => prev.map(a => a.id === action.id ? { ...a, status: 'approved' } : a))
    }
  }

  async function handleReject(id: string) {
    await supabase.from('proposed_actions').update({ status: 'rejected' }).eq('id', id)
    setActions(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a))
  }

  async function handleMerge() {
    if (mergeSelected.length !== 2) return
    const [a1, a2] = mergeSelected.map(id => actions.find(a => a.id === id)!)
    const mergedTitle = `${a1.title} + ${a2.title}`
    const mergedDetails = [a1.details, a2.details].filter(Boolean).join('\n\n')
    const mergedDerived = Array.from(new Set([...a1.derived_from, ...a2.derived_from]))

    const { data } = await supabase
      .from('proposed_actions')
      .insert({
        digest_run_id: digestRunId,
        title: mergedTitle,
        details: mergedDetails,
        confidence: Math.max(a1.confidence, a2.confidence),
        derived_from: mergedDerived,
        status: 'proposed',
      })
      .select()
      .single()

    await supabase.from('proposed_actions').update({ status: 'merged' }).in('id', mergeSelected)
    setActions(prev => [
      ...(data ? [data] : []),
      ...prev.map(a => mergeSelected.includes(a.id) ? { ...a, status: 'merged' as const } : a),
    ])
    setMergeMode(false)
    setMergeSelected([])
  }

  if (loading) {
    return (
      <div className="px-4 pt-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-ink-100 rounded w-1/2" />
          <div className="h-4 bg-ink-50 rounded w-1/3" />
          {[1,2,3].map(i => <div key={i} className="card p-4 h-24 bg-ink-50" />)}
        </div>
      </div>
    )
  }

  const pendingActions = actions.filter(a => a.status === 'proposed')
  const approvedActions = actions.filter(a => a.status === 'approved')
  const rejectedActions = actions.filter(a => a.status === 'rejected')
  const notes = run?.output_json?.remaining_notes || []

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-5">
        <button onClick={() => router.push('/digest')} className="text-ink-400 hover:text-ink-700 text-sm mb-3 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Digest
        </button>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Review Digest</h1>
        {run && (
          <p className="text-ink-400 text-sm mt-0.5">
            {format(new Date(run.range_start), 'MMM d')} – {format(new Date(run.range_end), 'MMM d, yyyy')}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="card p-3 text-center">
          <div className="font-display text-2xl font-semibold text-amber-600">{pendingActions.length}</div>
          <div className="text-xs text-ink-400 mt-0.5">Pending</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-2xl font-semibold text-sage-600">{approvedActions.length}</div>
          <div className="text-xs text-ink-400 mt-0.5">Approved</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-2xl font-semibold text-ink-500">{projects.length}</div>
          <div className="text-xs text-ink-400 mt-0.5">Projects</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-ink-50 rounded-xl p-1 mb-5">
        {([['actions', 'Actions'], ['projects', 'Projects'], ['notes', 'Notes']] as [Tab, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === value
                ? 'bg-white shadow-sm text-ink-900'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Actions Tab */}
      {tab === 'actions' && (
        <div>
          {pendingActions.length > 0 && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => { setMergeMode(!mergeMode); setMergeSelected([]) }}
                className={`btn-secondary text-xs py-1.5 ${mergeMode ? 'bg-amber-50 text-amber-700 border border-amber-200' : ''}`}
              >
                {mergeMode ? 'Cancel Merge' : 'Merge Mode'}
              </button>
            </div>
          )}

          {mergeMode && mergeSelected.length === 2 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-amber-700">Merge 2 actions?</span>
              <button onClick={handleMerge} className="btn-primary text-xs py-1.5">Merge</button>
            </div>
          )}

          {pendingActions.length === 0 && approvedActions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-ink-400 text-sm">All actions reviewed!</p>
              <button onClick={() => router.push('/approved')} className="btn-primary mt-4">View Approved Actions</button>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingActions.map(action => (
                <ActionCard
                  key={action.id}
                  action={action}
                  inboxMap={inboxMap}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  mergeMode={mergeMode}
                  mergeSelected={mergeSelected}
                  onToggleMerge={id => {
                    setMergeSelected(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id)
                      : prev.length < 2 ? [...prev, id] : [prev[1], id]
                    )
                  }}
                />
              ))}
              {approvedActions.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-ink-400 uppercase tracking-wide font-medium mb-2">Approved</p>
                  {approvedActions.map(action => (
                    <div key={action.id} className="card p-4 opacity-60 mb-2 border-sage-200 bg-sage-50">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-sage-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <p className="text-sm text-ink-700 font-medium">{action.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {rejectedActions.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-ink-400 uppercase tracking-wide font-medium mb-2">Rejected</p>
                  {rejectedActions.map(action => (
                    <div key={action.id} className="card p-4 opacity-40 mb-2">
                      <p className="text-sm text-ink-500 line-through">{action.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Projects Tab */}
      {tab === 'projects' && (
        <div className="space-y-3">
          {projects.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📁</div>
              <p className="text-ink-400 text-sm">No project clusters identified.</p>
            </div>
          ) : (
            projects.map(project => (
              <div key={project.id} className="card p-5">
                <h3 className="font-display text-base font-semibold text-ink-900 mb-1">{project.name}</h3>
                <p className="text-sm text-ink-600 mb-3">{project.summary}</p>
                {project.related_actions.length > 0 && (
                  <div>
                    <p className="text-xs text-ink-400 uppercase tracking-wide mb-1.5">Related actions</p>
                    <div className="space-y-1">
                      {project.related_actions.map(actionId => {
                        const action = actions.find(a => a.id === actionId)
                        if (!action) return null
                        return (
                          <div key={actionId} className="flex items-center gap-2 text-xs text-ink-600">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              action.status === 'approved' ? 'bg-sage-500' :
                              action.status === 'rejected' ? 'bg-red-400' : 'bg-amber-400'
                            }`} />
                            {action.title}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Notes Tab */}
      {tab === 'notes' && (
        <div className="space-y-2">
          {notes.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">💭</div>
              <p className="text-ink-400 text-sm">All items were actionable — no remaining notes.</p>
            </div>
          ) : (
            notes.map((note, i) => (
              <div key={i} className="card p-4">
                <p className="text-sm text-ink-700 leading-relaxed">{note.text}</p>
                <p className="text-[11px] text-ink-300 mt-2">
                  {inboxMap[note.original_id] ? format(new Date(inboxMap[note.original_id].created_at), 'MMM d') : ''}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ActionCard({
  action,
  inboxMap,
  onApprove,
  onReject,
  mergeMode,
  mergeSelected,
  onToggleMerge,
}: {
  action: ProposedAction
  inboxMap: Record<string, InboxItem>
  onApprove: (a: ProposedAction) => void
  onReject: (id: string) => void
  mergeMode: boolean
  mergeSelected: string[]
  onToggleMerge: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(action.title)
  const [editDetails, setEditDetails] = useState(action.details)
  const supabase = createClient()
  const isSelected = mergeSelected.includes(action.id)

  async function handleSaveEdit() {
    await supabase.from('proposed_actions').update({ title: editTitle, details: editDetails }).eq('id', action.id)
    action.title = editTitle
    action.details = editDetails
    setEditing(false)
  }

  const confidenceColor =
    action.confidence >= 0.8 ? 'bg-sage-400' :
    action.confidence >= 0.5 ? 'bg-amber-400' : 'bg-red-300'

  return (
    <div className={`card p-4 transition-all ${
      mergeMode && isSelected ? 'ring-2 ring-amber-400 shadow-md' : ''
    }`}>
      {mergeMode && (
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleMerge(action.id)}
            className="w-4 h-4 accent-amber-500"
          />
          <span className="text-xs text-amber-700 font-medium">Select for merge</span>
        </label>
      )}

      {editing ? (
        <div className="space-y-3">
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="input font-medium"
          />
          <textarea
            value={editDetails}
            onChange={e => setEditDetails(e.target.value)}
            className="input resize-none min-h-[80px] text-sm"
          />
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} className="btn-primary text-xs py-1.5">Save</button>
            <button onClick={() => setEditing(false)} className="btn-secondary text-xs py-1.5">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full shrink-0 ${confidenceColor}`} title={`Confidence: ${Math.round(action.confidence * 100)}%`} />
                <p className="text-sm font-semibold text-ink-900">{action.title}</p>
              </div>
              {action.details && (
                <p className="text-xs text-ink-500 leading-relaxed">{action.details}</p>
              )}
            </div>
          </div>

          {/* Sources */}
          {action.derived_from.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-amber-600 hover:text-amber-700 mb-3"
            >
              {expanded ? 'Hide' : 'Show'} {action.derived_from.length} source{action.derived_from.length > 1 ? 's' : ''}
            </button>
          )}
          {expanded && (
            <div className="bg-ink-50 rounded-lg p-3 mb-3 space-y-2">
              {action.derived_from.map(id => inboxMap[id] && (
                <p key={id} className="text-xs text-ink-500 italic">"{inboxMap[id].raw_text}"</p>
              ))}
            </div>
          )}

          {/* Actions */}
          {!mergeMode && (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => onApprove(action)} className="btn-success text-xs py-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Approve
              </button>
              <button onClick={() => setEditing(true)} className="btn-secondary text-xs py-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                </svg>
                Edit
              </button>
              <button onClick={() => onReject(action.id)} className="btn-danger text-xs py-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reject
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
