import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildOAuthUrl, getRedirectUri } from '@/lib/google-calendar'

/**
 * GET /api/auth/google/start?token=ACCESS_TOKEN
 *
 * Validates the Supabase token, stores the user_id + a random nonce in
 * short-lived HttpOnly cookies, then redirects the browser to Google OAuth.
 */
export async function GET(request: Request) {
  const url  = new URL(request.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  // Verify the Supabase token and get the user
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Generate a random nonce for CSRF protection
  const nonce = crypto.randomUUID()
  const redirectUri = getRedirectUri(request)
  const oauthUrl = buildOAuthUrl(redirectUri, nonce)

  // Store nonce + user_id in short-lived HttpOnly cookies
  const cookieOpts = [
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=600',               // 10 minutes
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].filter(Boolean).join('; ')

  const response = NextResponse.redirect(oauthUrl)
  response.headers.append('Set-Cookie', `oauth_nonce=${nonce}; ${cookieOpts}`)
  response.headers.append('Set-Cookie', `oauth_uid=${user.id}; ${cookieOpts}`)
  // Also store the Supabase token so the callback can make an authenticated upsert
  response.headers.append('Set-Cookie', `oauth_token=${token}; ${cookieOpts}`)
  return response
}
