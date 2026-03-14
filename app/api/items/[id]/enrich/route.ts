import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enrichItem, MODEL_VERSION } from '@/lib/claude'
import type { Item } from '@/types'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user } } = await adminClient.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: item, error: fetchError } = await supabase
    .from('items')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  let enrichment
  try {
    enrichment = await enrichItem(item as Item)
  } catch (err) {
    return NextResponse.json({ error: 'Enrichment failed', detail: String(err) }, { status: 500 })
  }

  // Save enrichment record
  await supabase.from('item_enrichments').insert({
    item_id: item.id,
    model_version: MODEL_VERSION,
    raw_output: enrichment,
  })

  // Save entities
  if (enrichment.entities?.length > 0) {
    await supabase.from('item_entities').insert(
      enrichment.entities.map((e) => ({
        item_id: item.id,
        entity_type: e.entity_type,
        entity_value: e.entity_value,
      }))
    )
  }

  // Save next step
  let expiresAt: string | null = null
  if (enrichment.next_step?.expires_in_days != null) {
    const d = new Date()
    d.setDate(d.getDate() + enrichment.next_step.expires_in_days)
    expiresAt = d.toISOString()
  }

  await supabase.from('next_steps').insert({
    item_id: item.id,
    text: enrichment.next_step.text,
    type: enrichment.next_step.type,
    status: 'active',
    expires_at: expiresAt,
  })

  // Update item fields + advance state
  await supabase
    .from('items')
    .update({
      item_type: enrichment.item_type,
      context: enrichment.context,
      effort: enrichment.effort,
      horizon: enrichment.horizon,
      curiosity_score: enrichment.curiosity_score,
      actionability_score: enrichment.actionability_score,
      time_sensitivity: enrichment.time_sensitivity,
      importance: enrichment.importance,
      avoidance_score: enrichment.avoidance_score,
      completion_mode: enrichment.completion_mode ?? 'closes',
      possible_outcomes: enrichment.possible_outcomes?.length ? enrichment.possible_outcomes : null,
      follow_up_templates: enrichment.follow_up_templates && Object.keys(enrichment.follow_up_templates).length
        ? enrichment.follow_up_templates
        : null,
      state: 'triaged',
    })
    .eq('id', item.id)

  // Record state transition
  await supabase.from('state_history').insert({
    item_id: item.id,
    from_state: item.state,
    to_state: 'triaged',
    changed_by: MODEL_VERSION,
  })

  return NextResponse.json({ success: true, enrichment })
}
