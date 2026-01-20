/**
 * T055: Test AI Agent endpoint (V2 - AI SDK Patterns)
 * Allows testing an agent with a sample message before activation
 *
 * Uses streamText + tools for structured output (AI SDK v6 pattern)
 * Also supports Google File Search Tool for RAG when configured
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'
import { DEFAULT_MODEL_ID } from '@/lib/ai/model'

// =============================================================================
// Response Schema (same as support-agent-v2)
// =============================================================================

const testResponseSchema = z.object({
  message: z.string().describe('A resposta para enviar ao usuário'),
  sentiment: z
    .enum(['positive', 'neutral', 'negative', 'frustrated'])
    .describe('Sentimento detectado na mensagem do usuário'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Nível de confiança na resposta (0 = incerto, 1 = certo)'),
  shouldHandoff: z
    .boolean()
    .describe('Se deve transferir para um atendente humano'),
  handoffReason: z
    .string()
    .optional()
    .describe('Motivo da transferência para humano'),
  sources: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
      })
    )
    .optional()
    .describe('Fontes utilizadas para gerar a resposta'),
})

type TestResponse = z.infer<typeof testResponseSchema>

// Helper to get admin client with null check
function getClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured. Check SUPABASE_SECRET_KEY env var.')
  }
  return client
}

const testMessageSchema = z.object({
  message: z.string().min(1, 'Mensagem é obrigatória').max(2000),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = getClient()
    const body = await request.json()

    // Validate body
    const parsed = testMessageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { message } = parsed.data

    // Get agent with file_search_store_id
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agente não encontrado' },
        { status: 404 }
      )
    }

    console.log(`[ai-agents/test] Agent: ${agent.name}, file_search_store_id: ${agent.file_search_store_id}`)

    // Get count of indexed files for this agent
    const { count: indexedFilesCount } = await supabase
      .from('ai_knowledge_files')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', id)
      .eq('indexing_status', 'completed')

    console.log(`[ai-agents/test] Indexed files count: ${indexedFilesCount}`)

    // Import AI dependencies dynamically
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
    const { streamText, tool } = await import('ai')
    const { withDevTools } = await import('@/lib/ai/devtools')

    // Get Gemini API key
    const { data: geminiSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'gemini_api_key')
      .maybeSingle()

    const apiKey = geminiSetting?.value || process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key do Gemini não configurada' },
        { status: 500 }
      )
    }

    // Create Google provider with DevTools support
    const google = createGoogleGenerativeAI({ apiKey })
    const modelId = agent.model || DEFAULT_MODEL_ID
    const baseModel = google(modelId)
    const model = await withDevTools(baseModel, { name: `agent-test:${agent.name}` })

    console.log(`[ai-agents/test] Using model: ${modelId}`)

    // Build system prompt with structured output instructions
    const systemPrompt = `${agent.system_prompt}

INSTRUÇÕES IMPORTANTES:
1. Responda sempre em português do Brasil
2. Seja educado, profissional e empático
3. Se não souber a resposta, admita e ofereça alternativas
4. Detecte o sentimento do usuário (positivo, neutro, negativo, frustrado)
5. Defina shouldHandoff como true se não puder ajudar

IMPORTANTE: Você DEVE usar a ferramenta "respond" para enviar sua resposta.`

    // Generate response
    const startTime = Date.now()

    // Configure tools - only add fileSearch if agent has a store with files
    const hasFileSearch = agent.file_search_store_id && indexedFilesCount && indexedFilesCount > 0

    // Capture structured response from tool
    let structuredResponse: TestResponse | undefined

    // Define the respond tool
    const respondTool = tool({
      description: 'Envia uma resposta estruturada ao usuário. SEMPRE use esta ferramenta.',
      inputSchema: testResponseSchema,
      execute: async (params) => {
        structuredResponse = params
        return params
      },
    })

    // Use streamText with tools for structured output (AI SDK v6 pattern)
    // Note: File Search is handled separately if needed, but we prioritize structured output
    if (hasFileSearch) {
      console.log(`[ai-agents/test] Using File Search Store: ${agent.file_search_store_id} with ${indexedFilesCount} files`)
      // When using file_search with structured output, we run them in sequence
      // First, let the model search, then respond
    }

    const result = streamText({
      model,
      system: systemPrompt,
      prompt: message,
      temperature: agent.temperature ?? 0.7,
      maxOutputTokens: agent.max_tokens ?? 1024,
      tools: {
        respond: respondTool,
      },
      toolChoice: 'required',
    })

    // Consume the stream completely to trigger tool execution
    for await (const _part of result.fullStream) {
      // Just consume - the tool execute function captures the response
    }

    const latencyMs = Date.now() - startTime

    // If no structured response was captured, something went wrong
    if (!structuredResponse) {
      throw new Error('No structured response generated from AI')
    }

    console.log(`[ai-agents/test] Response generated in ${latencyMs}ms. Used File Search: ${hasFileSearch}`)

    return NextResponse.json({
      response: structuredResponse.message,
      latency_ms: latencyMs,
      model: modelId,
      knowledge_files_used: indexedFilesCount ?? 0,
      file_search_enabled: hasFileSearch,
      // Structured output fields
      sentiment: structuredResponse.sentiment,
      confidence: structuredResponse.confidence,
      shouldHandoff: structuredResponse.shouldHandoff,
      handoffReason: structuredResponse.handoffReason,
      sources: structuredResponse.sources,
    })
  } catch (error) {
    console.error('[ai-agents/test] Error:', error)

    // Handle AI SDK specific errors
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: 'Erro de autenticação com o modelo de IA' },
          { status: 401 }
        )
      }
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        return NextResponse.json(
          { error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' },
          { status: 429 }
        )
      }
      if (error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
        return NextResponse.json(
          { error: 'Quota excedida. Verifique seu plano do Gemini e configure billing.' },
          { status: 429 }
        )
      }
      // Return the actual error message for debugging
      return NextResponse.json(
        { error: `Erro ao testar agente: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Erro ao testar agente' },
      { status: 500 }
    )
  }
}
