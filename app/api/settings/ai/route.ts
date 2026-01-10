import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { clearSettingsCache } from '@/lib/ai'
import { DEFAULT_AI_FALLBACK, DEFAULT_AI_PROMPTS, DEFAULT_AI_ROUTES } from '@/lib/ai/ai-center-defaults'
import {
  clearAiCenterCache,
  getAiFallbackConfig,
  getAiPromptsConfig,
  getAiRoutesConfig,
  prepareAiFallbackUpdate,
  prepareAiPromptsUpdate,
  prepareAiRoutesUpdate,
} from '@/lib/ai/ai-center-config'

/**
 * Validate API key by making a minimal test call
 */
async function validateApiKey(provider: string, apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
        let model;

        switch (provider) {
            case 'google': {
                const google = createGoogleGenerativeAI({ apiKey })
                model = google('gemini-2.0-flash')
                break
            }
            case 'openai': {
                const openai = createOpenAI({ apiKey })
                model = openai('gpt-4o-mini')
                break
            }
            case 'anthropic': {
                const anthropic = createAnthropic({ apiKey })
                model = anthropic('claude-3-haiku-20240307')
                break
            }
            default:
                return { valid: false, error: 'Provider desconhecido' }
        }

        // Make a minimal test call
        await generateText({
            model,
            prompt: 'Hi',
            maxOutputTokens: 5,
        })

        return { valid: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido'

        console.error('[AI Key Validation] Error:', message)

        // Parse common error messages for user-friendly responses
        if (message.toLowerCase().includes('api key') || message.toLowerCase().includes('apikey')) {
            return { valid: false, error: 'Chave de API inválida. Verifique se a chave está correta e ativa.' }
        }
        if (message.includes('quota') || message.includes('rate limit')) {
            // Key is valid but quota exceeded - still valid
            return { valid: true }
        }
        if (message.includes('401') || message.includes('Unauthorized')) {
            return { valid: false, error: 'Chave de API não autorizada. Verifique as permissões da chave.' }
        }
        if (message.includes('403') || message.includes('Forbidden')) {
            return { valid: false, error: 'Acesso negado. A chave pode estar desativada ou sem permissões.' }
        }
        if (message.includes('404') || message.includes('not found')) {
            return { valid: false, error: 'Modelo não encontrado. Verifique se sua conta tem acesso ao modelo.' }
        }
        if (message.includes('ENOTFOUND') || message.includes('network')) {
            return { valid: false, error: 'Erro de conexão. Verifique sua internet e tente novamente.' }
        }

        // Return the original message for unknown errors
        return { valid: false, error: `Erro ao validar chave: ${message}` }
    }
}

function parseJsonSetting<T>(value: string | null, fallback: T): T {
    if (!value) return fallback
    try {
        return JSON.parse(value) as T
    } catch {
        return fallback
    }
}

