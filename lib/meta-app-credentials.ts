import { settingsDb } from '@/lib/supabase-db'

export type MetaAppCredentialsSource = 'db' | 'env' | 'none'

export interface MetaAppCredentials {
  appId: string
  appSecret: string
  source: MetaAppCredentialsSource
}

/**
 * Credenciais do App da Meta (opcional).
 *
 * Usadas para validação forte de tokens via Graph API `/debug_token`.
 *
 * Prioridade:
 * 1) Supabase `settings` (metaAppId/metaAppSecret)
 * 2) Env vars (META_APP_ID/META_APP_SECRET)
 */
export async function getMetaAppCredentials(): Promise<MetaAppCredentials | null> {
  try {
    const settings = await settingsDb.getAll() as any

    const appId = String(settings?.metaAppId || '').trim() || String(process.env.META_APP_ID || '').trim()
    const appSecret = String(settings?.metaAppSecret || '').trim() || String(process.env.META_APP_SECRET || '').trim()

    if (!appId || !appSecret) return null

    const source: MetaAppCredentialsSource =
      String(settings?.metaAppId || '').trim() && String(settings?.metaAppSecret || '').trim() ? 'db'
      : (String(process.env.META_APP_ID || '').trim() && String(process.env.META_APP_SECRET || '').trim() ? 'env' : 'none')

    return { appId, appSecret, source }
  } catch {
    const appId = String(process.env.META_APP_ID || '').trim()
    const appSecret = String(process.env.META_APP_SECRET || '').trim()
    if (!appId || !appSecret) return null
    return { appId, appSecret, source: 'env' }
  }
}

export async function getMetaAppConfigPublic(): Promise<{
  source: MetaAppCredentialsSource
  appId: string | null
  hasAppSecret: boolean
  isConfigured: boolean
}> {
  try {
    const settings = await settingsDb.getAll() as any

    const dbAppId = String(settings?.metaAppId || '').trim()
    const dbSecret = String(settings?.metaAppSecret || '').trim()

    const envAppId = String(process.env.META_APP_ID || '').trim()
    const envSecret = String(process.env.META_APP_SECRET || '').trim()

    const appId = (dbAppId || envAppId) || null
    const hasAppSecret = Boolean(dbSecret || envSecret)

    const source: MetaAppCredentialsSource =
      dbAppId || dbSecret ? 'db'
      : (envAppId || envSecret ? 'env' : 'none')

    return {
      source,
      appId,
      hasAppSecret,
      isConfigured: Boolean(appId && hasAppSecret),
    }
  } catch {
    const envAppId = String(process.env.META_APP_ID || '').trim()
    const envSecret = String(process.env.META_APP_SECRET || '').trim()
    const appId = envAppId || null
    const hasAppSecret = Boolean(envSecret)
    const source: MetaAppCredentialsSource = (envAppId || envSecret) ? 'env' : 'none'
    return {
      source,
      appId,
      hasAppSecret,
      isConfigured: Boolean(appId && hasAppSecret),
    }
  }
}
