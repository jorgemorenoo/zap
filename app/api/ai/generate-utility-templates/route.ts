import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateBody, formatZodErrors } from '@/lib/api-validation'
import { generateText, generateJSON } from '@/lib/ai'
import { judgeTemplates } from '@/lib/ai/services/ai-judge'
import { buildUtilityGenerationPrompt } from '@/lib/ai/prompts/utility-generator'
import { supabase } from '@/lib/supabase'
import { getAiPromptsConfig, isAiRouteEnabled } from '@/lib/ai/ai-center-config'

// ============================================================================
// PROMPT ÚNICO - Gera templates UTILITY
// ============================================================================

// Schema de entrada
export const GenerateUtilityTemplatesSchema = z.object({
  prompt: z.string()
    .min(10, 'Descreva melhor o que você precisa (mínimo 10 caracteres)')
    .max(2000, 'Descrição muito longa'),
  quantity: z.number().int().min(1).max(20).default(5),
  language: z.enum(['pt_BR', 'en_US', 'es_ES']).default('pt_BR'),
})

const languageMap: Record<string, string> = {
  pt_BR: 'português brasileiro',
  en_US: 'inglês americano',
  es_ES: 'espanhol'
}

// ============================================================================
// TIPO PARA TEMPLATE GERADO
// ============================================================================

interface GeneratedTemplate {
  id: string
  name: string
  content: string
  header?: { format: string; text?: string }
  footer?: { text: string }
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>
  language: string
  status: string
  // AI Judge fields
  judgment?: {
    approved: boolean
    predictedCategory: 'UTILITY' | 'MARKETING'
    confidence: number
    issues: Array<{ word: string; reason: string; suggestion: string }>
  }
  wasFixed?: boolean
  originalContent?: string
}

// ============================================================================
// FUNÇÃO DE NORMALIZAÇÃO DEFINITIVA
// Garante que todos os campos estejam no formato esperado pelo schema
// ============================================================================

// ============================================================================
// SANITIZAÇÃO PARA REGRAS DA META
// Corrige automaticamente templates que violam regras conhecidas
// ============================================================================

function sanitizeContentForMeta(content: string): string {
  let sanitized = content.trim()

  // Regra 1: NUNCA começar com variável
  // Ex: "{{1}}, seu pedido..." -> "Olá {{1}}, seu pedido..."
  if (/^{{\d+}}/.test(sanitized)) {
    sanitized = 'Olá ' + sanitized
  }

  // Regra 2: NUNCA terminar com variável
  // Ex: "...para {{2}}" -> "...para {{2}}."
  if (/{{\d+}}$/.test(sanitized)) {
    sanitized = sanitized + '.'
  }

  // Regra 3: Garantir proporção mínima texto/variáveis
  // Se houver muitas variáveis, adicionar mais texto
  const variableCount = (sanitized.match(/{{\d+}}/g) || []).length
  const wordCount = sanitized.replace(/{{\d+}}/g, '').split(/\s+/).filter(w => w.length > 0).length

  // Meta exige ~3-4 palavras por variável mínimo
  if (variableCount > 0 && wordCount / variableCount < 3) {
    // Adicionar contexto extra
    if (!sanitized.includes('Informamos')) {
      sanitized = 'Informamos que ' + sanitized.charAt(0).toLowerCase() + sanitized.slice(1)
    }
    if (!sanitized.includes('detalhes')) {
      sanitized = sanitized.replace(/\.$/, '. Para mais detalhes, acesse sua conta.')
    }
  }

  return sanitized
}

