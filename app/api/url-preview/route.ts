import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

/* ─── oEmbed provider registry ─── */
const OEMBED_PROVIDERS: Record<string, { endpoint: string; name: string }> = {
  'youtube.com':      { endpoint: 'https://www.youtube.com/oembed?format=json&url=',    name: 'YouTube' },
  'youtu.be':         { endpoint: 'https://www.youtube.com/oembed?format=json&url=',    name: 'YouTube' },
  'vimeo.com':        { endpoint: 'https://vimeo.com/api/oembed.json?url=',             name: 'Vimeo' },
  'open.spotify.com': { endpoint: 'https://open.spotify.com/oembed?url=',              name: 'Spotify' },
  'instagram.com':    { endpoint: 'https://api.instagram.com/oembed?url=',             name: 'Instagram' },
  'twitter.com':      { endpoint: 'https://publish.twitter.com/oembed?url=',           name: 'Twitter' },
  'x.com':            { endpoint: 'https://publish.twitter.com/oembed?url=',           name: 'X' },
  'tiktok.com':       { endpoint: 'https://www.tiktok.com/oembed?url=',               name: 'TikTok' },
}

async function tryOEmbed(url: string, provider: { endpoint: string; name: string }) {
  const res = await fetch(`${provider.endpoint}${encodeURIComponent(url)}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.title) return null
  return {
    title:      (data.title as string) || provider.name,
    description: (data.description as string | undefined) ?? null,
    image:      (data.thumbnail_url as string | undefined) ?? null,
    siteName:   provider.name,
    author:     (data.author_name as string | undefined) ?? null,
    embed_type: (data.type as string | undefined) ?? 'rich',
    mainText:   null as string | null,
  }
}

async function fetchOGData(url: string, hostname: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null

  const html = await res.text()
  const $ = cheerio.load(html)
  const getMeta = (selectors: string[]): string => {
    for (const sel of selectors) {
      const v = $(sel).attr('content')?.trim()
      if (v) return v
    }
    return ''
  }

  const title =
    getMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    $('title').first().text().trim() ||
    hostname

  const description =
    getMeta(['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]']) || null

  const image =
    getMeta(['meta[property="og:image"]', 'meta[name="twitter:image"]']) || null

  const siteName =
    getMeta(['meta[property="og:site_name"]']) || hostname.replace(/^www\./, '')

  // Extract readable page text for Claude enrichment
  $('script, style, nav, footer, header, aside, noscript, iframe').remove()
  const mainEl = $('article, main, [role="main"]').first()
  const textSource = mainEl.length ? mainEl : $('body')
  const mainText = textSource.text().replace(/\s+/g, ' ').trim().slice(0, 1000) || null

  return { title, description, image, siteName, author: null, embed_type: 'link', mainText }
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json()
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL required' }, { status: 400 })
    }

    let parsed: URL
    try { parsed = new URL(url) } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Only HTTP/HTTPS URLs are supported' }, { status: 400 })
    }

    const hostname = parsed.hostname
    // Match with or without leading www.
    const provider =
      OEMBED_PROVIDERS[hostname] ||
      OEMBED_PROVIDERS[hostname.replace(/^www\./, '')]

    // 1. Try oEmbed first for supported providers
    if (provider) {
      try {
        const result = await tryOEmbed(url, provider)
        if (result) return NextResponse.json(result)
      } catch {
        // fall through to OG scraping
      }
    }

    // 2. Fallback: OG tags / HTML title
    const og = await fetchOGData(url, hostname)
    if (!og) {
      return NextResponse.json({ error: 'Could not fetch URL metadata' }, { status: 502 })
    }
    return NextResponse.json(og)

  } catch (error: unknown) {
    const err = error as { name?: string; message?: string }
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: err?.message || 'Failed to fetch URL' }, { status: 500 })
  }
}
