import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeCodeForTokens,
  saveTokens,
  buildDefaultCalendarConfig,
  saveCalendarConfig,
  ensureCalendarChannel,
} from '@/lib/google-calendar'

const STATE_COOKIE = 'gc_oauth_state'
const RETURN_COOKIE = 'gc_oauth_return'

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const cookieState = request.cookies.get(STATE_COOKIE)?.value
    const returnTo = request.cookies.get(RETURN_COOKIE)?.value || '/settings'

    if (!code) {
      return NextResponse.json({ error: 'Codigo OAuth ausente' }, { status: 400 })
    }
    if (!state || !cookieState || state !== cookieState) {
      return NextResponse.json({ error: 'Estado OAuth invalido' }, { status: 400 })
    }

    const tokens = await exchangeCodeForTokens(code)
    await saveTokens(tokens)

    const config = await buildDefaultCalendarConfig()
    await saveCalendarConfig(config)

    await ensureCalendarChannel(config.calendarId)

    const response = NextResponse.redirect(returnTo)
    response.cookies.delete(STATE_COOKIE)
    response.cookies.delete(RETURN_COOKIE)
    return response
  } catch (error) {
    console.error('[google-calendar] callback error:', error)
    return NextResponse.json({ error: 'Falha ao concluir OAuth' }, { status: 500 })
  }
}