function normalizeTemplate(
  rawTemplate: Record<string, unknown>,
  index: number,
  language: string,
  primaryUrl: string | null
): GeneratedTemplate {
  // Name: snake_case, apenas letras minúsculas, números e underscore
  let name = String(rawTemplate.name || `template_${index + 1}`)
  name = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 512)

  // Content: string obrigatória + sanitização
  const rawContent = String(rawTemplate.content || rawTemplate.body || '')
  const content = sanitizeContentForMeta(rawContent)

  // Header: { format: string, text?: string } ou undefined
  let header: GeneratedTemplate['header'] = undefined
  if (rawTemplate.header && typeof rawTemplate.header === 'object') {
    const h = rawTemplate.header as Record<string, unknown>
    let headerText = h.text ? String(h.text).substring(0, 60) : undefined
    // Sanitizar header também
    if (headerText) {
      if (/^{{\d+}}/.test(headerText)) {
        headerText = 'Atualização: ' + headerText
      }
      if (/{{\d+}}$/.test(headerText)) {
        headerText = headerText + ' ⚡'
      }
      header = {
        format: String(h.format || 'TEXT'),
        text: headerText
      }
    }
  }

  // Footer: { text: string } ou undefined (NUNCA { text: undefined })
  let footer: GeneratedTemplate['footer'] = undefined
  if (rawTemplate.footer && typeof rawTemplate.footer === 'object') {
    const f = rawTemplate.footer as Record<string, unknown>
    const footerText = f.text ? String(f.text).substring(0, 60) : undefined
    if (footerText) {
      footer = { text: footerText }
    }
  }

  // Buttons: array de { type: 'URL', text: string, url: string }
  let buttons: GeneratedTemplate['buttons'] = undefined
  if (Array.isArray(rawTemplate.buttons) && rawTemplate.buttons.length > 0) {
    const validButtons = rawTemplate.buttons
      .filter((b): b is Record<string, unknown> => b && typeof b === 'object')
      .map(b => {
        const btnUrl = b.url ? String(b.url) : primaryUrl
        const btnText = b.text ? String(b.text).substring(0, 25) : 'Ver Detalhes'
        return {
          type: 'URL' as const,
          text: btnText,
          url: btnUrl || 'https://example.com'
        }
      })
      .filter(b => b.url) // Apenas botões com URL válida
      .slice(0, 10) // Max 10 botões

    if (validButtons.length > 0) {
      buttons = validButtons
    }
  }

  return {
    id: `generated_${Date.now()}_${index}`,
    name,
    content,
    header,
    footer,
    buttons,
    language,
    status: 'DRAFT'
  }
}

// ============================================================================
// LEGACY GENERATION FUNCTION (fallback quando Agent não disponível)
// ============================================================================

