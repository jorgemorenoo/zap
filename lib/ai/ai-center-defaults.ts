import type { AIProvider } from './providers'
import { FLOW_FORM_PROMPT_TEMPLATE } from './prompts/flow-form'
import { TEMPLATE_SHORT_PROMPT_TEMPLATE } from './prompts/template-short'
import { UTILITY_GENERATION_PROMPT_TEMPLATE } from './prompts/utility-generator'
import { UTILITY_JUDGE_PROMPT_TEMPLATE } from './prompts/utility-judge'

export type AiRoutesConfig = {
  generateTemplate: boolean
  generateUtilityTemplates: boolean
  generateFlowForm: boolean
  workflowBuilder: boolean
}

export type AiFallbackConfig = {
  enabled: boolean
  provider: AIProvider
  model: string
}

export type AiPromptsConfig = {
  templateShort: string
  utilityGenerationTemplate: string
  utilityJudgeTemplate: string
  flowFormTemplate: string
}

export const DEFAULT_AI_ROUTES: AiRoutesConfig = {
  generateTemplate: true,
  generateUtilityTemplates: true,
  generateFlowForm: true,
  workflowBuilder: false,
}

export const DEFAULT_AI_FALLBACK: AiFallbackConfig = {
  enabled: false,
  provider: 'openai',
  model: 'gpt-5.1-mini',
}

export const DEFAULT_AI_PROMPTS: AiPromptsConfig = {
  templateShort: TEMPLATE_SHORT_PROMPT_TEMPLATE,
  utilityGenerationTemplate: UTILITY_GENERATION_PROMPT_TEMPLATE,
  utilityJudgeTemplate: UTILITY_JUDGE_PROMPT_TEMPLATE,
  flowFormTemplate: FLOW_FORM_PROMPT_TEMPLATE,
}
