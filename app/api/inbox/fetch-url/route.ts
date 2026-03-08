import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export async function POST(request: Request) {
  try {
    const { url } = await request.json()
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL required' }, { status: 400 })
    }

    // Validate URL
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Only HTTP/HTTPS URLs are supported' }, { status: 400 })
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch URL: ${res.status}` }, { status: 502 })
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return NextResponse.json({ error: 'URL does not return an HTML page' }, { status: 400 })
    }

    const html = await res.text()
    const $ = cheerio.load(html)

    // Helper to get meta content
    const getMeta = (selectors: string[]): string => {
      for (const sel of selectors) {
        const content = $(sel).attr('content')?.trim()
        if (content) return content
      }
      return ''
    }

    const title =
      getMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
      $('title').first().text().trim() ||
      parsed.hostname

    const description =
      getMeta(['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]'])

    const image = getMeta(['meta[property="og:image"]', 'meta[name="twitter:image"]'])

    const siteName =
      getMeta(['meta[property="og:site_name"]']) ||
      parsed.hostname.replace(/^www\./, '')

    // Extract main text content
    $('script, style, nav, footer, header, aside, noscript, iframe').remove()
    const mainEl = $('article, main, [role="main"]').first()
    const textSource = mainEl.length ? mainEl : $('body')
    const mainText = textSource
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000)

    return NextResponse.json({
      url,
      title,
      description,
      image,
      siteName,
      mainText,
    })
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: error?.message || 'Failed to fetch URL' }, { status: 500 })
  }
}
