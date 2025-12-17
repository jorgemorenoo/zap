'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  RefreshCw,
  ArrowLeft,
  Copy,
  Clock,
  LifeBuoy,
  ListChecks,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  Wand2,
} from 'lucide-react'

import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page'
import { PrefetchLink } from '@/components/ui/PrefetchLink'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import type {
  MetaDiagnosticsAction,
  MetaDiagnosticsCheck,
  MetaDiagnosticsCheckStatus,
  MetaDiagnosticsResponse,
} from '@/services/metaDiagnosticsService'

const META_BUSINESS_LOCKED_CODE = 131031

type MetaLockSignal =
  | { kind: 'none' }
  | { kind: 'historical'; evidence: { source: string; count?: number } }
  | { kind: 'current'; evidence: { source: string; count?: number } }

function hasMetaBusinessLockedEvidence(checks: MetaDiagnosticsCheck[]): MetaLockSignal {
  // Regra: só tratamos como BLOQUEIO ATUAL se o Health Status estiver BLOCKED.
  // Caso contrário, 131031 vira apenas um sinal histórico (ex.: ocorreu 1x em falhas recentes).

  const health = checks.find((c) => c.id === 'meta_health_status')
  const healthOverall = String((health?.details as any)?.overall || '')
  const healthErrors = Array.isArray((health?.details as any)?.errors) ? ((health?.details as any)?.errors as any[]) : []
  const healthHas131031 = healthErrors.some((e) => Number(e?.error_code) === META_BUSINESS_LOCKED_CODE)
  const isBlockedNow = health?.status === 'fail' || healthOverall === 'BLOCKED'

  if (isBlockedNow) {
    return {
      kind: 'current',
      evidence: {
        source: health?.title || 'Health Status',
        ...(healthHas131031 ? { count: 1 } : null),
      },
    }
  }

  // Sinal histórico: falhas recentes (detalhe.top[]) inclui o código
  for (const c of checks) {
    if (c.id !== 'internal_recent_failures') continue
    const top = (c.details as any)?.top
    if (Array.isArray(top)) {
      const found = top.find((x: any) => Number(x?.code) === META_BUSINESS_LOCKED_CODE)
      if (found) {
        return {
          kind: 'historical',
          evidence: {
            source: c.title || c.id,
            count: typeof found?.count === 'number' ? found.count : undefined,
          },
        }
      }
    }
  }

  return { kind: 'none' }
}

function StatusBadge({ status }: { status: MetaDiagnosticsCheckStatus }) {
  const base = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium'
  if (status === 'pass') return <span className={`${base} bg-emerald-500/10 border-emerald-500/20 text-emerald-200`}><CheckCircle2 size={14} /> OK</span>
  if (status === 'warn') return <span className={`${base} bg-amber-500/10 border-amber-500/20 text-amber-200`}><AlertTriangle size={14} /> Atenção</span>
  if (status === 'fail') return <span className={`${base} bg-red-500/10 border-red-500/20 text-red-200`}><XCircle size={14} /> Falha</span>
  return <span className={`${base} bg-white/5 border-white/10 text-gray-200`}><Info size={14} /> Info</span>
}

function HealthStatusSeal({ checks }: { checks: MetaDiagnosticsCheck[] }) {
  const health = checks.find((c) => c.id === 'meta_health_status')
  const overall = String((health?.details as any)?.overall || '')

  const status: MetaDiagnosticsCheckStatus =
    overall === 'BLOCKED' ? 'fail' : overall === 'LIMITED' ? 'warn' : overall === 'AVAILABLE' ? 'pass' : 'info'

  const subtitle =
    overall === 'BLOCKED'
      ? 'Bloqueio confirmado pela Meta (Health Status). Não há “auto-fix” aqui: precisa resolver no Business Manager/Meta.'
      : overall === 'LIMITED'
        ? 'Envio limitado pela Meta. Pode afetar volume/entregabilidade até resolver a causa.'
        : overall === 'AVAILABLE'
          ? 'Envio liberado segundo a Meta (prova oficial).'
          : 'Health Status não disponível (ou não foi possível consultar).'

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="text-xs text-gray-500">Semáforo</div>
      <div className="mt-2 flex items-center gap-2">
        <StatusBadge status={status} />
        <div className="text-sm text-white font-medium">Health Status: {overall || '—'}</div>
      </div>
      <div className="mt-2 text-sm text-gray-300">{subtitle}</div>
      <div className="mt-2 text-xs text-gray-500">
        Fonte: Graph API · field <span className="font-mono">health_status</span>
      </div>
    </div>
  )
}

function TokenExpirySeal({ data, checks }: { data?: MetaDiagnosticsResponse; checks: MetaDiagnosticsCheck[] }) {
  const enabled = Boolean(data?.debugTokenValidation?.enabled)
  const token = data?.summary?.token || null

  // fallback (se summary/token não vier por algum motivo): tenta ler do check meta_debug_token
  const fallbackExpiresAt = (() => {
    const c = checks.find((x) => x.id === 'meta_debug_token')
    const v = (c?.details as any)?.expiresAt
    if (typeof v === 'number') return v
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  })()

  const expiresIso = token?.expiresAtIso || (fallbackExpiresAt ? new Date(fallbackExpiresAt * 1000).toISOString() : null)
  const status = token?.status || (enabled ? 'unknown' : 'unknown')

  const badgeStatus: MetaDiagnosticsCheckStatus =
    !enabled ? 'info' : status === 'expired' ? 'fail' : status === 'expiring' ? 'warn' : status === 'ok' ? 'pass' : 'info'

  const subtitle = !enabled
    ? 'Para ver expiração do token com prova, habilite debug_token (Meta App ID/Secret).'
    : expiresIso
      ? `Expira em: ${new Date(expiresIso).toLocaleString('pt-BR')}`
      : 'Expiração não disponível (tipo de token/Meta não retornou expires_at).'

  const extra = enabled && token?.daysRemaining != null
    ? `Dias restantes: ${token.daysRemaining}`
    : null

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-gray-500">Token</div>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={badgeStatus} />
            <div className="text-sm text-white font-medium">Expiração</div>
          </div>
          <div className="mt-2 text-sm text-gray-300">{subtitle}</div>
          {extra && <div className="mt-2 text-xs text-gray-500">{extra}</div>}
        </div>
        <div className="shrink-0 text-gray-300">
          <Clock size={18} />
        </div>
      </div>
    </div>
  )
}

