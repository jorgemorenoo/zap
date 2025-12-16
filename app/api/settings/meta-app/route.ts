import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { getMetaAppConfigPublic } from '@/lib/meta-app-credentials'

// GET - Retorna status público (não expõe o secret)
export async function GET() {
  try {
    const cfg = await getMetaAppConfigPublic()
    return NextResponse.json(cfg, {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('Error fetching Meta App config:', error)
    return NextResponse.json({ error: 'Failed to fetch Meta App config' }, { status: 500 })
  }
}

// POST - Salva App ID/Secret no Supabase settings
// Observação: secret NUNCA é retornado; no máximo confirmamos booleanos.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const appId = String((body as any)?.appId || '').trim()
    const appSecret = String((body as any)?.appSecret || '').trim()

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: 'appId e appSecret são obrigatórios' },
        { status: 400 }
      )
    }

    await settingsDb.set('metaAppId', appId)
    await settingsDb.set('metaAppSecret', appSecret)

    const cfg = await getMetaAppConfigPublic()
    return NextResponse.json({ success: true, ...cfg })
  } catch (error) {
    console.error('Error saving Meta App config:', error)
    return NextResponse.json({ error: 'Failed to save Meta App config' }, { status: 500 })
  }
}

// DELETE - Remove do DB (não mexe nas env vars)
export async function DELETE() {
  try {
    await settingsDb.set('metaAppId', '')
    await settingsDb.set('metaAppSecret', '')

    const cfg = await getMetaAppConfigPublic()
    return NextResponse.json({ success: true, ...cfg })
  } catch (error) {
    console.error('Error deleting Meta App config:', error)
    return NextResponse.json({ error: 'Failed to delete Meta App config' }, { status: 500 })
  }
}
