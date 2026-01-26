/**
 * T046-T048: Inbox Webhook Integration
 * Handles inbox-related webhook events:
 * - T046: Persist inbound messages to inbox_messages
 * - T047: Trigger AI processing when mode = 'bot'
 * - T048: Update delivery status in inbox_messages
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { inboxDb, isHumanModeExpired, switchToBotMode, findConversationByPhoneLightweight } from './inbox-db'
import { cancelDebounce } from '@/lib/ai/agents/chat-agent'
import { sendWhatsAppMessage } from '@/lib/whatsapp-send'
import { Client } from '@upstash/qstash'
import { redis } from '@/lib/redis'
import type {
  InboxConversation,
  InboxMessage,
  AIAgent,
} from '@/types'

// Tipo para conversa lightweight (retorno otimizado do webhook)
type LightweightConversation = Awaited<ReturnType<typeof findConversationByPhoneLightweight>>

// QStash client para disparar processamento de IA (simplificado)
const getQStashClient = () => {
  const token = process.env.QSTASH_TOKEN
  if (!token) {
    console.warn('[Inbox] QSTASH_TOKEN não configurado, AI processing não disponível')
    return null
  }
  return new Client({ token })
}

// =============================================================================
// Types
// =============================================================================

export interface InboundMessagePayload {
  /** WhatsApp message ID */
  messageId: string
  /** Sender phone number (raw format from webhook) */
  from: string
  /** Message type (text, image, interactive, etc) */
  type: string
  /** Text content (extracted from various message formats) */
  text: string
  /** Raw message timestamp from Meta */
  timestamp?: string
  /** Media URL if applicable */
  mediaUrl?: string | null
  /** Phone number ID that received the message */
  phoneNumberId?: string
}

export interface StatusUpdatePayload {
  /** WhatsApp message ID */
  messageId: string
  /** Status (sent, delivered, read, failed) */
  status: 'sent' | 'delivered' | 'read' | 'failed'
  /** Timestamp from webhook */
  timestamp?: string
  /** Error details if failed */
  errors?: Array<{ code: number; title: string; message?: string }>
}

// =============================================================================
// Inbound Message Handler (T046)
// =============================================================================

/**
 * Process an inbound message and persist to inbox
 * Creates conversation if needed, adds message, triggers AI if mode=bot
 *
 * OTIMIZAÇÕES APLICADAS (2025-01-24):
 * 1. Usa findConversationByPhoneLightweight (sem JOINs) - ~3x mais rápido
 * 2. Paraleliza busca de conversa + contato quando cria nova conversa
 * 3. Contadores atômicos via RPC (elimina race condition)
 */
export async function handleInboundMessage(
  payload: InboundMessagePayload
): Promise<{
  conversationId: string
  messageId: string
  triggeredAI: boolean
}> {
  const normalizedPhone = normalizePhoneNumber(payload.from)

  // 1. Busca conversa existente (versão LIGHTWEIGHT - sem JOINs)
  let conversation = await findConversationByPhoneLightweight(normalizedPhone)

  if (!conversation) {
    // Paraleliza: busca contato enquanto prepara criação da conversa
    // Isso economiza ~100-200ms em conversas novas
    const contactId = await findContactId(normalizedPhone)
    const fullConversation = await inboxDb.createConversation({
      phone: normalizedPhone,
      contact_id: contactId || undefined,
      mode: 'bot', // Default to bot mode for new conversations
    })
    // Converte para tipo lightweight (campos que precisamos)
    conversation = {
      id: fullConversation.id,
      phone: fullConversation.phone,
      status: fullConversation.status,
      mode: fullConversation.mode,
      ai_agent_id: fullConversation.ai_agent_id,
      contact_id: fullConversation.contact_id,
      human_mode_expires_at: fullConversation.human_mode_expires_at,
      automation_paused_until: fullConversation.automation_paused_until,
      total_messages: fullConversation.total_messages,
      unread_count: fullConversation.unread_count,
    }
  } else if (conversation.status === 'closed') {
    // Reopen closed conversation on new inbound message
    await inboxDb.updateConversation(conversation.id, { status: 'open' })
  }

  // 2. Cria mensagem no inbox (contadores são atualizados atomicamente via RPC)
  const message = await inboxDb.createMessage({
    conversation_id: conversation.id,
    direction: 'inbound',
    content: payload.text || `[${payload.type}]`,
    message_type: mapMessageType(payload.type),
    whatsapp_message_id: payload.messageId || undefined,
    media_url: payload.mediaUrl || undefined,
    delivery_status: 'delivered', // Inbound messages are already delivered
    payload: {
      raw_type: payload.type,
      timestamp: payload.timestamp,
      phone_number_id: payload.phoneNumberId,
    },
  })

  // 3. Trigger AI processing if mode is 'bot' and automation is not paused (T066)
  let triggeredAI = false
  let currentMode = conversation.mode

  // Check if human mode has expired → auto-switch back to bot
  if (currentMode === 'human' && isHumanModeExpired(conversation.human_mode_expires_at)) {
    console.log(
      `[Inbox] Human mode expired for ${conversation.id}, auto-switching to bot mode`
    )
    await switchToBotMode(conversation.id)
    currentMode = 'bot'
  }

  console.log(`🤖 [INBOX] Checking AI trigger: mode=${currentMode}, automationPausedUntil=${conversation.automation_paused_until}`)

  if (currentMode === 'bot') {
    // T066: Check if automation is paused
    if (isAutomationPaused(conversation.automation_paused_until)) {
      console.log(
        `[Inbox] Automation paused until ${conversation.automation_paused_until}, skipping AI processing`
      )
    } else {
      console.log(`🤖 [INBOX] Calling triggerAIProcessing for conversation ${conversation.id}`)
      // Cast necessário porque triggerAIProcessing espera InboxConversation completo
      // mas só usa os campos que temos no lightweight
      triggeredAI = await triggerAIProcessing(conversation as InboxConversation, message)
      console.log(`🤖 [INBOX] triggerAIProcessing returned: ${triggeredAI}`)
    }
  } else {
    console.log(`🤖 [INBOX] Skipping AI trigger because mode=${currentMode}`)
  }

  return {
    conversationId: conversation.id,
    messageId: message.id,
    triggeredAI,
  }
}