function DebugTokenSeal({ data }: { data?: MetaDiagnosticsResponse }) {
  const metaApp = data?.metaApp || null
  const dbg = data?.debugTokenValidation || null

  const enabled = Boolean(dbg?.enabled || metaApp?.enabled)
  const source = (dbg?.source || metaApp?.source || 'none') as 'db' | 'env' | 'none'

  const status: MetaDiagnosticsCheckStatus = !enabled
    ? 'info'
    : (dbg?.attempted && dbg?.ok === true && dbg?.isValid === true)
      ? 'pass'
      : (dbg?.attempted && (dbg?.ok === false || dbg?.isValid === false))
        ? 'warn'
        : 'info'

  const sourceLabel = source === 'db' ? 'Banco (Supabase)' : source === 'env' ? 'Env vars' : '—'
  const title = enabled ? 'debug_token habilitado' : 'debug_token desabilitado'
  const subtitle = !enabled
    ? 'Configure o Meta App ID/Secret para validar token/escopos com prova (menos achismo, menos suporte).'
    : dbg?.attempted
      ? (dbg?.ok === true && dbg?.isValid === true ? 'Última validação: OK' : 'Última validação: falhou')
      : 'Aguardando primeira validação'

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">Selo</div>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={status} />
            <div className="text-sm text-white font-medium truncate">{title}</div>
          </div>
          <div className="mt-2 text-sm text-gray-300">{subtitle}</div>
          <div className="mt-2 text-xs text-gray-500">Fonte: {sourceLabel}</div>
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-500">App ID</div>
          <div className="mt-2 text-sm text-white font-mono">{metaApp?.appId || '—'}</div>
          <div className="mt-2">
            <Link
              href="/settings"
              className="text-xs text-gray-300 underline hover:text-white transition-colors"
            >
              Configurar
            </Link>
          </div>
        </div>
      </div>

      {enabled && dbg?.attempted && dbg?.ok === false && dbg?.error != null ? (
        <div className="mt-4 text-xs text-gray-400">
          Detalhe: {typeof dbg.error === 'string' ? dbg.error : 'Falha ao validar via /debug_token'}
        </div>
      ) : null}
    </div>
  )
}

function formatJsonMaybe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isProblemStatus(s: MetaDiagnosticsCheckStatus) {
  return s === 'fail' || s === 'warn'
}

function bestApiAction(actions: MetaDiagnosticsAction[] | undefined) {
  const list = actions || []
  // preferimos API actions (um clique) antes de links
  const api = list.find((a) => a.kind === 'api')
  return api || null
}

function firstNextSteps(details: Record<string, unknown> | undefined) {
  const v = (details as any)?.nextSteps
  if (!Array.isArray(v)) return []
  return v.filter((x: any) => typeof x === 'string').slice(0, 4) as string[]
}