async function generateWithUnifiedPrompt(
  userPrompt: string,
  quantity: number,
  language: string,
  primaryUrl: string | null,
  promptTemplate: string
): Promise<GeneratedTemplate[]> {
  const utilityPrompt = buildUtilityGenerationPrompt({
    prompt: userPrompt,
    quantity,
    language: languageMap[language] || 'português brasileiro',
    primaryUrl,
    template: promptTemplate,
  })

  const rawTemplates = await generateJSON<Array<Record<string, unknown>>>(
    { prompt: utilityPrompt }
  )

  if (!Array.isArray(rawTemplates)) throw new Error('Response is not an array')

  return rawTemplates.map((t, index) => normalizeTemplate(t, index, language, primaryUrl))
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const routeEnabled = await isAiRouteEnabled('generateUtilityTemplates')
    if (!routeEnabled) {
      return NextResponse.json(
        { error: 'Rota desativada nas configurações de IA.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    console.log('[API ROUTE] Received Body:', JSON.stringify(body, null, 2));

    const validation = validateBody(GenerateUtilityTemplatesSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400 }
      )
    }

    const { prompt: userPrompt, quantity, language } = validation.data

    // Get API key from settings for both Agent and Judge
    let apiKey: string | null = null
    try {
      const settingsResult = await supabase.admin
        ?.from('settings')
        .select('value')
        .eq('key', 'gemini_api_key')
        .single()
      apiKey = settingsResult?.data?.value || process.env.GOOGLE_GENERATIVE_AI_API_KEY || null
    } catch {
      apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || null
    }

    // Detectar URLs no prompt
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?)/gi
    const detectedUrls = userPrompt.match(urlRegex) || []
    const primaryUrl = detectedUrls[0]
      ? (detectedUrls[0].startsWith('http') ? detectedUrls[0] : `https://${detectedUrls[0]}`)
      : null

    const promptsConfig = await getAiPromptsConfig()
    let templates: GeneratedTemplate[]

    console.log('[GENERATE] Using unified prompt-based generation...')
    templates = await generateWithUnifiedPrompt(
      userPrompt,
      quantity,
      language,
      primaryUrl,
      promptsConfig.utilityGenerationTemplate
    )

    // ========================================================================
    // AI JUDGE - Validar cada template
    // ========================================================================
    let validatedTemplates = templates

    try {
      if (apiKey) {
        console.log('[AI_JUDGE] Validating templates...')

        const judgments = await judgeTemplates(
          templates.map(t => ({
            name: t.name,
            header: t.header?.text || null,
            body: t.content
          })),
          { apiKey }
        )

        // Confidence thresholds
        const HIGH_CONFIDENCE = 0.80  // Templates pass directly
        const MIN_CONFIDENCE = 0.70   // Templates need retry below this
        const MAX_RETRIES = 3         // Maximum retry attempts per template

        // Process templates with retry logic for low confidence
        const processedTemplates: typeof templates = []

        for (let i = 0; i < templates.length; i++) {
          const template = templates[i]
          const judgment = judgments[i]

          let currentContent = template.content
          let currentHeader = template.header?.text || null
          let currentJudgment = judgment
          let retryCount = 0

          // Retry loop for low confidence templates
          while (currentJudgment.confidence < MIN_CONFIDENCE && retryCount < MAX_RETRIES) {
            retryCount++
            console.log(`[AI_JUDGE] 🔄 RETRY ${retryCount}/${MAX_RETRIES}: ${template.name} (${Math.round(currentJudgment.confidence * 100)}% too low)`)

            // Use the fixed version if available for retry
            if (currentJudgment.fixedBody) {
              currentContent = currentJudgment.fixedBody
            }
            if (currentJudgment.fixedHeader) {
              currentHeader = currentJudgment.fixedHeader
            }

            // Re-judge the fixed version
            const [retryJudgment] = await judgeTemplates(
              [{ name: template.name, header: currentHeader, body: currentContent }],
              { apiKey }
            )
            currentJudgment = retryJudgment
          }

          // Final decision based on confidence
          const finalConfidence = currentJudgment.confidence
          const isApproved = currentJudgment.approved && finalConfidence >= HIGH_CONFIDENCE
          const isAcceptable = finalConfidence >= MIN_CONFIDENCE && (currentJudgment.approved || currentJudgment.fixedBody)

          if (isApproved) {
            console.log(`[AI_JUDGE] ✅ APPROVED: ${template.name} (${Math.round(finalConfidence * 100)}%)`)
            processedTemplates.push({
              ...template,
              content: currentContent,
              header: currentHeader && template.header ? { ...template.header, text: currentHeader } : template.header,
              judgment: {
                approved: true,
                predictedCategory: currentJudgment.predictedCategory,
                confidence: finalConfidence,
                issues: currentJudgment.issues
              },
              wasFixed: currentContent !== template.content
            })
          } else if (isAcceptable && currentJudgment.fixedBody) {
            console.log(`[AI_JUDGE] 🔧 FIXED: ${template.name} (${Math.round(finalConfidence * 100)}%)`)
            processedTemplates.push({
              ...template,
              content: currentJudgment.fixedBody,
              originalContent: template.content,
              header: currentJudgment.fixedHeader && template.header
                ? { ...template.header, text: currentJudgment.fixedHeader }
                : template.header,
              judgment: {
                approved: false,
                predictedCategory: currentJudgment.predictedCategory,
                confidence: finalConfidence,
                issues: currentJudgment.issues
              },
              wasFixed: true
            })
          } else {
            console.log(`[AI_JUDGE] ⛔ FILTERED: ${template.name} (${Math.round(finalConfidence * 100)}% after ${retryCount} retries)`)
            // Don't add to processedTemplates - filtered out
          }
        }

        validatedTemplates = processedTemplates

        const approved = validatedTemplates.filter(t => t.judgment?.approved).length
        const fixed = validatedTemplates.filter(t => t.wasFixed && !t.judgment?.approved).length
        const filtered = templates.length - validatedTemplates.length
        console.log(`[AI_JUDGE] Final: ${validatedTemplates.length}/${templates.length} templates (${approved} approved, ${fixed} fixed, ${filtered} filtered out)`)
      } else {
        console.log('[AI_JUDGE] Skipped - no API key available')
      }
    } catch (judgeError) {
      console.error('[AI_JUDGE] Validation failed:', judgeError instanceof Error ? judgeError.message : judgeError)
      console.error('[AI_JUDGE] Full error:', judgeError)
      // Continue without validation if it fails
    }

    // ========================================================================
    // GENERATE BATCH TITLE
    // ========================================================================
    let batchTitle = 'Submissão em Lote'
    try {
      const titleResult = await generateText({
        prompt: `Resuma em NO MÁXIMO 4 palavras (sem pontuação) o tema: "${userPrompt.substring(0, 200)}". Retorne APENAS as palavras.`,
      })
      batchTitle = titleResult.text.trim()
        .replace(/["""''\.]/g, '')
        .substring(0, 40) || 'Submissão em Lote'
    } catch {
      batchTitle = userPrompt.substring(0, 30).trim() + '...'
    }

    return NextResponse.json({
      templates: validatedTemplates,
      metadata: {
        prompt: userPrompt,
        quantity: validatedTemplates.length,
        language,
        suggestedTitle: batchTitle,
        aiJudge: {
          enabled: validatedTemplates.some(t => t.judgment),
          approved: validatedTemplates.filter(t => t.judgment?.approved).length,
          fixed: validatedTemplates.filter(t => t.wasFixed).length,
          rejected: validatedTemplates.filter(t => t.judgment && !t.judgment.approved && !t.wasFixed).length
        }
      }
    })

  } catch (error) {
    console.error('AI Error:', error)
    return NextResponse.json(
      { error: 'Falha ao gerar templates com IA' },
      { status: 500 }
    )
  }
}
