import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getFreeBusy,
  refreshAccessToken,
  findFreeWindows,
  isTokenExpired,
} from '@/lib/google-calendar'
import { format } from 'date-fns'

const DURATIONS = [15, 30, 60, 120] as const

function formatTime(d: Date): string {
  return format(d, 'h:mma').toLowerCase()    // e.g. "2:30pm"
}

/**
 * GET /api/calendar/free-busy
 * Authorization: Bearer TOKEN
 *
 * Returns free windows for today segmented by each sprint duration.
 * Response shape:
 * {
 *   connected: boolean,
 *   windows: {
 *     15:  { available: boolean, label: string | null },
 *     30:  { ... },
 *     60:  { ... },
 *     120: { ... },
 *   }
 * }
 */
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ connected: false, windows: null }, { status: 401 })

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: { user } } = await authClient.auth.getUser(token)
  if (!user) return NextResponse.json({ connected: false, windows: null }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'google_calendar')
    .single()

  if (!integration) {
    return NextResponse.json({ connected: false, windows: null })
  }

  // Refresh token if expired
  let accessToken = integration.access_token
  if (isTokenExpired(integration.token_expires_at) && integration.refresh_token) {
    try {
      const refreshed = await refreshAccessToken(integration.refresh_token)
      accessToken = refreshed.access_token
      const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      await supabase
        .from('user_integrations')
        .update({ access_token: accessToken, token_expires_at: tokenExpiresAt })
        .eq('id', integration.id)
    } catch {
      return NextResponse.json({ connected: true, error: 'token_refresh_failed', windows: null })
    }
  }

  // Define today's working window: 8am–8pm local time
  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(8, 0, 0, 0)
  const dayEnd = new Date(now)
  dayEnd.setHours(20, 0, 0, 0)

  // Use the later of now or dayStart so past slots don't show
  const windowStart = now > dayStart ? now : dayStart

  const busy = await getFreeBusy(accessToken, dayStart.toISOString(), dayEnd.toISOString())

  const windows: Record<number, { available: boolean; label: string | null }> = {}
  for (const mins of DURATIONS) {
    const freeSlots = findFreeWindows(busy, mins, windowStart, dayEnd)
    if (freeSlots.length === 0) {
      windows[mins] = { available: false, label: null }
    } else {
      const first = freeSlots[0]
      const isNow = first.start.getTime() - now.getTime() < 5 * 60_000
      windows[mins] = {
        available: true,
        label: isNow ? 'Free now' : `Free at ${formatTime(first.start)}`,
      }
    }
  }

  return NextResponse.json({
    connected: true,
    connectedEmail: integration.connected_email,
    windows,
  })
}
