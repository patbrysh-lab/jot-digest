import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { MODEL_VERSION } from '@/lib/claude'
import type { Item } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user } } = await authClient.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { completion_note } = await request.json()
  if (!completion_note?.trim()) {
    return NextResponse.json({ suggestions: [] })
  }

  const { data: item } = await supabase
    .from('items')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const it = item as Item
  const title = it.url_summary?.title || (it.raw_text || '').split('\n')[0].slice(0, 120)

  const prompt = `Completed task: "${title}"
Outcome note: "${completion_note.trim()}"

Suggest 1–3 concrete, specific follow-up tasks that naturally emerge from this outcome. Keep each title under 60 characters. Be practical, not generic.

Return ONLY valid JSON: { "suggestions": ["task title 1", "task title 2"] }`

  let suggestions: string[] = []
  try {
    const response = await anthropic.messages.create({
      model: MODEL_VERSION,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : []
  } catch {
    suggestions = []
  }

  return NextResponse.json({ suggestions })
}
