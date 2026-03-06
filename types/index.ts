export type ItemSource = 'manual' | 'share' | 'other'
export type ItemStatus = 'inbox' | 'archived'
export type ActionStatus = 'proposed' | 'approved' | 'rejected' | 'merged'
export type ApprovedStatus = 'active' | 'done' | 'snoozed'
export type Priority = 'low' | 'med' | 'high'

export interface InboxItem {
  id: string
  user_id: string
  created_at: string
  source: ItemSource
  raw_text: string
  tags: string[] | null
  status: ItemStatus
}

export interface DigestRun {
  id: string
  user_id: string
  created_at: string
  range_start: string
  range_end: string
  model_version: string
  output_json: DigestOutput
}

export interface DigestOutput {
  proposed_actions: ProposedActionData[]
  proposed_projects: ProposedProjectData[]
  remaining_notes: RemainingNote[]
}

export interface ProposedActionData {
  title: string
  details: string
  confidence: number
  derived_from: string[]
}

export interface ProposedProjectData {
  name: string
  summary: string
  related_action_indices: number[]
}

export interface RemainingNote {
  text: string
  original_id: string
}

export interface ProposedAction {
  id: string
  digest_run_id: string
  user_id: string
  title: string
  details: string
  confidence: number
  derived_from: string[]
  status: ActionStatus
}

export interface ProposedProject {
  id: string
  digest_run_id: string
  user_id: string
  name: string
  summary: string
  related_actions: string[]
}

export interface ApprovedAction {
  id: string
  user_id: string
  created_at: string
  title: string
  details: string
  priority: Priority
  due_date: string | null
  status: ApprovedStatus
  source_digest_run_id: string | null
  source_inbox_item_ids: string[]
}
