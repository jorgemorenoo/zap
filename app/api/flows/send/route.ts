import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { buildFlowMessage } from '@/lib/whatsapp/flows'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const toRaw = String(body?.to || '')
    const flowId = String(body?.flowId || '')
    const flowToken = String(body?.flowToken || '')
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/1294d6ce-76f2-430d-96ab-3ae4d7527327',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1',location:'app/api/flows/send/route.ts:18',message:'flow send request received',data:{hasTo:Boolean(toRaw.trim()),flowIdLength:flowId.length,flowTokenLength:flowToken.length,action:body?.action ?? 'navigate',flowMessageVersion:body?.flowMessageVersion ?? '3',hasActionPayload:typeof body?.actionPayload === 'object' && body.actionPayload !== null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    const to = normalizePhoneNumber(toRaw)

    if (!to || !flowId || !flowToken) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: to, flowId, flowToken' },
        { status: 400 }
      )
    }

    const credentials = await getWhatsAppCredentials()
    if (!credentials?.accessToken || !credentials?.phoneNumberId) {
      return NextResponse.json(
        { error: 'Credenciais do WhatsApp não configuradas' },
        { status: 400 }
      )
    }

    const payload = buildFlowMessage({
      to,
      body: String(body?.body || 'Vamos começar?'),
      flowId,
      flowToken,
      ctaText: body?.ctaText ? String(body.ctaText) : 'Abrir',
      action: body?.action === 'data_exchange' ? 'data_exchange' : 'navigate',
      actionPayload: body?.actionPayload && typeof body.actionPayload === 'object' ? body.actionPayload : undefined,
      footer: body?.footer ? String(body.footer) : undefined,
      flowMessageVersion: body?.flowMessageVersion ? String(body.flowMessageVersion) : '3',
    })
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/1294d6ce-76f2-430d-96ab-3ae4d7527327',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2',location:'app/api/flows/send/route.ts:48',message:'flow payload built',data:{flowIdPresent:Boolean(flowId),flowTokenPresent:Boolean(flowToken),flowAction:payload.interactive.action.parameters.flow_action,hasActionPayload:Boolean(payload.interactive.action.parameters.flow_action_payload),hasFooter:Boolean(payload.interactive.footer),flowMessageVersion:payload.interactive.action.parameters.flow_message_version},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${credentials.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeoutMs: 8000,
      }
    )

    const data = await safeJson<any>(response)
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/1294d6ce-76f2-430d-96ab-3ae4d7527327',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3',location:'app/api/flows/send/route.ts:69',message:'flow send response',data:{ok:response.ok,status:response.status,hasError:!response.ok,metaErrorCode:((data as any)?.error?.code ?? null),metaErrorSubcode:((data as any)?.error?.error_subcode ?? null)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Falha ao enviar Flow', details: data },
        { status: response.status }
      )
    }

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Failed to send flow:', error)
    return NextResponse.json({ error: 'Falha ao enviar Flow' }, { status: 500 })
  }
}
