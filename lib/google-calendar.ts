const GOOGLE_AUTH_URL     = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL    = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const GOOGLE_FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

export interface BusyPeriod {
  start: string
  end: string
}

export interface FreeWindow {
  start: Date
  end: Date
  durationMins: number
}

/* ─── OAuth helpers ─── */

export function buildOAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',   // force to always return a refresh_token
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params}`
}

export async function exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange failed: ${err}`)
  }
  return res.json()
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) throw new Error('Token refresh failed')
  return res.json()
}

export async function getUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return ''
  const data = await res.json()
  return data.email || ''
}

/* ─── Calendar API ─── */

export async function getFreeBusy(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<BusyPeriod[]> {
  const res = await fetch(GOOGLE_FREEBUSY_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: 'primary' }] }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data.calendars?.primary?.busy as BusyPeriod[]) || []
}

/* ─── Free-window finder ─── */

/**
 * Find contiguous free windows >= minMins long within [dayStart, dayEnd].
 */
export function findFreeWindows(
  busy: BusyPeriod[],
  minMins: number,
  dayStart: Date,
  dayEnd: Date,
): FreeWindow[] {
  const sorted = busy
    .map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
    .filter(b => b.end > dayStart && b.start < dayEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const windows: FreeWindow[] = []
  let cursor = new Date(dayStart)

  for (const block of sorted) {
    const blockStart = block.start < dayStart ? new Date(dayStart) : block.start
    const gapMins = (blockStart.getTime() - cursor.getTime()) / 60_000
    if (gapMins >= minMins) {
      windows.push({ start: new Date(cursor), end: new Date(blockStart), durationMins: Math.floor(gapMins) })
    }
    if (block.end > cursor) cursor = new Date(block.end)
  }

  // Final gap after last busy block
  const finalGapMins = (dayEnd.getTime() - cursor.getTime()) / 60_000
  if (finalGapMins >= minMins) {
    windows.push({ start: new Date(cursor), end: new Date(dayEnd), durationMins: Math.floor(finalGapMins) })
  }

  return windows
}

/* ─── Token expiry helper ─── */

export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  // Treat as expired 2 min before actual expiry to avoid race conditions
  return new Date(expiresAt).getTime() - 120_000 < Date.now()
}

/* ─── Redirect URI helper ─── */

export function getRedirectUri(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}/api/auth/google/callback`
}