export async function GET() {
    try {
        // Get all AI settings from Supabase
        const { data, error } = await supabase.admin
            ?.from('settings')
            .select('key, value')
            .in('key', [
                'gemini_api_key',
                'openai_api_key',
                'anthropic_api_key',
                'ai_provider',
                'ai_model',
                'ai_routes',
                'ai_fallback',
                'ai_prompts',
            ]) || { data: null, error: null }

        if (error) {
            console.error('Supabase error:', error)
        }

        const settingsMap = new Map(data?.map(s => [s.key, s.value]) || [])

        // Get the current/saved provider
        const savedProvider = settingsMap.get('ai_provider') as string || 'google'
        const savedModel = settingsMap.get('ai_model') as string || ''

        // Get API keys for each provider (from DB or env)
        const providerKeys = {
            google: settingsMap.get('gemini_api_key') || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '',
            openai: settingsMap.get('openai_api_key') || process.env.OPENAI_API_KEY || '',
            anthropic: settingsMap.get('anthropic_api_key') || process.env.ANTHROPIC_API_KEY || '',
        }

        // Get source for each provider
        const providerSources = {
            google: settingsMap.get('gemini_api_key') ? 'database' : (providerKeys.google ? 'env' : 'none'),
            openai: settingsMap.get('openai_api_key') ? 'database' : (providerKeys.openai ? 'env' : 'none'),
            anthropic: settingsMap.get('anthropic_api_key') ? 'database' : (providerKeys.anthropic ? 'env' : 'none'),
        }

        // Get preview for each provider
        const getPreview = (key: string) => key ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : null

        const providerPreviews = {
            google: getPreview(providerKeys.google),
            openai: getPreview(providerKeys.openai),
            anthropic: getPreview(providerKeys.anthropic),
        }

        const routes = prepareAiRoutesUpdate(
            parseJsonSetting(settingsMap.get('ai_routes') as string | null, DEFAULT_AI_ROUTES)
        )
        const fallback = prepareAiFallbackUpdate(
            parseJsonSetting(settingsMap.get('ai_fallback') as string | null, DEFAULT_AI_FALLBACK)
        )
        const prompts = prepareAiPromptsUpdate(
            parseJsonSetting(settingsMap.get('ai_prompts') as string | null, DEFAULT_AI_PROMPTS)
        )

        return NextResponse.json({
            // Saved configuration
            provider: savedProvider,
            model: savedModel,
            // Per-provider status
            providers: {
                google: {
                    isConfigured: !!providerKeys.google,
                    source: providerSources.google,
                    tokenPreview: providerPreviews.google,
                },
                openai: {
                    isConfigured: !!providerKeys.openai,
                    source: providerSources.openai,
                    tokenPreview: providerPreviews.openai,
                },
                anthropic: {
                    isConfigured: !!providerKeys.anthropic,
                    source: providerSources.anthropic,
                    tokenPreview: providerPreviews.anthropic,
                },
            },
            // Legacy fields for backward compat (uses saved provider's key)
            isConfigured: !!providerKeys[savedProvider as keyof typeof providerKeys],
            source: providerSources[savedProvider as keyof typeof providerSources],
            tokenPreview: providerPreviews[savedProvider as keyof typeof providerPreviews],
            routes,
            fallback,
            prompts,
        })
    } catch (error) {
        console.error('Error fetching AI settings:', error)
        return NextResponse.json(
            { error: 'Failed to fetch AI settings' },
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { apiKey, apiKeyProvider, provider, model, routes, fallback, prompts } = body

        // At least one field must be provided
        if (!apiKey && !provider && !model && !routes && !fallback && !prompts) {
            return NextResponse.json(
                { error: 'At least one field is required' },
                { status: 400 }
            )
        }

        const updates: Array<{ key: string; value: string; updated_at: string }> = []
        const now = new Date().toISOString()

        // Validate and save API key
        if (apiKey) {
            const targetProvider = apiKeyProvider || provider || 'google'

            // Validate the API key by making a test call
            const validationResult = await validateApiKey(targetProvider, apiKey)
            if (!validationResult.valid) {
                return NextResponse.json(
                    { error: `Chave de API inválida: ${validationResult.error}` },
                    { status: 400 }
                )
            }

            let keyName = 'gemini_api_key'
            switch (targetProvider) {
                case 'openai':
                    keyName = 'openai_api_key'
                    break
                case 'anthropic':
                    keyName = 'anthropic_api_key'
                    break
            }

            updates.push({ key: keyName, value: apiKey, updated_at: now })
        }

        // Save provider selection
        if (provider) {
            updates.push({ key: 'ai_provider', value: provider, updated_at: now })
        }

        // Save model selection
        if (model) {
            updates.push({ key: 'ai_model', value: model, updated_at: now })
        }

        if (routes) {
            const currentRoutes = await getAiRoutesConfig()
            const normalizedRoutes = prepareAiRoutesUpdate({ ...currentRoutes, ...routes })
            updates.push({
                key: 'ai_routes',
                value: JSON.stringify(normalizedRoutes),
                updated_at: now,
            })
        }

        if (fallback) {
            const currentFallback = await getAiFallbackConfig()
            const normalizedFallback = prepareAiFallbackUpdate({ ...currentFallback, ...fallback })
            updates.push({
                key: 'ai_fallback',
                value: JSON.stringify(normalizedFallback),
                updated_at: now,
            })
        }

        if (prompts) {
            const currentPrompts = await getAiPromptsConfig()
            const normalizedPrompts = prepareAiPromptsUpdate({ ...currentPrompts, ...prompts })
            updates.push({
                key: 'ai_prompts',
                value: JSON.stringify(normalizedPrompts),
                updated_at: now,
            })
        }

        // Upsert all updates
        if (updates.length > 0) {
            const { error } = await supabase.admin
                ?.from('settings')
                .upsert(updates) || { error: new Error('Supabase not configured') }

            if (error) {
                console.error('Supabase error:', error)
                throw new Error('Failed to save to database')
            }
        }

        clearSettingsCache()
        clearAiCenterCache()

        return NextResponse.json({
            success: true,
            message: 'AI configuration saved successfully',
            saved: updates.map(u => u.key),
        })
    } catch (error) {
        console.error('Error saving AI settings:', error)
        return NextResponse.json(
            { error: 'Failed to save AI settings' },
            { status: 500 }
        )
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const provider = searchParams.get('provider')

        if (!provider || !['google', 'openai', 'anthropic'].includes(provider)) {
            return NextResponse.json(
                { error: 'Valid provider is required (google, openai, anthropic)' },
                { status: 400 }
            )
        }

        // Map provider to key name
        const keyMap: Record<string, string> = {
            google: 'gemini_api_key',
            openai: 'openai_api_key',
            anthropic: 'anthropic_api_key',
        }

        const keyName = keyMap[provider]

        // Delete the key from database
        const { error } = await supabase.admin
            ?.from('settings')
            .delete()
            .eq('key', keyName) || { error: new Error('Supabase not configured') }

        if (error) {
            console.error('Supabase error:', error)
            throw new Error('Failed to delete from database')
        }

        clearSettingsCache()

        return NextResponse.json({
            success: true,
            message: `${provider} API key removed successfully`,
            deleted: keyName,
        })
    } catch (error) {
        console.error('Error removing AI settings:', error)
        return NextResponse.json(
            { error: 'Failed to remove AI settings' },
            { status: 500 }
        )
    }
}
