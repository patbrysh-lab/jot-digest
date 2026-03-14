import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * DELETE /api/integrations/google_calendar
 * Authorization: Bearer TOKEN
 *
 * Removes the stored integration row — disconnects the provider.
 * Does not revoke the Google token (not strictly necessary for a personal app).
 */
export async function DELETE(
  request: Request,
  { params }: { params: { provider: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: { user } } = await authClient.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', params.provider)

  return NextResponse.json({ success: true })
}
