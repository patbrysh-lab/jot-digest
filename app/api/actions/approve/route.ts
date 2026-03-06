import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user } } = await adminClient.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // User-scoped client so RLS works
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` }
        }
      }
    )

    const { actionId } = await request.json()

    const { data: action } = await supabase
      .from('proposed_actions')
      .select('*')
      .eq('id', actionId)
      .eq('user_id', user.id)
      .single()

    if (!action) return NextResponse.json({ error: 'Action not found' }, { status: 404 })

    await supabase.from('approved_actions').insert({
      user_id: user.id,
      title: action.title,
      details: action.details,
      priority: 'med',
      due_date: null,
      status: 'active',
      source_digest_run_id: action.digest_run_id,
      source_inbox_item_ids: action.derived_from || [],
    })

    await supabase.from('proposed_actions').update({ status: 'approved' }).eq('id', actionId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}