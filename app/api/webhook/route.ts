import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const dynamic = 'force-dynamic' // Prevent caching of verification requests
export const runtime = 'nodejs'
import { getSupabaseAdmin, supabase } from '@/lib/supabase'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { upsertPhoneSuppression } from '@/lib/phone-suppressions'
import { maybeAutoSuppressByFailure } from '@/lib/auto-suppression'
import {
  mapWhatsAppError,
  isCriticalError,
  isOptOutError,
  getUserFriendlyMessageForMetaError,
  getRecommendedActionForMetaError,
  normalizeMetaErrorTextForStorage
} from '@/lib/whatsapp-errors'

import { emitWorkflowTrace, maskPhone } from '@/lib/workflow-trace'
import {
  applyStatusUpdateToCampaignContact,
  enqueueWebhookStatusReconcileBestEffort,
  markEventAttempt,
  normalizeMetaStatus,
  recordStatusEvent,
  tryParseWebhookTimestampSeconds,
} from '@/lib/whatsapp-status-events'

import { shouldProcessWhatsAppStatusEvent } from '@/lib/whatsapp-webhook-dedupe'


import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { applyFlowMappingToContact } from '@/lib/flow-mapping'
import { settingsDb } from '@/lib/supabase-db'
import { ensureWorkflowRecord, getCompanyId } from '@/lib/builder/workflow-db'
import { getPendingConversation } from '@/lib/builder/workflow-conversations'

// Get WhatsApp Access Token from centralized helper
async function getWhatsAppAccessToken(): Promise<string | null> {
  const credentials = await getWhatsAppCredentials()
  return credentials?.accessToken || null
}

// Get or generate webhook verify token (Supabase settings preferred, env var fallback)
import { getVerifyToken } from '@/lib/verify-token'

