import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'

function isMaskedToken(token: unknown): boolean {
  if (typeof token !== 'string') return false
  const t = token.trim()
  return t === '' || t === '***configured***' || t === '••••••••••'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const phoneNumberIdInput = (body as any)?.phoneNumberId as string | undefined
    const businessAccountIdInput = (body as any)?.businessAccountId as string | undefined
    const accessTokenInput = (body as any)?.accessToken as string | undefined

    // Se o frontend não tem token (ex: já conectado e mascarado), usamos credenciais salvas.
    let phoneNumberId = (phoneNumberIdInput || '').trim()
    let businessAccountId = (businessAccountIdInput || '').trim()
    let accessToken = (accessTokenInput || '').trim()

    const shouldUseStoredCreds = !phoneNumberId || isMaskedToken(accessToken)

    if (shouldUseStoredCreds) {
      const creds = await getWhatsAppCredentials()
      if (!creds) {
        return NextResponse.json(
          { ok: false, error: 'Credenciais do WhatsApp não configuradas' },
          { status: 400 }
        )
      }
      phoneNumberId = creds.phoneNumberId
      businessAccountId = creds.businessAccountId
      accessToken = creds.accessToken
    }

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Preencha Phone Number ID e Access Token para testar.' },
        { status: 400 }
      )
    }

    // Teste real na Graph API: puxa alguns campos leves e confirma autorização.
    const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating,whatsapp_business_account`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const message = (data as any)?.error?.message || 'Meta API rejeitou as credenciais'
      const code = (data as any)?.error?.code
      const errorSubcode = (data as any)?.error?.error_subcode

      return NextResponse.json(
        {
          ok: false,
          error: message,
          code,
          errorSubcode,
        },
        { status: 401 }
      )
    }

    const wabaFromPhone = (data as any)?.whatsapp_business_account?.id as string | undefined

    // Se o usuário informou WABA/BusinessAccountId e a Meta retornou o WABA do Phone,
    // conferimos se bate (isso pega o erro clássico de IDs trocados).
    const businessIdProvided = (businessAccountIdInput || '').trim()
    if (businessIdProvided && wabaFromPhone && businessIdProvided !== wabaFromPhone) {
      return NextResponse.json(
        {
          ok: false,
          error: 'O Phone Number ID não pertence ao WABA informado.',
          details: {
            providedBusinessAccountId: businessIdProvided,
            wabaFromPhone,
          },
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        ok: true,
        phoneNumberId,
        businessAccountId: businessAccountId || wabaFromPhone || null,
        displayPhoneNumber: (data as any)?.display_phone_number || null,
        verifiedName: (data as any)?.verified_name || null,
        qualityRating: (data as any)?.quality_rating || null,
        wabaId: wabaFromPhone || null,
        usedStoredCredentials: shouldUseStoredCreds,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro inesperado ao testar conexão',
      },
      { status: 500 }
    )
  }
}
