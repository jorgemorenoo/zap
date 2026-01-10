import { supabase } from '@/lib/supabase'
import {
  DEFAULT_AI_FALLBACK,
  DEFAULT_AI_PROMPTS,
  DEFAULT_AI_ROUTES,
  type AiFallbackConfig,
  type AiPromptsConfig,
  type AiRoutesConfig,
} from './ai-center-defaults'

const SETTINGS_KEYS = {
  routes: 'ai_routes',
  fallback: 'ai_fallback',
  prompts: 'ai_prompts',
} as const

const CACHE_TTL = 60000
let cacheTime = 0
let cachedRoutes: AiRoutesConfig | null = null
let cachedFallback: AiFallbackConfig | null = null
let cachedPrompts: AiPromptsConfig | null = null

function parseJsonSetting<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeRoutes(input?: Partial<AiRoutesConfig> | null): AiRoutesConfig {
  const next = { ...DEFAULT_AI_ROUTES, ...(input || {}) }
  return {
    generateTemplate: !!next.generateTemplate,
    generateUtilityTemplates: !!next.generateUtilityTemplates,
    generateFlowForm: !!next.generateFlowForm,
    workflowBuilder: !!next.workflowBuilder,
  }
}

function normalizeFallback(input?: Partial<AiFallbackConfig> | null): AiFallbackConfig {
  const next = { ...DEFAULT_AI_FALLBACK, ...(input || {}) }
  return {
    enabled: !!next.enabled,
    provider: next.provider || DEFAULT_AI_FALLBACK.provider,
    model: next.model || DEFAULT_AI_FALLBACK.model,
  }
}

function normalizePrompts(input?: Partial<AiPromptsConfig> | null): AiPromptsConfig {
  const next = { ...DEFAULT_AI_PROMPTS, ...(input || {}) }
  return {
    templateShort: next.templateShort || DEFAULT_AI_PROMPTS.templateShort,
    utilityGenerationTemplate: next.utilityGenerationTemplate || DEFAULT_AI_PROMPTS.utilityGenerationTemplate,
    utilityJudgeTemplate: next.utilityJudgeTemplate || DEFAULT_AI_PROMPTS.utilityJudgeTemplate,
    flowFormTemplate: next.flowFormTemplate || DEFAULT_AI_PROMPTS.flowFormTemplate,
  }
}

async function getSettingValue(key: string): Promise<string | null> {
  const { data, error } = await supabase.admin
    ?.from('settings')
    .select('value')
    .eq('key', key)
    .single() || { data: null, error: null }

  if (error || !data) return null
  return data.value
}

function isCacheValid(): boolean {
  return Date.now() - cacheTime < CACHE_TTL
}

export async function getAiRoutesConfig(): Promise<AiRoutesConfig> {
  if (cachedRoutes && isCacheValid()) return cachedRoutes
  const raw = await getSettingValue(SETTINGS_KEYS.routes)
  const parsed = parseJsonSetting<Partial<AiRoutesConfig>>(raw, DEFAULT_AI_ROUTES)
  cachedRoutes = normalizeRoutes(parsed)
  cacheTime = Date.now()
  return cachedRoutes
}

export async function getAiFallbackConfig(): Promise<AiFallbackConfig> {
  if (cachedFallback && isCacheValid()) return cachedFallback
  const raw = await getSettingValue(SETTINGS_KEYS.fallback)
  const parsed = parseJsonSetting<Partial<AiFallbackConfig>>(raw, DEFAULT_AI_FALLBACK)
  cachedFallback = normalizeFallback(parsed)
  cacheTime = Date.now()
  return cachedFallback
}

export async function getAiPromptsConfig(): Promise<AiPromptsConfig> {
  if (cachedPrompts && isCacheValid()) return cachedPrompts
  const raw = await getSettingValue(SETTINGS_KEYS.prompts)
  const parsed = parseJsonSetting<Partial<AiPromptsConfig>>(raw, DEFAULT_AI_PROMPTS)
  cachedPrompts = normalizePrompts(parsed)
  cacheTime = Date.now()
  return cachedPrompts
}

export async function isAiRouteEnabled(routeKey: keyof AiRoutesConfig): Promise<boolean> {
  const routes = await getAiRoutesConfig()
  return routes[routeKey]
}

export function prepareAiRoutesUpdate(input?: Partial<AiRoutesConfig> | null): AiRoutesConfig {
  return normalizeRoutes(input)
}

export function prepareAiFallbackUpdate(input?: Partial<AiFallbackConfig> | null): AiFallbackConfig {
  return normalizeFallback(input)
}

export function prepareAiPromptsUpdate(input?: Partial<AiPromptsConfig> | null): AiPromptsConfig {
  return normalizePrompts(input)
}

export function clearAiCenterCache() {
  cacheTime = 0
  cachedRoutes = null
  cachedFallback = null
  cachedPrompts = null
}
