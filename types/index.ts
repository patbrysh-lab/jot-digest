export type ItemType = 'task' | 'curiosity' | 'content' | 'event' | 'idea' | 'reference' | 'catch_all'
export type ItemContext = 'work' | 'personal' | 'music' | 'golf' | 'travel' | 'creative' | 'unknown'
export type ItemState = 'captured' | 'triaged' | 'ready' | 'in_progress' | 'done' | 'archived'
export type ItemEffort = 'quick' | 'session' | 'project'
export type ItemHorizon = 'active' | 'later' | 'someday'
export type ItemSource = 'manual' | 'url' | 'share' | 'voice' | 'screenshot'
export type EntityType = 'person' | 'place' | 'company' | 'artist' | 'topic' | 'brand'
export type NextStepStatus = 'active' | 'expired' | 'completed' | 'dismissed'
export type NextStepType = 'action' | 'explore' | 'consume' | 'develop' | 'none'
export type ItemRelationship =
  | 'related_to'
  | 'duplicate_of'
  | 'part_of_same_project'
  | 'followup_to'
  | 'same_entity_cluster'
  | 'inspired_by'

export interface UrlSummary {
  title: string
  description: string | null
  image: string | null
  siteName: string
  mainText: string | null
  author?: string | null
  embed_type?: string | null
}

export interface Item {
  id: string
  user_id: string
  raw_text: string | null
  url: string | null
  item_type: ItemType | null
  context: ItemContext
  state: ItemState
  effort: ItemEffort | null
  horizon: ItemHorizon | null
  curiosity_score: number | null
  actionability_score: number | null
  time_sensitivity: number | null
  importance: number | null
  avoidance_score: number | null
  url_summary: UrlSummary | null
  source: ItemSource
  created_at: string
  updated_at: string
}

export interface ItemEnrichment {
  id: string
  item_id: string
  enriched_at: string
  model_version: string | null
  raw_output: Record<string, unknown> | null
}

export interface ItemEntity {
  id: string
  item_id: string
  entity_type: EntityType
  entity_value: string
}

export interface NextStep {
  id: string
  item_id: string
  text: string
  generated_at: string
  expires_at: string | null
  status: NextStepStatus
  type: NextStepType
}

export interface StateHistory {
  id: string
  item_id: string
  from_state: string | null
  to_state: string
  changed_at: string
  changed_by: string | null
}

export interface ItemLink {
  id: string
  item_a_id: string
  item_b_id: string
  relationship: ItemRelationship
  created_by: string | null
}

export interface EnrichmentOutput {
  item_type: ItemType
  context: ItemContext
  effort: ItemEffort | null
  horizon: ItemHorizon
  curiosity_score: number
  actionability_score: number
  time_sensitivity: number
  importance: number
  avoidance_score: number
  next_step: {
    text: string
    type: NextStepType
    expires_in_days: number | null
  }
  entities: Array<{
    entity_type: EntityType
    entity_value: string
  }>
  reasoning: string
}

export interface ItemWithRelations extends Item {
  next_steps?: NextStep[]
  item_entities?: ItemEntity[]
}