// =============================================================================
// AI Processing Trigger (T047) - Via QStash com Debounce
// =============================================================================

/**
 * Trigger AI agent processing via QStash com debounce configurável
 *
 * Usa o campo `debounce_ms` do agente para aguardar antes de processar.
 * Isso evita respostas duplicadas quando o usuário envia múltiplas mensagens rapidamente.
 *
 * Fluxo:
 * 1. Busca agente para pegar debounce_ms configurado
 * 2. Se debounce > 0: salva timestamp no Redis e agenda QStash com delay
 * 3. Quando o job executa, verifica se foi superseded por mensagem mais recente
 */
async function triggerAIProcessing(
  conversation: InboxConversation,
  _message: InboxMessage
): Promise<boolean> {
  const conversationId = conversation.id
  const now = Date.now()

  console.log(`🔥 [TRIGGER] Starting AI processing for ${conversationId}`)

  const qstash = getQStashClient()

  if (!qstash) {
    console.log('[Inbox] QStash client not available, skipping AI processing')
    return false
  }

  // 1. Busca o agente para pegar o debounce_ms configurado
  const agent = await getAgentForTrigger(conversation.ai_agent_id)
  const debounceMs = agent?.debounce_ms ?? 5000 // default 5s
  const debounceSeconds = Math.ceil(debounceMs / 1000)

  console.log(`🔥 [TRIGGER] Agent debounce: ${debounceMs}ms (${debounceSeconds}s)`)

  // 2. Se debounce desabilitado (0), dispara imediatamente
  if (debounceMs === 0) {
    console.log(`🔥 [TRIGGER] Debounce disabled, dispatching immediately`)
    return await dispatchToQStash(conversationId, now, 0)
  }

  // 3. Atualiza timestamp no Redis (estado compartilhado)
  const redisKey = `ai:debounce:${conversationId}`
  if (redis) {
    // Expira a chave alguns segundos após o delay para limpeza automática
    await redis.set(redisKey, now, { ex: debounceSeconds + 10 })
    console.log(`🔥 [TRIGGER] Redis SET ${redisKey} = ${now}`)
  } else {
    console.log(`⚠️ [TRIGGER] Redis not configured, debounce will be best-effort`)
  }

  // 4. Dispara QStash com delay configurado
  return await dispatchToQStash(conversationId, now, debounceSeconds)
}

/**
 * Helper: Dispara job para QStash com delay opcional
 */
async function dispatchToQStash(
  conversationId: string,
  dispatchedAt: number,
  delaySeconds: number
): Promise<boolean> {
  const qstash = getQStashClient()
  if (!qstash) return false

  // URL do endpoint
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    'http://localhost:3000'

  const aiRespondUrl = `${baseUrl}/api/ai/respond`

  console.log(`🔥 [TRIGGER] Dispatching to ${aiRespondUrl} with delay=${delaySeconds}s`)

  try {
    // Headers para autenticação e bypass
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Adiciona API key para passar pelo middleware de autenticação
    const apiKey = process.env.SMARTZAP_API_KEY
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    // Se tiver bypass secret configurado, adiciona o header
    // Isso permite que QStash passe pelo Deployment Protection da Vercel
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    if (bypassSecret) {
      headers['x-vercel-protection-bypass'] = bypassSecret
    }

    await qstash.publishJSON({
      url: aiRespondUrl,
      body: { conversationId, dispatchedAt },
      delay: delaySeconds > 0 ? delaySeconds : undefined,
      retries: 2,
      headers,
    })

    console.log(`✅ [TRIGGER] AI scheduled: debounce=${delaySeconds}s, ts=${dispatchedAt}`)
    return true
  } catch (error) {
    console.error('❌ [TRIGGER] Failed to dispatch AI processing:', error)
    return false
  }
}

