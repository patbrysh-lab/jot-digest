import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runDigest, MODEL_VERSION } from '@/lib/claude'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Create an admin client to verify the user
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user } } = await adminClient.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Create a user-scoped client using their token so RLS works
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    )

    const { rangeStart, rangeEnd } = await request.json()

    const { data: items, error: itemsError } = await supabase
      .from('inbox_items')
      .select('*')
      .eq('status', 'inbox')
      .order('created_at', { ascending: true })

    console.log('ITEMS ERROR:', itemsError)
    console.log('ITEMS FOUND:', items?.length)

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No inbox items found in range' }, { status: 400 })
    }

    const digestOutput = await runDigest(items)

    const { data: digestRun } = await supabase
      .from('digest_runs')
      .insert({
        user_id: user.id,
        range_start: rangeStart,
        range_end: rangeEnd,
        model_version: MODEL_VERSION,
        output_json: digestOutput,
      })
      .select()
      .single()

    if (!digestRun) {
      return NextResponse.json({ error: 'Failed to save digest run' }, { status: 500 })
    }

    const actionsToInsert = digestOutput.proposed_actions.map((a: any) => ({
      digest_run_id: digestRun.id,
      user_id: user.id,
      title: a.title,
      details: a.details || '',
      confidence: a.confidence,
      derived_from: a.derived_from || [],
      status: 'proposed',
    }))

    const { data: savedActions } = await supabase
      .from('proposed_actions')
      .insert(actionsToInsert)
      .select()

    if (savedActions && digestOutput.proposed_projects.length > 0) {
      const projectsToInsert = digestOutput.proposed_projects.map((p: any) => ({
        digest_run_id: digestRun.id,
        user_id: user.id,
        name: p.name,
        summary: p.summary,
        related_actions: (p.related_action_indices || [])
          .map((idx: number) => savedActions[idx]?.id)
          .filter(Boolean),
      }))
      await supabase.from('proposed_projects').insert(projectsToInsert)
    }

    return NextResponse.json({ digestRunId: digestRun.id })
  } catch (error: any) {
    console.log('CAUGHT ERROR:', error?.message)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}