import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  exchangeCode,
  getUserEmail,
  getRedirectUri,
} from '@/lib/google-calendar'

/**
 * GET /api/auth/google/callback?code=...&state=...
 *
 * Called by Google after the user grants consent.
 * Reads the nonce + user_id cookies set by /api/auth/google/start,
 * exchanges the code for tokens, stores them, and redirects to /settings.
 */
export async function GET(request: Request) {
  const url    = new URL(request.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')
  const errParam = url.searchParams.get('error')

  const baseUrl = `${url.protocol}//${url.host}`

  if (errParam) {
    return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent(errParam)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?error=missing_params`)
  }

  // Read cookies
  const cookieHeader = request.headers.get('cookie') || ''
  const parseCookie  = (name: string) => {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
    return match ? match[1] : null
  }
  const storedNonce = parseCookie('oauth_nonce')
  const storedUid   = parseCookie('oauth_uid')

  // CSRF check
  if (!storedNonce || storedNonce !== state) {
    return NextResponse.redirect(`${baseUrl}/settings?error=state_mismatch`)
  }
  if (!storedUid) {
    return NextResponse.redirect(`${baseUrl}/settings?error=no_session`)
  }

  // Exchange code for tokens
  let tokens
  try {
    tokens = await exchangeCode(code, getRedirectUri(request))
  } catch {
    return NextResponse.redirect(`${baseUrl}/settings?error=token_exchange_failed`)
  }

  // Get connected email
  const connectedEmail = await getUserEmail(tokens.access_token)

  // Calculate expiry time
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Use service-level insert (user_id known from cookie, not from session)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  // Upsert — one row per user per provider
  await supabase.from('user_integrations').upsert(
    {
      user_id:         storedUid,
      provider:        'google_calendar',
      access_token:    tokens.access_token,
      refresh_token:   tokens.refresh_token ?? null,
      token_expires_at: tokenExpiresAt,
      scope:           tokens.scope,
      connected_email: connectedEmail,
    },
    { onConflict: 'user_id,provider' }
  )

  // Clear the oauth cookies and redirect to settings
  const clearCookieOpts = 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
  const response = NextResponse.redirect(`${baseUrl}/settings?connected=1`)
  response.headers.append('Set-Cookie', `oauth_nonce=; ${clearCookieOpts}`)
  response.headers.append('Set-Cookie', `oauth_uid=; ${clearCookieOpts}`)
  return response
}