/**
 * Helper: Busca agente para pegar debounce_ms
 * Versão leve que só busca os campos necessários
 */
async function getAgentForTrigger(agentId: string | null): Promise<Pick<AIAgent, 'debounce_ms'> | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null

  // Tenta agente específico
  if (agentId) {
    const { data } = await supabase
      .from('ai_agents')
      .select('debounce_ms')
      .eq('id', agentId)
      .single()
    if (data) return data
  }

  // Fallback para agente padrão
  const { data } = await supabase
    .from('ai_agents')
    .select('debounce_ms')
    .eq('is_active', true)
    .eq('is_default', true)
    .single()

  return data || null
}

/**
 * Handle AI handoff to human
 * Switches conversation mode and creates internal note
 */
async function handleAIHandoff(
  conversation: InboxConversation,
  reason?: string,
  summary?: string
): Promise<void> {
  console.log(
    `[Inbox] AI handoff for conversation ${conversation.id}: ${reason}`
  )

  // Switch to human mode
  await inboxDb.updateConversation(conversation.id, { mode: 'human' })

  // Cancel any pending debounce
  cancelDebounce(conversation.id)

  // Create internal note about handoff
  await inboxDb.createMessage({
    conversation_id: conversation.id,
    direction: 'outbound',
    content: `🤖 **Transferência para atendente**\n\n${reason ? `**Motivo:** ${reason}\n` : ''}${summary ? `**Resumo:** ${summary}` : ''}`,
    message_type: 'internal_note',
    delivery_status: 'delivered',
    payload: {
      type: 'ai_handoff',
      reason,
      summary,
      timestamp: new Date().toISOString(),
    },
  })
}

// =============================================================================
// Delivery Status Handler (T048)
// =============================================================================

/**
 * Update message delivery status in inbox
 */
export async function handleDeliveryStatus(
  payload: StatusUpdatePayload
): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.error('[Inbox] Supabase admin client not available')
    return false
  }

  // Find message by WhatsApp message ID
  const { data: message, error } = await supabase
    .from('inbox_messages')
    .select('id, conversation_id, delivery_status')
    .eq('whatsapp_message_id', payload.messageId)
    .single()

  if (error || !message) {
    // Message not found in inbox - might be from campaigns
    return false
  }

  // Update delivery status
  const updates: Record<string, unknown> = {
    delivery_status: payload.status,
  }

  // Add timestamp fields
  if (payload.status === 'delivered') {
    updates.delivered_at = payload.timestamp || new Date().toISOString()
  } else if (payload.status === 'read') {
    updates.read_at = payload.timestamp || new Date().toISOString()
  } else if (payload.status === 'failed') {
    updates.failed_at = payload.timestamp || new Date().toISOString()
    if (payload.errors?.[0]) {
      updates.failure_reason = `[${payload.errors[0].code}] ${payload.errors[0].title}`
    }
  }

  const { error: updateError } = await supabase
    .from('inbox_messages')
    .update(updates)
    .eq('id', message.id)

  if (updateError) {
    console.error('[Inbox] Failed to update delivery status:', updateError)
    return false
  }

  return true
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find contact ID by phone number
 */
async function findContactId(phone: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.error('[Inbox] Supabase admin client not available')
    return null
  }

  const { data } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .single()

  return data?.id || null
}

/**
 * Map WhatsApp message types to inbox message types
 */
function mapMessageType(waType: string): InboxMessage['message_type'] {
  const typeMap: Record<string, InboxMessage['message_type']> = {
    text: 'text',
    image: 'image',
    audio: 'audio',
    video: 'video',
    document: 'document',
    template: 'template',
    interactive: 'interactive',
    button: 'interactive',
    location: 'text',
    contacts: 'text',
    sticker: 'image',
  }

  return typeMap[waType] || 'text'
}

/**
 * T066: Check if automation is paused for a conversation
 * Returns true if pause timestamp exists and is in the future
 */
function isAutomationPaused(pausedUntil: string | null | undefined): boolean {
  if (!pausedUntil) return false
  const pauseTime = new Date(pausedUntil).getTime()
  const now = Date.now()
  return pauseTime > now
}