function verifyMetaWebhookSignature(input: { request: NextRequest; rawBody: string }): boolean {
  const appSecret = String(process.env.META_APP_SECRET || '').trim()
  // Compatibility mode: if not configured, do not block (but once configured, enforce).
  if (!appSecret) return true

  const header =
    input.request.headers.get('x-hub-signature-256') ||
    input.request.headers.get('X-Hub-Signature-256') ||
    ''

  if (!header.startsWith('sha256=')) return false

  const expected = `sha256=${createHmac('sha256', appSecret).update(input.rawBody, 'utf8').digest('hex')}`
  try {
    const a = Buffer.from(header)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function extractInboundText(message: any): string {
  // Meta pode enviar diferentes tipos de payload: text/button/interactive
  const textBody = message?.text?.body
  if (typeof textBody === 'string' && textBody.trim()) return textBody

  const buttonText = message?.button?.text
  if (typeof buttonText === 'string' && buttonText.trim()) return buttonText

  const interactiveButtonTitle = message?.interactive?.button_reply?.title
  if (typeof interactiveButtonTitle === 'string' && interactiveButtonTitle.trim()) return interactiveButtonTitle

  const interactiveListTitle = message?.interactive?.list_reply?.title
  if (typeof interactiveListTitle === 'string' && interactiveListTitle.trim()) return interactiveListTitle

  return ''
}

function isOptOutKeyword(textRaw: string): boolean {
  const t = String(textRaw || '')
    .trim()
    .toLowerCase()
    // normaliza acentos comuns para facilitar matching
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

  if (!t) return false

  // Palavras-chave comuns (PT-BR + EN) — agressivo por requisito.
  const keywords = [
    'parar',
    'pare',
    'stop',
    'cancelar',
    'cancele',
    'sair',
    'remover',
    'remove',
    'descadastrar',
    'desinscrever',
    'unsubscribe',
    'optout',
    'opt-out',
    'nao quero',
    'não quero',
    'nao receber',
    'não receber',
  ]

  // Match por inclusão para cobrir frases (ex.: "por favor parar")
  return keywords.some((k) => t.includes(k))
}

async function markContactOptOutAndSuppress(input: {
  phoneRaw: string
  source: string
  reason: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const phone = normalizePhoneNumber(input.phoneRaw)
  const now = new Date().toISOString()

  // Best-effort: atualiza contatos (se existir)
  try {
    await supabase
      .from('contacts')
      .update({ status: 'Opt-out', updated_at: now })
      .eq('phone', phone)
  } catch (e) {
    console.warn('[Webhook] Falha ao atualizar contacts.status para Opt-out (best-effort):', e)
  }

  // Fonte da verdade para supressão global
  try {
    await upsertPhoneSuppression({
      phone,
      reason: input.reason,
      source: input.source,
      metadata: input.metadata || {},
      isActive: true,
      expiresAt: null,
    })
  } catch (e) {
    console.warn('[Webhook] Falha ao upsert phone_suppressions (best-effort):', e)
  }
}

function maskTokenPreview(token: string | null | undefined): string {
  if (!token) return '—'
  const t = String(token)
  if (t.length <= 8) return `${t.slice(0, 2)}…(${t.length})`
  return `${t.slice(0, 3)}…${t.slice(-3)}(${t.length})`
}

function safeParseJson(raw: unknown): unknown | null {
  if (raw == null) return null
  if (typeof raw === 'object') return raw as any
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function normalizeInboundText(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

type KeywordWorkflow = {
  workflowId: string
  keywords: string[]
}

async function loadKeywordWorkflows(
  excludeWorkflowId: string | null
): Promise<KeywordWorkflow[]> {
  const { data } = await supabase
    .from('workflow_versions')
    .select('workflow_id, nodes, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  return (data || [])
    .filter((version: any) => version?.workflow_id && version?.nodes)
    .filter((version: any) => version.workflow_id !== excludeWorkflowId)
    .map((version: any) => {
      const triggerNode = (version.nodes as any[]).find(
        (node) => node?.data?.type === 'trigger'
      )
      const triggerType = triggerNode?.data?.config?.triggerType
      if (triggerType !== 'Keywords') return null
      const keywordListRaw = triggerNode?.data?.config?.keywordList as string | undefined
      const keywords = (keywordListRaw || '')
        .split(/\r?\n/)
        .map((entry) => normalizeInboundText(entry))
        .filter(Boolean)
      if (!version.workflow_id || keywords.length === 0) return null
      return {
        workflowId: version.workflow_id,
        keywords,
      }
    })
    .filter((entry): entry is KeywordWorkflow => Boolean(entry))
}

function findMatchingWorkflow(
  workflows: KeywordWorkflow[],
  message: string
): string | null {
  const normalizedMessage = normalizeInboundText(message)
  if (!normalizedMessage) return null
  for (const workflow of workflows) {
    if (workflow.keywords.some((keyword) => keyword === normalizedMessage)) {
      return workflow.workflowId
    }
  }
  return null
}

function isMissingColumnError(e: unknown, columnName: string): boolean {
  const msg = e instanceof Error ? e.message : String((e as any)?.message || e || '')
  return msg.toLowerCase().includes('column') && msg.toLowerCase().includes(columnName.toLowerCase())
}

function extractCampaignIdFromFlowToken(flowToken: string | null): string | null {
  if (!flowToken) return null
  const match = flowToken.match(/:c:([A-Za-z0-9_-]+)/)
  if (!match) return null
  const value = match[1]?.trim()
  return value ? value : null
}

function isMissingTableError(e: unknown, tableName: string): boolean {
  const code = String((e as any)?.code || '')
  const msg = String((e as any)?.message || (e instanceof Error ? e.message : e || ''))
  const m = msg.toLowerCase()
  const t = tableName.toLowerCase()

  // Postgres undefined_table
  if (code === '42P01') return true

  // PostgREST / Supabase cache errors often include the table name.
  if (m.includes('does not exist') && m.includes(t)) return true
  if (m.includes('relation') && m.includes(t)) return true
  if (m.includes('schema cache') && m.includes(t)) return true

  return false
}

// Meta Webhook Verification
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const MY_VERIFY_TOKEN = await getVerifyToken({ readonly: true })

  console.log('🔍 Webhook Verification Request:')
  console.log(`- Mode: ${mode}`)
  console.log(`- Received Token: ${maskTokenPreview(token)}`)
  console.log(`- Expected Token: ${maskTokenPreview(MY_VERIFY_TOKEN)}`)

  if (MY_VERIFY_TOKEN === 'token-not-found-readonly') {
    console.warn(
      '⚠️ Webhook verify token ausente em modo readonly. Configure em settings (webhook_verify_token) ou via env WEBHOOK_VERIFY_TOKEN.'
    )
  }

  if (mode === 'subscribe' && token === MY_VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully')
    return new Response(challenge || '', { status: 200 })
  }

  console.log('❌ Webhook verification failed')
  return new Response('Forbidden', { status: 403 })
}

// Webhook Event Receiver
// Supabase: fonte da verdade para status de mensagens
export async function POST(request: NextRequest) {
  const rawBody = await request.text().catch(() => '')
  if (!rawBody) {
    return NextResponse.json({ status: 'ignored', error: 'Body inválido' }, { status: 400 })
  }

  if (!verifyMetaWebhookSignature({ request, rawBody })) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 })
  }

  const body = (() => {
    try {
      return JSON.parse(rawBody)
    } catch {
      return null
    }
  })()
  if (!body) {
    return NextResponse.json({ status: 'ignored', error: 'Body inválido' }, { status: 400 })
  }
  const supabaseAdmin = getSupabaseAdmin()
  if (!supabaseAdmin) {
    return NextResponse.json({ status: 'error', error: 'Supabase not configured' }, { status: 500 })
  }

  if (body.object !== 'whatsapp_business_account') {
    return NextResponse.json({ status: 'ignored' })
  }

  // Evita logs gigantes: guardamos payload estruturado em DB (whatsapp_status_events)
  // e fazemos logs de alto nível aqui.
  console.log('📨 Webhook received:', JSON.stringify({
    object: body?.object,
    entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
  }))

  const defaultWorkflowId =
    (await settingsDb.get('workflow_builder_default_id')) ||
    process.env.WORKFLOW_BUILDER_DEFAULT_ID ||
    null
  const keywordWorkflows = await loadKeywordWorkflows(defaultWorkflowId)

  try {
    const entries = body.entry || []

    for (const entry of entries) {
      const changes = entry.changes || []

      for (const change of changes) {
        // =========================================================
        // Template Status Updates (Meta)
        // =========================================================
        const rawTemplateUpdates =
          change.value?.message_template_status_update ??
          change.value?.message_template_status_updates ??
          []

        const templateUpdates = Array.isArray(rawTemplateUpdates)
          ? rawTemplateUpdates
          : rawTemplateUpdates
            ? [rawTemplateUpdates]
            : []

        for (const tu of templateUpdates) {
          const templateId = (tu?.message_template_id || tu?.id || null) as string | null
          const templateName = (tu?.message_template_name || tu?.name || null) as string | null
          const eventRaw = (tu?.event || tu?.status || tu?.message_template_status || tu?.template_status || '') as string
          const reason = (tu?.reason || tu?.rejected_reason || tu?.reason_text || tu?.details || '') as string

          const event = String(eventRaw || '').toUpperCase()
          if (!templateId && !templateName) continue

          // Normaliza para os status mais comuns da Meta
          let newStatus = event
          if (!newStatus) newStatus = 'PENDING'
          if (newStatus === 'DISABLED') newStatus = 'REJECTED'

          try {
            // Tenta atualizar por meta_id primeiro (mais confiável)
            let updated = false
            if (templateId) {
              const { data, error } = await supabase
                .from('templates')
                .update({
                  status: newStatus,
                  meta_id: templateId,
                  rejected_reason: newStatus === 'REJECTED' && reason ? reason : null,
                  updated_at: new Date().toISOString(),
                })
                .eq('meta_id', templateId)
                .select('id')

              if (error) throw error
              updated = !!(data && data.length > 0)
            }

            // Fallback: atualizar por nome
            if (!updated && templateName) {
              const { data, error } = await supabase
                .from('templates')
                .update({
                  status: newStatus,
                  ...(templateId ? { meta_id: templateId } : {}),
                  rejected_reason: newStatus === 'REJECTED' && reason ? reason : null,
                  updated_at: new Date().toISOString(),
                })
                .eq('name', templateName)
                .select('id')

              if (error) throw error
              updated = !!(data && data.length > 0)
            }

            console.log(`🧩 Template status update: ${templateName || templateId} -> ${newStatus}${reason ? ` (${reason})` : ''}`)
          } catch (e) {
            console.error('Failed to process template status update:', e)
          }
        }

        const statuses = change.value?.statuses || []

        // =========================================================
        // Message Status Updates (durável + idempotente)
        // - 1) Persistimos o evento em whatsapp_status_events (nunca perde)
        // - 2) Aplicamos no campaign_contacts (idempotente)
        // - 3) Em erro de persistência/aplicação, retornamos 500 para forçar retry
        // =========================================================
        for (const statusUpdate of statuses) {
          const messageId = String(statusUpdate?.id || '').trim()
          const status = normalizeMetaStatus(statusUpdate?.status)
          if (!messageId || !status) continue

          // 80/20: dedupe antes de tocar no Postgres (reduz custo em retries/duplicatas)
          const shouldProcess = await shouldProcessWhatsAppStatusEvent({ messageId, status })
          if (!shouldProcess) continue

          const { iso: eventTsIso, raw: eventTsRaw } = tryParseWebhookTimestampSeconds((statusUpdate as any)?.timestamp)

          // (A) Persistir evento primeiro (durável)
          let eventId: string | null = null
          try {
            const payloadSubset = {
              waba_id: entry?.id || null,
              phone_number_id: change?.value?.metadata?.phone_number_id || null,
            }

            const rec = await recordStatusEvent({
              messageId,
              status,
              eventTsIso,
              eventTsRaw,
              recipientId: (statusUpdate as any)?.recipient_id || null,
              errors: (statusUpdate as any)?.errors ?? null,
              payload: payloadSubset,
            })
            eventId = rec.id
          } catch (e) {
            // Compat: se a migração ainda não foi aplicada em produção,
            // não podemos 500ar para sempre. Seguimos sem “durable inbox” até o banco estar pronto.
            if (isMissingTableError(e, 'whatsapp_status_events')) {
              console.warn('[Webhook] Tabela whatsapp_status_events ausente — seguindo sem persistência (compat):', e)
              eventId = null
            } else {
              console.error('[Webhook] Falha ao persistir whatsapp_status_events:', e)
              return NextResponse.json(
                { status: 'error', error: 'Falha ao persistir evento do webhook (retry)' },
                { status: 500 }
              )
            }
          }

          // (B) Aplicar no banco (fonte da verdade)
          try {
            if (status === 'failed') {
              // Mantemos o tratamento rico existente (alerts/supressão/opt-out)
              // para não regredir features.

              const { data: rows, error: lookupErr } = await supabase
                .from('campaign_contacts')
                .select('id, status, campaign_id, phone, trace_id, delivered_at')
                .eq('message_id', messageId)
                .limit(1)

              if (lookupErr) throw lookupErr
              const existingUpdate = Array.isArray(rows) ? rows[0] : (rows as any)
              if (!existingUpdate) {
                if (eventId) {
                  await markEventAttempt({ eventId, state: 'unmatched', error: 'campaign_contact_not_found' })
                  await enqueueWebhookStatusReconcileBestEffort('unmatched_failed')
                }
                continue
              }

              const campaignId = existingUpdate.campaign_id
              const phone = existingUpdate.phone
              const traceId = (existingUpdate as any).trace_id as string | null
              const phoneMasked = maskPhone(phone)

              const errors = (statusUpdate as any)?.errors
              const metaError = errors?.[0] || null
              const errorCode = metaError?.code || 0
              const errorTitle = metaError?.title || 'Unknown error'
              const metaMessage = metaError?.message || ''
              const metaDetails = metaError?.error_data?.details || ''
              const errorDetails = metaDetails || metaMessage
              const errorHref = metaError?.href || ''

              const mappedError = mapWhatsAppError(errorCode)
              const failureReason = getUserFriendlyMessageForMetaError({
                code: errorCode,
                title: errorTitle,
                message: metaMessage,
                details: metaDetails,
              })
              const recommendedAction = getRecommendedActionForMetaError({
                code: errorCode,
                title: errorTitle,
                message: metaMessage,
                details: metaDetails,
              })

              console.log(
                `❌ Failed: ${phoneMasked || phone} - [${errorCode}] ${errorTitle} (campaign: ${campaignId})${traceId ? ` (traceId: ${traceId})` : ''}`
              )
              console.log(`   Category: ${mappedError.category}, Retryable: ${mappedError.retryable}`)

              if (traceId) {
                await emitWorkflowTrace({
                  traceId,
                  campaignId,
                  step: 'webhook',
                  phase: 'webhook_failed_details',
                  ok: false,
                  phoneMasked,
                  extra: {
                    messageId,
                    errorCode,
                    errorTitle,
                    errorDetails,
                    category: mappedError.category,
                    retryable: mappedError.retryable,
                  },
                })
              }

              const nowFailed = eventTsIso || new Date().toISOString()

              const { data: updatedRowsFailed, error: updateErrorFailed } = await supabase
                .from('campaign_contacts')
                .update({
                  status: 'failed',
                  failed_at: nowFailed,
                  failure_code: errorCode,
                  failure_reason: failureReason,
                  failure_title: normalizeMetaErrorTextForStorage(errorTitle, 200),
                  failure_details: normalizeMetaErrorTextForStorage(errorDetails, 800),
                  failure_href: normalizeMetaErrorTextForStorage(errorHref, 400),
                })
                .eq('message_id', messageId)
                .neq('status', 'failed')
                .select('id')

              if (updateErrorFailed) throw updateErrorFailed

              if (updatedRowsFailed && updatedRowsFailed.length > 0) {
                const { error: rpcError } = await supabase.rpc('increment_campaign_stat', {
                  campaign_id_input: campaignId,
                  field: 'failed',
                })

                if (rpcError) console.error('Failed to increment failed count:', rpcError)

                if (isCriticalError(errorCode)) {
                  await supabase.from('account_alerts').upsert({
                    id: `alert_${errorCode}_${Date.now()}`,
                    type: mappedError.category,
                    code: errorCode,
                    message: failureReason,
                    details: JSON.stringify({ title: errorTitle, details: errorDetails, action: recommendedAction }),
                    created_at: nowFailed,
                  })
                }

                if (isOptOutError(errorCode)) {
                  await markContactOptOutAndSuppress({
                    phoneRaw: phone,
                    source: 'meta_opt_out_error',
                    reason: failureReason || `Opt-out detectado pela Meta (código ${errorCode})`,
                    metadata: {
                      messageId,
                      errorCode,
                      errorTitle,
                      errorDetails,
                    },
                  })
                }

                try {
                  await maybeAutoSuppressByFailure({
                    phone,
                    failureCode: errorCode,
                    failureTitle: errorTitle,
                    failureDetails: errorDetails,
                    failureHref: errorHref,
                    campaignId,
                    campaignContactId: existingUpdate.id,
                    messageId,
                  })
                } catch (e) {
                  console.warn('[Webhook] Falha ao aplicar auto-supressão (best-effort):', e)
                }
              }

              if (eventId) {
                await markEventAttempt({ eventId, state: 'applied', campaignId, campaignContactId: existingUpdate.id })
              }
              continue
            }

            const result = await applyStatusUpdateToCampaignContact({
              messageId,
              status,
              eventTsIso,
              errors: (statusUpdate as any)?.errors ?? null,
            })

            // Trace "positivo" (delivered/read) para fechar o loop na timeline do run.
            // Observação: para status='failed' existe um caminho rico separado acima.
            if (result.reason === 'applied' && result.traceId && (status === 'delivered' || status === 'read')) {
              await emitWorkflowTrace({
                traceId: String(result.traceId),
                campaignId: result.campaignId,
                step: 'webhook',
                phase: status === 'delivered' ? 'webhook_delivered_applied' : 'webhook_read_applied',
                ok: true,
                phoneMasked: result.phone ? maskPhone(result.phone) : undefined,
                extra: {
                  messageId,
                  status,
                  eventTsIso: eventTsIso || null,
                },
              })
            }

            if (eventId) {
              if (result.reason === 'applied') {
                await markEventAttempt({
                  eventId,
                  state: 'applied',
                  campaignId: result.campaignId || null,
                  campaignContactId: result.campaignContactId || null,
                })
              } else if (result.reason === 'unmatched') {
                await markEventAttempt({ eventId, state: 'unmatched', error: 'campaign_contact_not_found' })
                await enqueueWebhookStatusReconcileBestEffort('unmatched_status')
              } else {
                await markEventAttempt({
                  eventId,
                  state: 'pending',
                  campaignId: result.campaignId || null,
                  campaignContactId: result.campaignContactId || null,
                })
              }
            }
          } catch (e) {
            console.error('[Webhook] Falha ao aplicar status no DB:', e)
            if (eventId) {
              await markEventAttempt({ eventId, state: 'error', error: e instanceof Error ? e.message : String(e) })
              await enqueueWebhookStatusReconcileBestEffort('apply_error')
            }
            return NextResponse.json(
              { status: 'error', error: e instanceof Error ? e.message : String(e) },
              { status: 500 }
            )
          }
        }

        // =====================================================================
        // Process incoming messages (Chatbot Engine Disabled in Template)
        // =====================================================================
        const messages = change.value?.messages || []
        for (const message of messages) {
          const from = message.from
          const messageType = message.type
          const text = extractInboundText(message)
          console.log(`📩 Incoming message from ${from}: ${messageType} (Chatbot disabled)${text ? ` | text="${text}"` : ''}`)

          // =================================================================
          // Workflow Builder (MVP): resume pending conversation if any
          // =================================================================
          const normalizedFrom = normalizePhoneNumber(from)
          if (normalizedFrom && text) {
            const pendingConversation = await getPendingConversation(
              supabaseAdmin,
              normalizedFrom
            )
            if (pendingConversation) {
              try {
                const origin = request.nextUrl.origin
                await fetch(
                  `${origin}/api/builder/workflow/${pendingConversation.workflow_id}/resume`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      workflowId: pendingConversation.workflow_id,
                      conversationId: pendingConversation.id,
                      input: { from: normalizedFrom, to: normalizedFrom, message: text },
                    }),
                  }
                )
                continue
              } catch (e) {
                console.error('[Webhook] Failed to resume conversation:', e)
              }
            }
          }

          // =================================================================
          // Workflow Builder (MVP): run keyword/default workflow
          // =================================================================
          const matchedWorkflowId = findMatchingWorkflow(keywordWorkflows, text)
          const targetWorkflowId = matchedWorkflowId || defaultWorkflowId

          if (targetWorkflowId && text && from) {
            try {
              const companyId = await getCompanyId(supabaseAdmin)
              await ensureWorkflowRecord(supabaseAdmin, targetWorkflowId, companyId)

              const origin = request.nextUrl.origin
              await fetch(`${origin}/api/builder/workflow/${targetWorkflowId}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  workflowId: targetWorkflowId,
                  input: { from, to: from, message: text },
                }),
              })
            } catch (e) {
              console.error('[Webhook] Failed to trigger builder workflow:', e)
            }
          }

          // =================================================================
          // WhatsApp Flows (MVP sem endpoint): captura submissão final
          // interactive.type = 'nfm_reply' com response_json
          // =================================================================
          try {
            const interactiveType = message?.interactive?.type
            const nfm = message?.interactive?.nfm_reply

            if (messageType === 'interactive' && interactiveType === 'nfm_reply' && nfm?.response_json) {
              const messageId = (message?.id || '') as string
              const phoneNumberId = (change?.value?.metadata?.phone_number_id || null) as string | null
              const wabaId = (entry?.id || null) as string | null

              const normalizedFrom = normalizePhoneNumber(from)

              // Best-effort: resolve contact_id
              let contactId: string | null = null
              try {
                const { data: contacts } = await supabase
                  .from('contacts')
                  .select('id')
                  .eq('phone', normalizedFrom)
                  .limit(1)

                contactId = contacts?.[0]?.id ?? null
              } catch {
                // ignore (best-effort)
              }

              const responseRaw = typeof nfm.response_json === 'string' ? nfm.response_json : JSON.stringify(nfm.response_json)
              const responseJson = safeParseJson(nfm.response_json)
              const messageTimestamp = tryParseWebhookTimestampSeconds(message?.timestamp).iso

              const flowId = (nfm?.flow_id || nfm?.flowId || null) as string | null
              const flowName = (nfm?.name || null) as string | null
              const flowToken = (nfm?.flow_token || nfm?.flowToken || null) as string | null
              const campaignId = extractCampaignIdFromFlowToken(flowToken)

              // Best-effort: mapping para campos do SmartZap
              let flowLocalId: string | null = null
              let mappedData: Record<string, unknown> | null = null
              let mappedAt: string | null = null

              if (flowId && responseJson && typeof responseJson === 'object') {
                try {
                  const { data: flowRows } = await supabase
                    .from('flows')
                    .select('id,mapping')
                    .eq('meta_flow_id', flowId)
                    .limit(1)

                  const flowRow = Array.isArray(flowRows) ? flowRows[0] : (flowRows as any)
                  if (flowRow?.id && flowRow?.mapping) {
                    flowLocalId = String(flowRow.id)
                    const applied = await applyFlowMappingToContact({
                      normalizedPhone: normalizedFrom,
                      flowId,
                      responseJson,
                      mapping: flowRow.mapping,
                    })
                    if (applied.updated) {
                      mappedData = applied.mappedData
                      mappedAt = new Date().toISOString()
                    }
                  }
                } catch (e) {
                  console.warn('[Webhook] Falha ao aplicar mapping do Flow (best-effort):', e)
                }
              }

              if (messageId) {
                // Primeira tentativa: com campos novos (flow_local_id/mapped_data)
                let upsertError: any = null
                try {
                  const { error } = await supabase
                    .from('flow_submissions')
                    .upsert(
                      {
                        message_id: messageId,
                        from_phone: normalizedFrom,
                        contact_id: contactId,
                        flow_id: flowId,
                        flow_name: flowName,
                        flow_token: flowToken,
                        ...(campaignId ? { campaign_id: campaignId } : {}),
                        response_json_raw: responseRaw,
                        response_json: responseJson,
                        waba_id: wabaId,
                        phone_number_id: phoneNumberId,
                        message_timestamp: messageTimestamp,
                        ...(flowLocalId ? { flow_local_id: flowLocalId } : {}),
                        ...(mappedData ? { mapped_data: mappedData } : {}),
                        ...(mappedAt ? { mapped_at: mappedAt } : {}),
                      },
                      { onConflict: 'message_id' }
                    )
                  upsertError = error
                } catch (e) {
                  upsertError = e
                }

                // Fallback: bancos sem migração ainda (evita 500 e mantém captura)
                if (
                  upsertError &&
                  (isMissingColumnError(upsertError, 'flow_local_id') ||
                    isMissingColumnError(upsertError, 'mapped_data') ||
                    isMissingColumnError(upsertError, 'campaign_id'))
                ) {
                  try {
                    const { error } = await supabase
                      .from('flow_submissions')
                      .upsert(
                        {
                          message_id: messageId,
                          from_phone: normalizedFrom,
                          contact_id: contactId,
                          flow_id: flowId,
                          flow_name: flowName,
                          flow_token: flowToken,
                          response_json_raw: responseRaw,
                          response_json: responseJson,
                          waba_id: wabaId,
                          phone_number_id: phoneNumberId,
                          message_timestamp: messageTimestamp,
                        },
                        { onConflict: 'message_id' }
                      )
                    upsertError = error
                  } catch (e) {
                    upsertError = e
                  }
                }

                if (upsertError) {
                  console.warn('[Webhook] Falha ao persistir flow_submissions:', upsertError)
                } else {
                  console.log(`🧾 Flow submission salva (message_id=${messageId}, from=${maskPhone(normalizedFrom)})`)
                }
              }
            }
          } catch (e) {
            console.warn('[Webhook] Falha ao processar Flow submission (best-effort):', e)
          }

          // Opt-out real: usuário envia palavra-chave
          if (text && isOptOutKeyword(text)) {
            console.log(`📵 Opt-out keyword detected from ${from}: "${text}"`)
            await markContactOptOutAndSuppress({
              phoneRaw: from,
              source: 'inbound_keyword',
              reason: 'Usuário solicitou opt-out via mensagem inbound',
              metadata: {
                messageType,
                text,
                messageId: message?.id || null,
                timestamp: message?.timestamp || null,
              },
            })
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing webhook:', error)
  }

  // Always return 200 to acknowledge receipt (Meta requirement)
  return NextResponse.json({ status: 'ok' })
}