function scrollToCheck(checkId: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(`check-${checkId}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function getFriendlyCopy(check: MetaDiagnosticsCheck): { title: string; message: string; why?: string } {
  const overall = String((check.details as any)?.overall || '')

  // Traduções por ID (mantemos o técnico nos detalhes, mas o texto principal vira “humano”).
  switch (check.id) {
    case 'creds':
      return {
        title: 'Credenciais do WhatsApp (token e IDs)',
        message:
          check.status === 'pass'
            ? 'Configurado. Se algo falhar, normalmente é permissão/atribuição do token.'
            : 'Falta configurar token + WABA ID + Phone Number ID em Ajustes.',
        why: 'Sem isso, não dá pra consultar a Meta nem enviar mensagens.',
      }

    case 'infra_supabase':
      return {
        title: 'Banco de dados (Supabase)',
        message: check.status === 'pass' ? 'OK. Banco conectado.' : 'Banco não está configurado corretamente.',
        why: 'O app salva configurações e resultados de envio no Supabase.',
      }

    case 'infra_qstash':
      return {
        title: 'Fila de envio (QStash)',
        message:
          check.status === 'pass'
            ? 'OK. Envio em lote/campanhas pode funcionar.'
            : 'Não configurado. Campanhas podem falhar para enfileirar.',
        why: 'Campanhas usam fila para enviar com estabilidade.',
      }

    case 'meta_health_status':
      return {
        title: 'Posso enviar agora?',
        message:
          overall === 'AVAILABLE'
            ? 'Sim. A Meta diz que o envio está liberado.'
            : overall === 'LIMITED'
              ? 'Parcialmente. A Meta diz que o envio está limitado.'
              : overall === 'BLOCKED'
                ? 'Não. A Meta confirma bloqueio para envio.'
                : 'Não foi possível confirmar pela Meta (Health Status indisponível).',
        why: 'Esse é o “veredito oficial” da Meta sobre envio.',
      }

    case 'meta_debug_token':
      return {
        title: 'Token é válido? (validação forte)',
        message:
          check.status === 'pass'
            ? 'Sim. Validado via /debug_token.'
            : check.status === 'fail'
              ? 'Não. A Meta marcou o token como inválido.'
              : check.status === 'warn'
                ? 'Não conseguimos validar (best-effort).'
                : 'Opcional. Configure Meta App ID/Secret para validar com prova.',
        why: 'Evita “achismo” sobre expiração/permissões do token.',
      }

    case 'meta_token_scopes':
      return {
        title: 'Token tem permissões do WhatsApp?',
        message:
          check.status === 'pass'
            ? 'Sim. Escopos principais presentes.'
            : check.status === 'fail'
              ? 'Não. Faltam permissões essenciais para envio.'
              : 'Pode estar faltando alguma permissão. Veja o passo a passo.',
        why: 'Sem esses escopos, a Meta bloqueia chamadas e envios.',
      }

    case 'meta_token_app_id':
      return {
        title: 'Token é do App certo?',
        message:
          check.status === 'warn'
            ? 'Parece que o token foi gerado em outro App da Meta.'
            : check.message,
        why: 'Misturar apps diferentes é causa comum de erro 100/33.',
      }

    case 'meta_subscription_messages':
      return {
        title: 'Receber status (delivered/read) no webhook',
        message:
          check.status === 'pass'
            ? 'Ativo. Você deve receber eventos de mensagem (quando a Meta enviar).'
            : check.status === 'fail'
              ? 'Desativado. Você NÃO vai receber delivered/read.'
              : 'Não deu para confirmar. Veja detalhes.',
        why: 'Sem “messages” inscrito, a Meta não manda os status para o seu webhook.',
      }

    case 'meta_waba_phone_link':
      return {
        title: 'WABA e número combinam?',
        message:
          check.status === 'pass'
            ? 'Sim. O número aparece dentro do WABA.'
            : check.status === 'fail'
              ? 'Não. IDs podem estar trocados ou o token não enxerga o ativo.'
              : 'Não deu para confirmar.',
        why: 'Se WABA/Phone não “batem”, o envio falha mesmo com token “parecendo certo”.',
      }

    case 'meta_phone':
      return {
        title: 'Número está acessível (qualidade/tier)',
        message: check.status === 'pass' ? 'OK. Conseguimos ler dados do número.' : 'Não conseguimos ler o número.',
        why: 'Se o token não tem acesso ao número, o envio não funciona.',
      }

    case 'meta_waba':
      return {
        title: 'WABA está acessível',
        message: check.status === 'pass' ? 'OK. Conseguimos ler dados do WABA.' : 'Não conseguimos ler o WABA.',
        why: 'Se o token não tem acesso ao WABA, nada do WhatsApp funciona.',
      }

    case 'meta_templates':
      return {
        title: 'Templates (aprovados)',
        message: check.status === 'pass' ? check.message : 'Não encontramos templates (ou token sem acesso).',
        why: 'Para enviar template, ele precisa existir/aprovar na Meta.',
      }

    case 'internal_recent_failures':
      return {
        title: 'Falhas recentes (histórico)',
        message: check.message,
        why: 'Ajuda a ver padrões (pagamento, token, rate limit etc.).',
      }

    case 'internal_last_status_update':
      return {
        title: 'Atividade do sistema',
        message: check.message,
        why: 'Se não houver atividade, pode ser falta de envios/testes.',
      }

    case 'webhook_expected':
      return {
        title: 'Webhook configurado no painel da Meta',
        message: 'Use esta URL no WhatsApp Manager/App para receber eventos.',
        why: 'Se o webhook estiver errado, você não recebe eventos de mensagens.',
      }
  }

  if (check.id.startsWith('meta_access_')) {
    return {
      title: 'Token tem acesso ao ativo?',
      message:
        check.status === 'pass'
          ? 'Sim. O token consegue ler o ativo.'
          : 'Não. Geralmente é ID errado ou falta atribuição do ativo ao token (System User).',
      why: 'Erro 100/33 quase sempre cai aqui.',
    }
  }

  // fallback
  return { title: check.title, message: check.message }
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'fail' | 'neutral'; children: React.ReactNode }) {
  const base = 'inline-flex items-center px-2 py-1 rounded-lg text-xs font-mono border'
  if (tone === 'ok') return <span className={`${base} bg-emerald-500/10 border-emerald-500/20 text-emerald-200`}>{children}</span>
  if (tone === 'warn') return <span className={`${base} bg-amber-500/10 border-amber-500/20 text-amber-200`}>{children}</span>
  if (tone === 'fail') return <span className={`${base} bg-red-500/10 border-red-500/20 text-red-200`}>{children}</span>
  return <span className={`${base} bg-white/5 border-white/10 text-gray-200`}>{children}</span>
}

function TokenValidityCard({ data, checks }: { data?: MetaDiagnosticsResponse; checks: MetaDiagnosticsCheck[] }) {
  const dbgEnabled = Boolean(data?.debugTokenValidation?.enabled)

  const dbgCheck = checks.find((c) => c.id === 'meta_debug_token')
  const meCheck = checks.find((c) => c.id === 'meta_me')

  const dbgAttempted = Boolean(data?.debugTokenValidation?.attempted)
  const dbgOk = data?.debugTokenValidation?.ok
  const dbgIsValid = data?.debugTokenValidation?.isValid

  const status: MetaDiagnosticsCheckStatus = (() => {
    // Preferimos a “prova” do /debug_token quando habilitado.
    if (dbgEnabled && dbgAttempted) {
      if (dbgOk === true && dbgIsValid === true) return 'pass'
      if (dbgOk === true && dbgIsValid === false) return 'fail'
      if (dbgOk === false) return 'warn'
    }

    // Fallback: /me indica que o token ao menos autentica.
    if (meCheck?.status === 'pass') return dbgEnabled ? 'warn' : 'info'
    if (meCheck?.status === 'fail') return 'fail'

    return 'info'
  })()

  const title = 'Token de acesso'

  const subtitle = (() => {
    if (dbgEnabled && dbgAttempted) {
      if (dbgOk === true && dbgIsValid === true) return 'Válido (confirmado pela Meta via /debug_token)'
      if (dbgOk === true && dbgIsValid === false) return 'Inválido (confirmado pela Meta via /debug_token)'
      return 'Não foi possível confirmar via /debug_token (best-effort)'
    }

    if (meCheck?.status === 'pass') {
      return dbgEnabled
        ? 'Autentica via /me, mas ainda não confirmamos /debug_token'
        : 'Autentica via /me, mas não dá pra provar escopos/expiração sem /debug_token'
    }
    if (meCheck?.status === 'fail') return 'Falha ao autenticar (/me) — token pode estar inválido/expirado'
    return 'Sem informação suficiente (ainda carregando ou chamada falhou)'
  })()

  const nextSteps = (() => {
    if (dbgEnabled && dbgAttempted && dbgOk === true && dbgIsValid === false) {
      return [
        'Gere um novo token (recomendado: System User no Business Manager).',
        'Antes de gerar, atribua os ativos (WABA + Phone Number) ao System User.',
        'Salve o token em Ajustes e clique em “Atualizar”.',
      ]
    }

    if (!dbgEnabled) {
      return [
        'Opcional (recomendado): configure Meta App ID/Secret em Ajustes para habilitar /debug_token.',
        'Com /debug_token ativo, você vê validade, expiração e escopos com prova (menos suporte).',
      ]
    }

    if (dbgEnabled && (!dbgAttempted || (dbgAttempted && dbgOk !== true))) {
      return [
        'Clique em “Atualizar” para tentar validar novamente via /debug_token.',
        'Se falhar, confira se Meta App ID/Secret estão corretos em Ajustes.',
      ]
    }

    // Se chegou aqui, o token parece ok.
    return [
      'Se ainda “não envia”, confira permissões (escopos) e acesso ao WABA/Phone Number nos checks abaixo.',
    ]
  })()

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">Token</div>
          <div className="mt-2 text-sm text-white font-medium">{title}</div>
          <div className="mt-2 text-sm text-gray-300">{subtitle}</div>
          {dbgEnabled ? (
            <div className="mt-2 text-xs text-gray-500">
              Fonte: <span className="font-mono">/debug_token</span> (quando disponível) + <span className="font-mono">/me</span>
            </div>
          ) : (
            <div className="mt-2 text-xs text-gray-500">
              Fonte: <span className="font-mono">/me</span> (best-effort). Para prova de escopos/expiração, habilite <span className="font-mono">/debug_token</span>.
            </div>
          )}
        </div>
        <div className="shrink-0">
          <StatusBadge status={status} />
        </div>
      </div>

      {nextSteps.length > 0 && (
        <div className="mt-4 bg-zinc-900/40 border border-white/10 rounded-xl p-4">
          <div className="text-sm text-white font-semibold">O que fazer</div>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-gray-200">
            {nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          {!dbgEnabled && (
            <div className="mt-3 text-xs text-gray-400">
              Ir para <Link href="/settings" className="underline">Ajustes</Link> para configurar Meta App.
            </div>
          )}
        </div>
      )}

      {(dbgCheck?.details || meCheck?.details) && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-gray-400 hover:text-white transition-colors">
            Ver detalhes técnicos
          </summary>
          <pre className="mt-3 text-xs bg-zinc-950/50 border border-white/10 rounded-xl p-4 overflow-auto text-gray-200">
            {formatJsonMaybe({
              debug_token: dbgCheck?.details || null,
              me: meCheck?.details || null,
            })}
          </pre>
        </details>
      )}
    </div>
  )
}

function TokenScopesCard({ data, checks }: { data?: MetaDiagnosticsResponse; checks: MetaDiagnosticsCheck[] }) {
  const dbgEnabled = Boolean(data?.debugTokenValidation?.enabled)
  const scopesCheck = checks.find((c) => c.id === 'meta_token_scopes')
  const mePermsCheck = checks.find((c) => c.id === 'meta_permissions')

  const required = Array.isArray((scopesCheck?.details as any)?.required)
    ? ((scopesCheck?.details as any).required as unknown[]).filter((x) => typeof x === 'string') as string[]
    : ['whatsapp_business_messaging', 'whatsapp_business_management']

  const foundScopes = Array.isArray((scopesCheck?.details as any)?.scopes)
    ? ((scopesCheck?.details as any).scopes as unknown[]).filter((x) => typeof x === 'string') as string[]
    : []

  const missing = Array.isArray((scopesCheck?.details as any)?.missing)
    ? ((scopesCheck?.details as any).missing as unknown[]).filter((x) => typeof x === 'string') as string[]
    : required.filter((r) => !foundScopes.includes(r))

  const granted = Array.isArray((mePermsCheck?.details as any)?.granted)
    ? ((mePermsCheck?.details as any).granted as unknown[]).filter((x) => typeof x === 'string') as string[]
    : []

  const verificationMode: 'debug_token' | 'me_permissions' | 'unknown' =
    foundScopes.length > 0
      ? 'debug_token'
      : granted.length > 0
        ? 'me_permissions'
        : 'unknown'

  const missingCritical = missing.includes('whatsapp_business_messaging')

  const cardStatus: MetaDiagnosticsCheckStatus = (() => {
    if (verificationMode === 'unknown') return 'info'
    return missing.length === 0 ? 'pass' : (missingCritical ? 'fail' : 'warn')
  })()

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">Token</div>
          <div className="mt-2 text-sm text-white font-medium">Permissões (escopos) — checklist</div>
          <div className="mt-2 text-sm text-gray-300">
            Aqui você vê <b>o que conseguimos verificar</b> sobre escopos e o que é necessário para o SmartZap funcionar.
          </div>
        </div>
        <div className="shrink-0">
          <StatusBadge status={cardStatus} />
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-gray-400">Necessárias</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {required.map((s) => {
            const ok = foundScopes.includes(s) || granted.includes(s)
            const tone: 'ok' | 'warn' | 'fail' | 'neutral' =
              verificationMode === 'unknown' ? 'neutral' : (ok ? 'ok' : 'fail')
            return <Pill key={s} tone={tone}>{s}</Pill>
          })}
        </div>
        {verificationMode === 'unknown' && (
          <div className="mt-3 text-xs text-gray-400">
            Ainda não conseguimos listar os escopos desse token. Isso acontece quando <span className="font-mono">/debug_token</span> não está habilitado e <span className="font-mono">/me/permissions</span> não retorna dados para este tipo de token.
          </div>
        )}
      </div>

      {verificationMode !== 'unknown' && missing.length > 0 && (
        <div className="mt-4 bg-zinc-900/40 border border-white/10 rounded-xl p-4">
          <div className="text-sm text-white font-semibold">Faltando</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((s) => (
              <Pill key={s} tone={missingCritical && s === 'whatsapp_business_messaging' ? 'fail' : 'warn'}>{s}</Pill>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-400">
            Dica: se você gerou token de <b>System User</b>, confirme também se os ativos (WABA + Phone Number) foram atribuídos ao usuário do sistema.
          </div>
        </div>
      )}

      <details className="mt-4 bg-zinc-900/30 border border-white/10 rounded-xl p-4">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
          <div className="text-sm text-white">Ver detalhes (para suporte)</div>
          <ChevronDown size={16} className="text-gray-400" />
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-xs text-gray-400">Fonte principal</div>
            <div className="mt-1 text-sm text-gray-200">
              {verificationMode === 'debug_token'
                ? 'debug_token (recomendado)'
                : verificationMode === 'me_permissions'
                  ? '/me/permissions (best-effort)'
                  : dbgEnabled
                    ? 'debug_token (habilitado, mas não retornou escopos)'
                    : 'indisponível (não conseguimos listar escopos)'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Escopos encontrados</div>
            {foundScopes.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {foundScopes.map((s) => (<Pill key={s} tone={required.includes(s) ? 'neutral' : 'neutral'}>{s}</Pill>))}
              </div>
            ) : (
              <div className="mt-1 text-sm text-gray-400">—</div>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-400">/me/permissions (quando disponível)</div>
            {granted.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {granted.map((s) => (<Pill key={s} tone={'neutral'}>{s}</Pill>))}
              </div>
            ) : (
              <div className="mt-1 text-sm text-gray-400">—</div>
            )}
          </div>
        </div>
      </details>

      {!dbgEnabled && (
        <div className="mt-4 text-xs text-gray-400">
          Para ver escopos com prova (recomendado), habilite <b>Meta App ID/Secret</b> em <Link href="/settings" className="underline">Ajustes</Link>.
        </div>
      )}
    </div>
  )
}

type Simulate10033Response =
  | { ok: true; simulated: true; attempt?: { objectId?: string; status?: number }; result?: { graphOk?: boolean; normalizedError?: { message?: string; code?: number | null; subcode?: number | null; fbtraceId?: string | null; type?: string | null } } }
  | { ok: false; error: string; details?: any }

function Simulate10033Card() {
  const [isRunning, setIsRunning] = React.useState(false)
  const [result, setResult] = React.useState<Simulate10033Response | null>(null)

  const run = React.useCallback(async () => {
    setIsRunning(true)
    try {
      const res = await fetch('/api/meta/diagnostics/simulate-10033', { method: 'POST' })
      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setResult({ ok: false, error: (json as any)?.error || 'Falha ao simular', details: (json as any)?.details || null })
        return
      }
      setResult(json as Simulate10033Response)
    } catch (e) {
      setResult({ ok: false, error: 'Falha ao simular (rede/navegador).', details: { message: e instanceof Error ? e.message : String(e) } })
    } finally {
      setIsRunning(false)
    }
  }, [])

  const normalized = (result as any)?.result?.normalizedError || null

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">Simulador</div>
          <div className="mt-2 text-sm text-white font-medium">Reproduzir erro 100/33 (sem enviar mensagem)</div>
          <div className="mt-2 text-sm text-gray-300">
            Útil pra aula/suporte: dispara o erro clássico de “ID/permissão” sem risco de mandar mensagem.
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={isRunning}
          className="px-3 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          title="Executa um POST inválido em /{WABA_ID}/messages para gerar 100/33"
        >
          <Wand2 size={14} /> {isRunning ? 'Simulando…' : 'Simular agora'}
        </button>
      </div>

      {result && (
        <div className="mt-4 bg-zinc-900/40 border border-white/10 rounded-xl p-4">
          {result.ok === false ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white font-semibold">Falhou</div>
                <StatusBadge status="fail" />
              </div>
              <div className="mt-2 text-sm text-gray-200">{result.error}</div>
              {result.details && (
                <pre className="mt-3 text-xs text-gray-300 overflow-auto whitespace-pre-wrap">{formatJsonMaybe(result.details)}</pre>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white font-semibold">Resultado</div>
                <StatusBadge status="pass" />
              </div>
              <div className="mt-2 text-sm text-gray-200">
                Endpoint testado: <span className="font-mono">/{'{'}WABA_ID{'}'}/messages</span> · status HTTP: <span className="font-mono">{String((result as any)?.attempt?.status ?? '—')}</span>
              </div>
              {normalized?.message && (
                <div className="mt-3 text-sm text-gray-200">
                  <div><span className="text-gray-400">Mensagem:</span> {String(normalized.message)}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Pill tone="neutral">code: {String(normalized.code ?? '—')}</Pill>
                    <Pill tone="neutral">subcode: {String(normalized.subcode ?? '—')}</Pill>
                    {normalized.fbtraceId ? <Pill tone="neutral">fbtrace_id: {String(normalized.fbtraceId)}</Pill> : null}
                  </div>
                </div>
              )}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-200 underline">Ver resposta bruta da Meta</summary>
                <pre className="mt-3 text-xs text-gray-300 overflow-auto whitespace-pre-wrap">{formatJsonMaybe((result as any)?.result || null)}</pre>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function QuickStartCard(props: {
  checks: MetaDiagnosticsCheck[]
  onRunAction: (a: MetaDiagnosticsAction) => void
  isActing: boolean
  lockedNow: boolean
  lockedReason?: string
  simpleMode?: boolean
}) {
  const problems = React.useMemo(() => {
    const p = (props.checks || []).filter((c) => isProblemStatus(c.status))
    // já vem ordenado pelo controller, mas garantimos stable.
    return p
  }, [props.checks])

  const items = problems.slice(0, 3)

  if (problems.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-gray-500">O que fazer agora</div>
            <div className="mt-2 text-sm text-white font-medium">Tudo certo por aqui</div>
            <div className="mt-2 text-sm text-gray-300">
              Não encontramos falhas/alertas no diagnóstico. Se ainda assim “não envia”, use o Support Packet e envie pro suporte.
            </div>
          </div>
          <div className="text-gray-300">
            <ListChecks size={18} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-gray-500">O que fazer agora</div>
          <div className="mt-2 text-sm text-white font-medium">Siga estes passos (ordem recomendada)</div>
          <div className="mt-2 text-sm text-gray-300">
            Pegamos os itens que mais destravam alunos (falhas/atenções) e colocamos em ordem.
          </div>
        </div>
        <div className="text-gray-300">
          <ListChecks size={18} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((c, idx) => {
          const action = bestApiAction(c.actions)
          const steps = firstNextSteps(c.details)
          const friendly = props.simpleMode ? getFriendlyCopy(c) : { title: c.title, message: c.message }
          return (
            <div key={c.id} className="bg-zinc-900/40 border border-white/10 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-500">Passo {idx + 1}</div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-2 text-sm text-white font-semibold truncate">{friendly.title}</div>
                  <div className="mt-1 text-sm text-gray-300">{friendly.message}</div>

                  {steps.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-gray-200">
                      {steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  {action && (
                    <button
                      type="button"
                      onClick={() => props.onRunAction(action)}
                      disabled={props.isActing || props.lockedNow}
                      className="px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-medium transition-colors text-sm inline-flex items-center gap-2 disabled:opacity-50"
                      title={props.lockedNow ? (props.lockedReason || 'Bloqueado pela Meta') : undefined}
                    >
                      <Wand2 size={14} /> {action.label}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => scrollToCheck(c.id)}
                    className="px-3 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-sm font-medium"
                  >
                    Ver detalhes
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {problems.length > 3 && (
        <div className="mt-4 text-xs text-gray-500">
          Mais itens: {problems.length - 3}. Use o filtro “Problemas” ou “Com ações” abaixo.
        </div>
      )}
    </div>
  )
}

function NextSteps({ value }: { value: unknown }) {
  const steps = Array.isArray(value) ? (value as unknown[]) : null
  if (!steps || steps.length === 0) return null

  return (
    <div className="mt-3">
      <div className="text-xs text-gray-400">Passo a passo sugerido</div>
      <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-gray-200">
        {steps.map((s, idx) => (
          <li key={idx}>{typeof s === 'string' ? s : formatJsonMaybe(s)}</li>
        ))}
      </ul>
    </div>
  )
}

function ActionButtons(props: {
  actions: MetaDiagnosticsAction[]
  onRunAction: (a: MetaDiagnosticsAction) => void
  disabled?: boolean
  disabledReason?: string
}) {
  const { actions } = props
  if (!actions?.length) return null

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((a) => {
        if (a.kind === 'link' && a.href) {
          return (
            <Link
              key={a.id}
              href={a.href}
              className="px-3 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-sm font-medium inline-flex items-center gap-2"
            >
              <ExternalLink size={14} />
              {a.label}
            </Link>
          )
        }

        if (a.kind === 'api') {
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => props.onRunAction(a)}
              disabled={props.disabled}
              className="px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-medium transition-colors text-sm inline-flex items-center gap-2 disabled:opacity-50"
              title={
                props.disabled
                  ? props.disabledReason || 'Ação temporariamente indisponível'
                  : a.endpoint
                    ? `${a.method || 'POST'} ${a.endpoint}`
                    : undefined
              }
            >
              <Wand2 size={14} />
              {a.label}
            </button>
          )
        }

        return null
      })}
    </div>
  )
}

export function MetaDiagnosticsView(props: {
  data?: MetaDiagnosticsResponse
  checks: MetaDiagnosticsCheck[]
  filteredChecks: MetaDiagnosticsCheck[]
  counts: { pass: number; warn: number; fail: number; info: number }
  overall: MetaDiagnosticsCheckStatus
  isLoading: boolean
  isFetching: boolean
  filter: 'all' | 'actionable' | 'problems'
  setFilter: (v: 'all' | 'actionable' | 'problems') => void
  onRefresh: () => void
  onRunAction: (a: MetaDiagnosticsAction) => void
  isActing: boolean
}) {
  const [simpleMode, setSimpleMode] = React.useState(true)
  const reportText = props.data?.report?.text || ''
  const supportPacketText = props.data?.report?.supportPacketText || reportText
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 1800 })
  const lock = React.useMemo(() => hasMetaBusinessLockedEvidence(props.checks), [props.checks])
  const apiActionsDisabled = props.isActing || lock.kind === 'current'
  const lockedNow = lock.kind === 'current'

  const hasGraph100_33 = React.useMemo(() => {
    const checks = props.checks || []
    for (const c of checks) {
      const err = (c as any)?.details?.error
      const code = Number(err?.code ?? err?.error?.code)
      const sub = Number(err?.error_subcode ?? err?.error?.error_subcode)
      if (code === 100 && sub === 33) return true
    }
    return false
  }, [props.checks])

  const hasGraph190 = React.useMemo(() => {
    const checks = props.checks || []
    for (const c of checks) {
      const err = (c as any)?.details?.error
      const code = Number(err?.code ?? err?.error?.code)
      if (code === 190) return true
    }
    return false
  }, [props.checks])

  const hasSignal131042 = React.useMemo(() => {
    // pode aparecer em falhas recentes (internal_recent_failures.top[]) ou em detalhes de health_status
    for (const c of props.checks || []) {
      if (c.id === 'internal_recent_failures') {
        const top = (c.details as any)?.top
        if (Array.isArray(top) && top.some((x: any) => Number(x?.code) === 131042)) return true
      }
      if (c.id === 'meta_health_status') {
        const errors = Array.isArray((c.details as any)?.errors) ? ((c.details as any).errors as any[]) : []
        if (errors.some((e) => Number(e?.error_code) === 131042)) return true
      }
    }
    return false
  }, [props.checks])

  const hasSignal131056 = React.useMemo(() => {
    for (const c of props.checks || []) {
      if (c.id === 'internal_recent_failures') {
        const top = (c.details as any)?.top
        if (Array.isArray(top) && top.some((x: any) => Number(x?.code) === 131056)) return true
      }
      const err = (c as any)?.details?.error
      const code = Number(err?.code ?? err?.error?.code)
      if (code === 131056) return true
    }
    return false
  }, [props.checks])

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Diagnóstico Meta</PageTitle>
          <PageDescription>
            Responde em linguagem simples: <b>posso enviar?</b> <b>meu token está ok?</b> <b>vou receber delivered/read?</b>
          </PageDescription>
        </div>

        <PageActions>
          <PrefetchLink
            href="/settings"
            className="px-4 py-2 rounded-xl bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-sm font-medium flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Voltar
          </PrefetchLink>

          <button
            onClick={() => copyToClipboard(reportText)}
            disabled={!reportText}
            className="px-4 py-2 rounded-xl bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            title={reportText ? 'Copiar relatório resumido (redigido)' : 'Relatório indisponível'}
          >
            <Copy size={16} />
            {isCopied ? 'Copiado!' : 'Copiar relatório'}
          </button>

          <button
            onClick={props.onRefresh}
            className="px-4 py-2 rounded-xl bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-sm font-medium flex items-center gap-2"
            title="Atualizar"
          >
            <RefreshCw size={16} className={props.isFetching ? 'animate-spin' : ''} />
            {props.isFetching ? 'Atualizando…' : 'Atualizar'}
          </button>
        </PageActions>
      </PageHeader>

      {/* Selos / atalhos para reduzir suporte */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <HealthStatusSeal checks={props.checks} />
        <TokenExpirySeal data={props.data} checks={props.checks} />
        <DebugTokenSeal data={props.data} />

        <div className="glass-panel rounded-2xl p-6">
          <div className="text-xs text-gray-500">Atalho</div>
          <div className="mt-2 text-sm text-white font-medium">Support Packet</div>
          <div className="mt-2 text-sm text-gray-300">
            1 clique pra copiar um pacote pronto (inclui <span className="font-mono">fbtrace_id</span> quando existir).
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => copyToClipboard(supportPacketText)}
              disabled={!supportPacketText}
              className="px-3 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
              title={supportPacketText ? 'Copiar packet completo' : 'Indisponível'}
            >
              <LifeBuoy size={14} /> {isCopied ? 'Copiado!' : 'Copiar packet'}
            </button>
            <button
              onClick={() => copyToClipboard(reportText)}
              disabled={!reportText}
              className="px-3 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
              title={reportText ? 'Copiar resumo' : 'Indisponível'}
            >
              <Copy size={14} /> Resumo
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <QuickStartCard
          checks={props.checks}
          onRunAction={props.onRunAction}
          isActing={props.isActing}
          lockedNow={lockedNow}
          simpleMode={simpleMode}
          lockedReason={
            lockedNow
              ? `Bloqueado pela Meta (código ${META_BUSINESS_LOCKED_CODE}). Resolva no Business Manager e tente novamente.`
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <TokenValidityCard data={props.data} checks={props.checks} />
        <TokenScopesCard data={props.data} checks={props.checks} />
      </div>

      <details className="glass-panel rounded-2xl p-6 mb-6">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-gray-500">Ferramentas avançadas</div>
            <div className="mt-1 text-sm text-white">Simuladores e debug para suporte/aula</div>
          </div>
          <ChevronDown size={16} className="text-gray-400" />
        </summary>
        <div className="mt-4">
          <Simulate10033Card />
        </div>
      </details>

      {hasGraph100_33 && (
        <div className="glass-panel rounded-2xl p-6 border border-amber-500/20 bg-amber-500/5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 text-amber-300" size={18} />
            <div className="min-w-0">
              <div className="text-white font-semibold">Como interpretar: erro 100 (subcode 33)</div>
              <div className="text-sm text-gray-200/90 mt-1">
                Esse erro quase sempre significa: <b>ID incorreto</b> OU <b>token sem acesso ao ativo</b> (WABA/PHONE_NUMBER).
                Normalmente é permissão/atribuição — não é “bloqueio de conta”.
              </div>
              <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-gray-200">
                <li>Confirme se o <b>phone_number_id</b> e o <b>waba_id</b> foram copiados do WhatsApp Manager correto.</li>
                <li>Gere um token do <b>System User</b> e atribua os ativos (WABA + Phone Number) no Business Manager.</li>
                <li>Garanta os escopos <span className="font-mono">whatsapp_business_messaging</span> e <span className="font-mono">whatsapp_business_management</span>.</li>
                <li>Volte aqui e clique em <b>Atualizar</b>.</li>
              </ul>
              <div className="mt-3 text-xs text-gray-400">
                Dica: configurando <b>Meta App ID/Secret</b> em Configurações, o diagnóstico consegue validar escopos e origem do token via <span className="font-mono">/debug_token</span>.
              </div>
            </div>
          </div>
        </div>
      )}

      {hasGraph190 && (
        <div className="glass-panel rounded-2xl p-6 border border-red-500/20 bg-red-500/5 mb-6">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 text-red-300" size={18} />
            <div className="min-w-0">
              <div className="text-white font-semibold">Como interpretar: erro 190 (token inválido)</div>
              <div className="text-sm text-gray-200/90 mt-1">
                Esse erro indica token expirado/invalidado, token copiado errado ou token sem permissão (às vezes aparece como “Session has expired”).
              </div>
              <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-gray-200">
                <li>Gere um novo token (recomendado: <b>System User</b> no Business Manager).</li>
                <li>Atribua os ativos (WABA + Phone Number) ao System User antes de gerar o token.</li>
                <li>Garanta os escopos <span className="font-mono">whatsapp_business_messaging</span> e <span className="font-mono">whatsapp_business_management</span>.</li>
                <li>Atualize o token em <b>Ajustes</b> e rode o diagnóstico novamente.</li>
              </ul>
              <div className="mt-3 text-xs text-gray-400">
                Dica: com <span className="font-mono">debug_token</span> habilitado, você vê expiração/escopos com prova.
              </div>
            </div>
          </div>
        </div>
      )}

      {hasSignal131042 && (
        <div className="glass-panel rounded-2xl p-6 border border-amber-500/20 bg-amber-500/5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 text-amber-300" size={18} />
            <div className="min-w-0">
              <div className="text-white font-semibold">Como interpretar: erro 131042 (pagamento/conta)</div>
              <div className="text-sm text-gray-200/90 mt-1">
                Esse código costuma aparecer quando há problema de pagamento ou restrição de conta no Business Manager. É Meta-side.
              </div>
              <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-gray-200">
                <li>Abra o <b>Business Manager</b> e verifique alertas de cobrança/pagamento.</li>
                <li>Confirme se o WABA está verificado e sem pendências de revisão.</li>
                <li>Após corrigir, rode o diagnóstico e faça um envio de teste.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {hasSignal131056 && (
        <div className="glass-panel rounded-2xl p-6 border border-amber-500/20 bg-amber-500/5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 text-amber-300" size={18} />
            <div className="min-w-0">
              <div className="text-white font-semibold">Como interpretar: erro 131056 (rate limit por par)</div>
              <div className="text-sm text-gray-200/90 mt-1">
                A Meta limita envio para o mesmo usuário (pair rate limit). Isso não é “bloqueio”, é limite temporário.
              </div>
              <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-gray-200">
                <li>Evite mandar múltiplas mensagens em sequência para o mesmo número em poucos segundos.</li>
                <li>Se for fluxo/campanha, aplique delay/backoff e re-tente com espaçamento.</li>
                <li>Rode novamente depois de alguns minutos.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-gray-500">Status geral</div>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={props.overall} />
                <span className="text-xs text-gray-400">({props.checks.length} checks)</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Falhas / Atenções</div>
              <div className="mt-2 text-sm text-white font-medium">
                <span className="text-red-200">{props.counts.fail}</span>
                <span className="text-gray-500"> / </span>
                <span className="text-amber-200">{props.counts.warn}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
            <div className="bg-zinc-900/40 border border-white/10 rounded-lg p-2">
              <div className="text-gray-500">OK</div>
              <div className="mt-1 text-white font-medium">{props.counts.pass}</div>
            </div>
            <div className="bg-zinc-900/40 border border-white/10 rounded-lg p-2">
              <div className="text-gray-500">Info</div>
              <div className="mt-1 text-white font-medium">{props.counts.info}</div>
            </div>
            <div className="bg-zinc-900/40 border border-amber-500/20 rounded-lg p-2">
              <div className="text-amber-200">Atenção</div>
              <div className="mt-1 text-white font-medium">{props.counts.warn}</div>
            </div>
            <div className="bg-zinc-900/40 border border-red-500/20 rounded-lg p-2">
              <div className="text-red-200">Falha</div>
              <div className="mt-1 text-white font-medium">{props.counts.fail}</div>
            </div>
          </div>
        </div>

        <details className="glass-panel rounded-2xl p-6 lg:col-span-2">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-gray-500">Painel técnico</div>
              <div className="mt-1 text-sm text-white">Ambiente + webhook + ids de deploy</div>
            </div>
            <ChevronDown size={16} className="text-gray-400" />
          </summary>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-zinc-900/40 border border-white/10 rounded-xl p-4">
              <div className="text-xs text-gray-500">Ambiente</div>
              <div className="mt-2 text-sm text-white">
                {(props.data?.env as any)?.vercelEnv || '—'}
              </div>
              <div className="mt-3 text-xs text-gray-400 space-y-1">
                <div>
                  <span className="text-gray-500">Deploy:</span>{' '}
                  <span className="font-mono text-white/90">{((props.data?.env as any)?.deploymentId as string) || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Commit:</span>{' '}
                  <span className="font-mono text-white/90">{((props.data?.env as any)?.gitCommitSha as string)?.slice?.(0, 7) || '—'}</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/40 border border-white/10 rounded-xl p-4">
              <div className="text-xs text-gray-500">Webhook (URL esperada)</div>
              <div className="mt-2 text-sm text-white font-mono break-all">
                {props.data?.webhook?.expectedUrl || '—'}
              </div>
              <div className="mt-3 text-xs text-gray-400">
                Verify token:{' '}
                <span className="font-mono text-white/90">{props.data?.webhook?.verifyTokenPreview || '—'}</span>
              </div>
            </div>
          </div>
        </details>
      </div>

      {lock.kind !== 'none' && (
        <div
          className={`mt-4 glass-panel rounded-2xl p-6 border ${
            lock.kind === 'current'
              ? 'border-red-500/20 bg-red-500/5'
              : 'border-amber-500/20 bg-amber-500/5'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusBadge status={lock.kind === 'current' ? 'fail' : 'warn'} />
                <h3 className="text-sm font-semibold text-white truncate">
                  {lock.kind === 'current'
                    ? `Bloqueio atual detectado (código ${META_BUSINESS_LOCKED_CODE})`
                    : `Sinal histórico de bloqueio (código ${META_BUSINESS_LOCKED_CODE})`}
                </h3>
              </div>
              <div className="mt-2 text-sm text-gray-200">
                {lock.kind === 'current'
                  ? 'O Health Status da Meta indica BLOQUEIO na cadeia de envio (APP/BUSINESS/WABA/PHONE/TEMPLATE). Enquanto isso estiver ativo, ações e envios podem falhar — não há “auto-fix” via API aqui dentro.'
                  : 'Detectamos o código 131031 em falhas recentes (últimos 7 dias), mas o Health Status atual não está bloqueado. Isso pode ter sido temporário ou relacionado a uma tentativa antiga.'}
              </div>
              <div className="mt-3 text-sm text-gray-300 space-y-1">
                <div>
                  <span className="text-gray-400">O que fazer:</span>
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Abra o Business Manager e verifique alertas de pagamento, verificação e qualidade da conta.</li>
                  {lock.kind === 'current' ? (
                    <>
                      <li>Se não houver caminho de auto-resolução, abra um chamado no suporte da Meta para desbloqueio do WABA.</li>
                      <li>Depois do desbloqueio, volte aqui e clique em “Atualizar” e então “Ativar messages”.</li>
                    </>
                  ) : (
                    <>
                      <li>Se o problema voltar a acontecer, use o “Copiar relatório” e envie junto do <span className="font-mono">fbtrace_id</span> (quando houver) ao suporte da Meta.</li>
                      <li>Se o objetivo agora é receber delivered/read, foque em ativar <span className="font-mono">messages</span> em <span className="font-mono">subscribed_apps</span> (botão “Ativar messages”).</li>
                    </>
                  )}
                </ul>
              </div>
              <div className="mt-3 text-xs text-gray-400">
                Evidência: {lock.evidence?.source || 'diagnóstico'}
                {typeof lock.evidence?.count === 'number' ? ` (ocorrências: ${lock.evidence.count})` : ''}
              </div>
            </div>

            <div className="shrink-0">
              <button
                onClick={() => copyToClipboard(reportText)}
                disabled={!reportText}
                className="px-3 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                title={reportText ? 'Copiar relatório para suporte' : 'Relatório indisponível'}
              >
                <Copy size={14} />
                Copiar relatório
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="text-xs text-gray-400">Filtro:</div>
        {([
          { k: 'problems', label: 'Problemas' },
          { k: 'actionable', label: 'Com ações' },
          { k: 'all', label: 'Tudo' },
        ] as const).map((b) => (
          <button
            key={b.k}
            type="button"
            onClick={() => props.setFilter(b.k)}
            className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
              props.filter === b.k
                ? 'bg-white/10 text-white border-white/20'
                : 'bg-zinc-900/40 text-gray-300 border-white/10 hover:bg-white/5'
            }`}
          >
            {b.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setSimpleMode((v) => !v)}
          className={`ml-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
            simpleMode
              ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20'
              : 'bg-zinc-900/40 text-gray-300 border-white/10 hover:bg-white/5'
          }`}
          title={simpleMode ? 'Modo simples (recomendado)' : 'Modo técnico (para dev/suporte)'}
        >
          {simpleMode ? 'Modo simples: ON' : 'Modo simples: OFF'}
        </button>

        <div className="ml-auto text-xs text-gray-500">
          {props.isLoading ? 'Carregando…' : `${props.filteredChecks.length} itens`}
        </div>
      </div>

      {/* Checks */}
      <div className="space-y-3">
        {props.isLoading && (
          <div className="glass-panel rounded-2xl p-6 text-sm text-gray-400">
            Carregando diagnóstico…
          </div>
        )}

        {!props.isLoading && props.filteredChecks.length === 0 && (
          <div className="glass-panel rounded-2xl p-6 text-sm text-gray-400">
            Nenhum item nesse filtro.
          </div>
        )}

        {props.filteredChecks.map((c) => (
          <div key={c.id} id={`check-${c.id}`} className="glass-panel rounded-2xl p-6">
            {(() => {
              const friendly = simpleMode ? getFriendlyCopy(c) : { title: c.title, message: c.message }
              return (
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusBadge status={c.status} />
                  <h3 className="text-sm font-semibold text-white truncate">{friendly.title}</h3>
                </div>
                <div className="mt-2 text-sm text-gray-300">{friendly.message}</div>

                {simpleMode && friendly.why && (
                  <div className="mt-2 text-xs text-gray-500">Por que isso importa: {friendly.why}</div>
                )}

                <NextSteps value={(c.details as any)?.nextSteps} />

                <ActionButtons
                  actions={c.actions || []}
                  onRunAction={props.onRunAction}
                  disabled={apiActionsDisabled}
                  disabledReason={
                    lock.kind === 'current'
                      ? `Bloqueado pela Meta (código ${META_BUSINESS_LOCKED_CODE}). Resolva no Business Manager e tente novamente.`
                      : 'Executando ação…'
                  }
                />

                {c.details && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-xs text-gray-400 hover:text-white transition-colors">
                      {simpleMode ? 'Detalhes (para suporte)' : 'Ver detalhes técnicos'}
                    </summary>
                    <pre className="mt-3 text-xs bg-zinc-950/50 border border-white/10 rounded-xl p-4 overflow-auto text-gray-200">
                      {formatJsonMaybe(c.details)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
              )
            })()}
          </div>
        ))}
      </div>

      {/* Raw report (optional) */}
      {reportText && (
        <div className="glass-panel rounded-2xl p-6">
          <div className="text-xs text-gray-500">Relatório (resumo)</div>
          <pre className="mt-3 text-xs bg-zinc-950/50 border border-white/10 rounded-xl p-4 overflow-auto text-gray-200 whitespace-pre-wrap">
            {reportText}
          </pre>
        </div>
      )}
    </Page>
  )
}
