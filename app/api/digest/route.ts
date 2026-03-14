import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Digest endpoint removed. Items are now enriched automatically on capture.' }, { status: 410 })
}
