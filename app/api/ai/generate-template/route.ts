import { NextRequest, NextResponse } from 'next/server'
import { GenerateTemplateSchema, validateBody, formatZodErrors } from '@/lib/api-validation'
import { generateText } from '@/lib/ai'
import { getAiPromptsConfig, isAiRouteEnabled } from '@/lib/ai/ai-center-config'
import { buildTemplateShortPrompt } from '@/lib/ai/prompts/template-short'

export async function POST(request: NextRequest) {
  try {
    const routeEnabled = await isAiRouteEnabled('generateTemplate')
    if (!routeEnabled) {
      return NextResponse.json(
        { error: 'Rota desativada nas configurações de IA.' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const validation = validateBody(GenerateTemplateSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400 }
      )
    }

    const { prompt } = validation.data

    const promptsConfig = await getAiPromptsConfig()
    const promptTemplate = buildTemplateShortPrompt(prompt, promptsConfig.templateShort)

    const result = await generateText({
      prompt: promptTemplate,
    })

    return NextResponse.json({ content: result.text })
  } catch (error) {
    console.error('AI Error:', error)
    return NextResponse.json(
      { error: 'Falha ao gerar conteúdo com IA' },
      { status: 500 }
    )
  }
}
