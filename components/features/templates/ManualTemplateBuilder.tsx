'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Code,
  Bold,
  Italic,
  Strikethrough,
  Plus,
  ChevronDown,
  Play,
  ExternalLink,
  CornerDownLeft,
  GripVertical,
  Loader2,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { flowsService } from '@/services/flowsService'

type Spec = any

type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT' | 'LOCATION'

type ButtonType =
  | 'QUICK_REPLY'
  | 'URL'
  | 'PHONE_NUMBER'
  | 'COPY_CODE'
  | 'OTP'
  | 'FLOW'
  | 'CATALOG'
  | 'MPM'
  | 'VOICE_CALL'
  | 'EXTENSION'
  | 'ORDER_DETAILS'
  | 'POSTBACK'
  | 'REMINDER'
  | 'SEND_LOCATION'
  | 'SPM'

function normalizeButtons(input: any[]): any[] {
  const list = Array.isArray(input) ? input : []
  const quickReplies = list.filter((b) => b?.type === 'QUICK_REPLY')
  const others = list.filter((b) => b?.type !== 'QUICK_REPLY')
  return [...quickReplies, ...others]
}

function countButtonsByType(buttons: any[], type: ButtonType): number {
  return (Array.isArray(buttons) ? buttons : []).filter((b) => b?.type === type).length
}

function countChars(value: unknown): number {
  return String(value ?? '').length
}

function clampText(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max)
}

function splitPhone(phone: string): { country: string; number: string } {
  const raw = String(phone || '').replace(/\s+/g, '')
  const digits = raw.replace(/\D+/g, '')
  if (!digits) return { country: '55', number: '' }
  if (digits.startsWith('55')) return { country: '55', number: digits.slice(2) }
  if (digits.startsWith('1')) return { country: '1', number: digits.slice(1) }
  return { country: '55', number: digits }
}

function joinPhone(country: string, number: string): string {
  const c = String(country || '').replace(/\D+/g, '')
  const n = String(number || '').replace(/\D+/g, '')
  return `${c}${n}`
}

const allowedHeaderFormats = new Set<HeaderFormat>(['TEXT', 'IMAGE', 'VIDEO', 'GIF', 'DOCUMENT', 'LOCATION'])

function newButtonForType(type: ButtonType): any {
  if (type === 'URL') return { type, text: '', url: 'https://' }
  if (type === 'PHONE_NUMBER') return { type, text: '', phone_number: '' }
  if (type === 'COPY_CODE') return { type, text: 'Copiar código', example: 'CODE123' }
  if (type === 'OTP') return { type, otp_type: 'COPY_CODE', text: 'Copiar código' }
  if (type === 'FLOW') return { type, text: '', flow_id: '', flow_action: 'navigate' }
  return { type, text: '' }
}

function ensureBaseSpec(input: unknown): Spec {
  const s = (input && typeof input === 'object') ? { ...(input as any) } : {}
  if (!s.name) s.name = 'novo_template'
  if (!s.language) s.language = 'pt_BR'
  if (!s.category) s.category = 'MARKETING'
  if (!s.parameter_format) s.parameter_format = 'positional'

  // body/content
  if (!s.body && typeof s.content === 'string') s.body = { text: s.content }
  if (!s.body) s.body = { text: '' }

  if (s.header === undefined) s.header = null
  if (s.footer === undefined) s.footer = null
  if (s.buttons === undefined) s.buttons = []
  if (s.carousel === undefined) s.carousel = null
  if (s.limited_time_offer === undefined) s.limited_time_offer = null

  return s
}

function variableCount(text: string): number {
  const matches = text.match(/\{\{[^}]+\}\}/g) || []
  const unique = new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))
  return unique.size
}

function variableOccurrences(text: string): number {
  const matches = text.match(/\{\{[^}]+\}\}/g) || []
  return matches.length
}

function extractPlaceholderTokens(text: string): string[] {
  const matches = text.match(/\{\{\s*([^}]+)\s*\}\}/g) || []
  return matches.map(m => m.replace(/\{\{|\}\}/g, '').trim())
}

function missingPositionalTokens(tokens: string[]): number[] {
  const numbers = tokens.filter((t) => /^\d+$/.test(t)).map((t) => Number(t)).filter((n) => n >= 1)
  if (!numbers.length) return []
  const max = Math.max(...numbers)
  const set = new Set(numbers)
  const missing: number[] = []
  for (let i = 1; i <= max; i += 1) {
    if (!set.has(i)) missing.push(i)
  }
  return missing
}

function validateNamedTokens(text: string) {
  const tokens = extractPlaceholderTokens(text)
  const invalid = tokens.filter(t => !/^[a-z][a-z0-9_]*$/.test(t))
  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1)
  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([token]) => token)
  return { invalid, duplicates }
}

function validateCarouselSpec(carousel: any): string[] {
  if (!carousel) return []
  const errors: string[] = []
  const cards = Array.isArray(carousel.cards) ? carousel.cards : null
  if (!cards) {
    errors.push('Carousel precisa de uma lista "cards".')
    return errors
  }
  if (cards.length < 2 || cards.length > 10) {
    errors.push('Carousel precisa ter entre 2 e 10 cards.')
  }
  cards.forEach((card: any, index: number) => {
    const components = Array.isArray(card?.components) ? card.components : []
    const header = components.find((c: any) => String(c?.type || '').toUpperCase() === 'HEADER')
    const body = components.find((c: any) => String(c?.type || '').toUpperCase() === 'BODY')
    if (!header) errors.push(`Card ${index + 1}: header é obrigatório.`)
    if (header) {
      const format = String(header?.format || '').toUpperCase()
      if (format !== 'IMAGE' && format !== 'VIDEO') {
        errors.push(`Card ${index + 1}: header deve ser IMAGE ou VIDEO.`)
      }
    }
    if (!body) errors.push(`Card ${index + 1}: body é obrigatório.`)
    const buttonComponent = components.find((c: any) => String(c?.type || '').toUpperCase() === 'BUTTONS')
    const buttonCount = Array.isArray(buttonComponent?.buttons) ? buttonComponent.buttons.length : 0
    if (buttonCount > 2) {
      errors.push(`Card ${index + 1}: máximo de 2 botões.`)
    }
  })
  return errors
}

function textHasEdgeParameter(text: string): { starts: boolean; ends: boolean } {
  const trimmed = text.trim()
  if (!trimmed) return { starts: false, ends: false }
  const starts = /^\{\{\s*[^}]+\s*\}\}/.test(trimmed)
  const ends = /\{\{\s*[^}]+\s*\}\}$/.test(trimmed)
  return { starts, ends }
}

function stripAllPlaceholders(text: string): string {
  return text.replace(/\{\{[^}]+\}\}/g, '')
}

function sanitizePlaceholdersByMode(text: string, mode: 'positional' | 'named'): string {
  return text.replace(/\{\{\s*([^}]+)\s*\}\}/g, (raw, token) => {
    const trimmed = String(token || '').trim()
    if (mode === 'positional') {
      return /^\d+$/.test(trimmed) ? `{{${trimmed}}}` : ''
    }
    return /^[a-z][a-z0-9_]*$/.test(trimmed) ? `{{${trimmed}}}` : ''
  })
}

function nextPositionalVariable(text: string): number {
  // Encontra o maior {{n}} no texto e retorna n+1.
  // Se não houver, começa em 1.
  const matches = text.match(/\{\{\s*(\d+)\s*\}\}/g) || []
  let max = 0
  for (const m of matches) {
    const num = Number(m.replace(/\D+/g, ''))
    if (!Number.isNaN(num)) max = Math.max(max, num)
  }
  return max + 1
}

function wrapSelection(value: string, start: number, end: number, left: string, right = left) {
  const before = value.slice(0, start)
  const mid = value.slice(start, end)
  const after = value.slice(end)
  return {
    value: `${before}${left}${mid}${right}${after}`,
    nextStart: start + left.length,
    nextEnd: end + left.length,
  }
}

function insertAt(value: string, pos: number, insert: string) {
  return {
    value: `${value.slice(0, pos)}${insert}${value.slice(pos)}`,
    nextPos: pos + insert.length,
  }
}

function defaultBodyExamples(text: string): string[][] | undefined {
  const n = variableCount(text)
  if (n <= 0) return undefined
  const row = Array.from({ length: n }, (_, i) => `Exemplo ${i + 1}`)
  return [row]
}

const panelClass = 'rounded-2xl border border-white/10 bg-zinc-900/60 shadow-[0_12px_30px_rgba(0,0,0,0.35)]'
const panelPadding = 'p-6'
const panelCompactPadding = 'p-4'

function Preview({ spec }: { spec: Spec }) {
  const header = spec.header
  const bodyText = spec.body?.text || ''
  const footerText = spec.footer?.text || ''
  const buttons: any[] = Array.isArray(spec.buttons) ? spec.buttons : []

  const prettyButtonLabel = (b: any): string => {
    const t = String(b?.type || '')
    if (t === 'COPY_CODE') return b?.text || 'Copiar código'
    if (t === 'QUICK_REPLY') return b?.text || 'Quick Reply'
    return b?.text || t
  }

  const headerLabel = (() => {
    if (!header) return null
    if (header.format === 'TEXT') return header.text || ''
    if (header.format === 'LOCATION') return 'LOCALIZAÇÃO'
    return `MÍDIA (${header.format})`
  })()

  return (
    <div className={`${panelClass} overflow-hidden`}>
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
        <div className="text-sm font-semibold text-white">Prévia do modelo</div>
        <button
          type="button"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-white/10 bg-zinc-950/40 hover:bg-white/5 text-gray-200"
          title="Visualizar"
        >
          <Play className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6">
        {/* “telefone” */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-3">
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#efeae2]">
            {/* header da conversa */}
            <div className="h-11 px-3 flex items-center gap-2 bg-[#075e54] text-white">
              <div className="h-7 w-7 rounded-full bg-white/20" />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold leading-none truncate">Business</div>
                <div className="text-[10px] text-white/80 leading-none mt-0.5 truncate">template</div>
              </div>
            </div>

            {/* conversa */}
            <div className="p-3">
              <div className="max-w-90 rounded-xl bg-white text-zinc-900 shadow-sm overflow-hidden">
                <div className="px-3 py-2">
                {headerLabel ? (
                  <div className="text-[13px] font-semibold leading-snug">
                    {headerLabel}
                  </div>
                ) : null}

                <div className="text-[13px] leading-snug whitespace-pre-wrap">
                  {bodyText || <span className="text-zinc-400">Digite o corpo para ver a prévia.</span>}
                </div>

                {footerText ? (
                  <div className="mt-1 text-[11px] text-zinc-500 whitespace-pre-wrap">
                    {footerText}
                  </div>
                ) : null}

                <div className="mt-1 flex items-center justify-end text-[10px] text-zinc-400">
                  16:34
                </div>
                </div>

                {buttons.length > 0 ? (
                  <div className="border-t border-zinc-200">
                    {buttons.map((b, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'px-3 py-3 text-center text-[13px] font-medium text-blue-600 flex items-center justify-center gap-2',
                          idx > 0 ? 'border-t border-zinc-200' : ''
                        )}
                      >
                        {String(b?.type || '') === 'URL' ? (
                          <ExternalLink className="w-4 h-4" />
                        ) : String(b?.type || '') === 'QUICK_REPLY' ? (
                          <CornerDownLeft className="w-4 h-4" />
                        ) : null}
                        <span>{prettyButtonLabel(b)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ManualTemplateBuilder({
  id,
  initialSpec,
  onSpecChange,
  onFinish,
  isFinishing,
}: {
  id: string
  initialSpec: unknown
  onSpecChange: (spec: unknown) => void
  onFinish?: () => void
  isFinishing?: boolean
}) {
  const [spec, setSpec] = React.useState<Spec>(() => ensureBaseSpec(initialSpec))
  const [showDebug, setShowDebug] = React.useState(false)
  const [step, setStep] = React.useState(1)

  const [isUploadingHeaderMedia, setIsUploadingHeaderMedia] = React.useState(false)
  const [uploadHeaderMediaError, setUploadHeaderMediaError] = React.useState<string | null>(null)

  const flowsQuery = useQuery({
    queryKey: ['flows'],
    queryFn: flowsService.list,
    staleTime: 10_000,
  })

  const publishedFlows = React.useMemo(() => {
    const rows = flowsQuery.data || []
    const withMeta = rows.filter((f) => !!f?.meta_flow_id)

    // Se o schema ainda não tem meta_status (migration não aplicada), não dá para filtrar com certeza.
    // Nesse caso, mostramos todos os flows com meta_flow_id e marcamos como “DESCONHECIDO”.
    const hasAnyMetaStatus = withMeta.some((f) => (f as any)?.meta_status != null)

    const list = hasAnyMetaStatus
      ? withMeta.filter((f) => String((f as any)?.meta_status || '') === 'PUBLISHED')
      : withMeta

    return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
  }, [flowsQuery.data])

  const headerTextRef = React.useRef<HTMLInputElement | null>(null)
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null)
  const footerRef = React.useRef<HTMLInputElement | null>(null)
  const lastSanitizeRef = React.useRef(0)
  const [namedVarDialogOpen, setNamedVarDialogOpen] = React.useState(false)
  const [namedVarTarget, setNamedVarTarget] = React.useState<'header' | 'body'>('body')
  const [namedVarName, setNamedVarName] = React.useState('')
  const [namedVarError, setNamedVarError] = React.useState<string | null>(null)
  const [namedVarExistingText, setNamedVarExistingText] = React.useState('')

  React.useEffect(() => {
    setSpec(ensureBaseSpec(initialSpec))
  }, [initialSpec])

  const update = (patch: Partial<Spec>) => {
    setSpec((prev: any) => {
      const next = { ...prev, ...patch }
      onSpecChange(next)
      return next
    })
  }

  const updateHeader = (patch: any) => {
    setSpec((prev: any) => {
      const next = { ...prev, header: patch }
      onSpecChange(next)
      return next
    })
  }

  const updateFooter = (patch: any) => {
    setSpec((prev: any) => {
      const next = { ...prev, footer: patch }
      onSpecChange(next)
      return next
    })
  }

  const updateButtons = (buttons: any[]) => {
    setSpec((prev: any) => {
      const next = { ...prev, buttons: normalizeButtons(buttons) }
      onSpecChange(next)
      return next
    })
  }

  const notifySanitized = () => {
    const now = Date.now()
    if (now - lastSanitizeRef.current < 1500) return
    lastSanitizeRef.current = now
    toast.message('Removemos variáveis inválidas automaticamente.')
  }

  const headerMediaMaxBytes = (format: HeaderFormat): number => {
    // Guard-rails práticos para evitar travas em serverless.
    // Refs da doc indexada:
    // - GIF: mp4 com max 3.5MB
    // - Outros: usamos limites conservadores compatíveis com o ecossistema WhatsApp.
    if (format === 'GIF') return 3_500_000
    if (format === 'IMAGE') return 5 * 1024 * 1024
    if (format === 'VIDEO') return 16 * 1024 * 1024
    if (format === 'DOCUMENT') return 20 * 1024 * 1024
    return 0
  }

  const headerMediaAccept = (format: HeaderFormat | 'NONE'): string => {
    if (format === 'IMAGE') return 'image/png,image/jpeg'
    if (format === 'VIDEO') return 'video/mp4'
    if (format === 'GIF') return 'video/mp4'
    if (format === 'DOCUMENT') return 'application/pdf'
    return ''
  }

  const uploadHeaderMedia = async (file: File) => {
    if (!canShowMediaSample) return

    const format = headerType as HeaderFormat
    if (format === 'GIF' && !isMarketingCategory) {
      setUploadHeaderMediaError('GIF é permitido apenas em templates MARKETING.')
      return
    }

    const max = headerMediaMaxBytes(format)
    if (max > 0 && file.size > max) {
      const mb = (max / 1_000_000).toFixed(1)
      setUploadHeaderMediaError(`Arquivo muito grande para ${format}. Limite: ${mb}MB.`)
      return
    }

    setUploadHeaderMediaError(null)
    setIsUploadingHeaderMedia(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('format', format)

      const res = await fetch('/api/meta/uploads/template-header', {
        method: 'POST',
        body: fd,
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = String(data?.error || data?.message || 'Falha ao enviar mídia')
        throw new Error(msg)
      }

      const handle = String(data?.handle || '').trim()
      if (!handle) {
        throw new Error('Upload concluído, mas não recebemos o header_handle.')
      }

      updateHeader({
        ...header,
        format,
        example: {
          ...(header?.example || {}),
          header_handle: [handle],
        },
      })

      toast.success('Upload concluído. header_handle preenchido automaticamente.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar mídia'
      setUploadHeaderMediaError(msg)
      toast.error(msg)
    } finally {
      setIsUploadingHeaderMedia(false)
    }
  }

  const header: any = spec.header
  const buttons: any[] = Array.isArray(spec.buttons) ? spec.buttons : []

  const maxButtons = 10
  const maxButtonText = 25
  const isMarketingCategory = String(spec.category || '') === 'MARKETING'
  const isAuthCategory = String(spec.category || '') === 'AUTHENTICATION'
  const isLimitedTimeOffer = Boolean(spec.limited_time_offer)
  const allowedButtonTypes = new Set<ButtonType>(
    isAuthCategory
      ? ['OTP']
      : [
          'QUICK_REPLY',
          'URL',
          'PHONE_NUMBER',
          'COPY_CODE',
          'FLOW',
          'VOICE_CALL',
          'CATALOG',
          'MPM',
          'EXTENSION',
          'ORDER_DETAILS',
          'POSTBACK',
          'REMINDER',
          'SEND_LOCATION',
          'SPM',
        ],
  )
  const counts = {
    total: buttons.length,
    url: countButtonsByType(buttons, 'URL'),
    phone: countButtonsByType(buttons, 'PHONE_NUMBER'),
    copyCode: countButtonsByType(buttons, 'COPY_CODE'),
    otp: countButtonsByType(buttons, 'OTP'),
  }

  const canAddButtonType = (type: ButtonType): { ok: boolean; reason?: string } => {
    if (!allowedButtonTypes.has(type)) return { ok: false, reason: 'Tipo não permitido para esta categoria.' }
    if (counts.total >= maxButtons) return { ok: false, reason: 'Limite de 10 botões atingido.' }
    if (type === 'URL' && counts.url >= 2) return { ok: false, reason: 'Limite de 2 botões de URL.' }
    if (type === 'PHONE_NUMBER' && counts.phone >= 1) return { ok: false, reason: 'Limite de 1 botão de telefone.' }
    if (type === 'COPY_CODE' && counts.copyCode >= 1) return { ok: false, reason: 'Limite de 1 botão de copiar código.' }
    if (type === 'OTP' && counts.otp >= 1) return { ok: false, reason: 'Limite de 1 botão OTP.' }
    return { ok: true }
  }

  const addButton = (type: ButtonType) => {
    const gate = canAddButtonType(type)
    if (!gate.ok) return
    updateButtons([...buttons, newButtonForType(type)])
  }

  const variableMode: 'positional' | 'named' = spec.parameter_format || 'positional'

  const insertVariable = (target: 'header' | 'body', placeholder: string) => {
    const currentText = target === 'header' ? String(header?.text || '') : String(spec.body?.text || '')

    if (target === 'header') {
      if (variableOccurrences(currentText) >= 1) return
      const el = headerTextRef.current
      const start = el?.selectionStart ?? currentText.length
      const { value, nextPos } = insertAt(currentText, start, placeholder)
      updateHeader({ ...(header || { format: 'TEXT' }), format: 'TEXT', text: value, example: header?.example ?? null })
      requestAnimationFrame(() => {
        if (!el) return
        el.focus()
        el.setSelectionRange(nextPos, nextPos)
      })
      return
    }

    const el = bodyRef.current
    const start = el?.selectionStart ?? currentText.length
    const { value, nextPos } = insertAt(currentText, start, placeholder)
    const example = defaultBodyExamples(value)
    update({ body: { ...(spec.body || {}), text: value, example: example ? { body_text: example } : undefined } })
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(nextPos, nextPos)
    })
  }

  const openNamedVariableDialog = (target: 'header' | 'body', currentText: string) => {
    setNamedVarTarget(target)
    setNamedVarExistingText(currentText)
    setNamedVarName('')
    setNamedVarError(null)
    setNamedVarDialogOpen(true)
  }

  const confirmNamedVariable = () => {
    const trimmed = namedVarName.trim()
    if (!trimmed) {
      setNamedVarError('Informe um nome para a variável.')
      return
    }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
      setNamedVarError('Use apenas minúsculas, números e underscore (ex: first_name).')
      return
    }
    if (namedVarExistingText.includes(`{{${trimmed}}}`)) {
      setNamedVarError('Esse nome de variável já foi usado neste campo.')
      return
    }

    setNamedVarDialogOpen(false)
    setNamedVarName('')
    setNamedVarError(null)
    insertVariable(namedVarTarget, `{{${trimmed}}}`)
  }

  const addVariable = (target: 'header' | 'body') => {
    const currentText = target === 'header' ? String(header?.text || '') : String(spec.body?.text || '')

    const placeholder = (() => {
      if (variableMode === 'positional') {
        const next = nextPositionalVariable(currentText)
        return `{{${next}}}`
      }

      if (target === 'header' && variableOccurrences(currentText) >= 1) return null
      openNamedVariableDialog(target, currentText)
      return null
    })()

    if (!placeholder) return

    insertVariable(target, placeholder)
  }

  const applyBodyFormat = (kind: 'bold' | 'italic' | 'strike' | 'code') => {
    const el = bodyRef.current
    const value = String(spec.body?.text || '')
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const token = kind === 'bold' ? '*' : kind === 'italic' ? '_' : kind === 'strike' ? '~' : '`'
    const { value: nextValue, nextStart, nextEnd } = wrapSelection(value, start, end, token)
    const example = defaultBodyExamples(nextValue)
    update({ body: { ...(spec.body || {}), text: nextValue, example: example ? { body_text: example } : undefined } })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(nextStart, nextEnd)
    })
  }

  const headerEnabled = !!spec.header
  const headerType: HeaderFormat | 'NONE' = headerEnabled ? (header?.format || 'TEXT') : 'NONE'
  const bodyText: string = String(spec.body?.text || '')
  const footerText: string = String(spec.footer?.text || '')
  const headerText: string = String(header?.text || '')

  const headerTextCount = headerText.length
  const bodyTextCount = bodyText.length
  const footerTextCount = footerText.length
  const bodyMaxLength = isLimitedTimeOffer ? 600 : 1024
  const headerVariableCount = headerType === 'TEXT' ? variableOccurrences(headerText) : 0
  const isHeaderVariableValid = headerVariableCount <= 1
  const headerLengthExceeded = headerType === 'TEXT' && headerTextCount > 60
  const headerTextMissing = headerEnabled && headerType === 'TEXT' && !headerText.trim()
  const bodyLengthExceeded = bodyTextCount > bodyMaxLength
  const footerLengthExceeded = Boolean(spec.footer) && footerTextCount > 60
  const isHeaderFormatValid = !headerEnabled || headerType === 'NONE' || allowedHeaderFormats.has(headerType as HeaderFormat)
  const footerHasVariables = variableOccurrences(footerText) > 0
  const headerEdgeParameter = headerType === 'TEXT' ? textHasEdgeParameter(headerText) : { starts: false, ends: false }
  const bodyEdgeParameter = textHasEdgeParameter(bodyText)
  const positionalHeaderInvalid =
    variableMode === 'positional' && headerType === 'TEXT'
      ? extractPlaceholderTokens(headerText).filter((t) => !/^\d+$/.test(t) || Number(t) < 1)
      : []
  const positionalBodyInvalid =
    variableMode === 'positional'
      ? extractPlaceholderTokens(bodyText).filter((t) => !/^\d+$/.test(t) || Number(t) < 1)
      : []
  const positionalHeaderMissing =
    variableMode === 'positional' && headerType === 'TEXT'
      ? missingPositionalTokens(extractPlaceholderTokens(headerText))
      : []
  const positionalBodyMissing =
    variableMode === 'positional'
      ? missingPositionalTokens(extractPlaceholderTokens(bodyText))
      : []
  const hasMissingPositional = positionalHeaderMissing.length > 0 || positionalBodyMissing.length > 0
  const hasInvalidPositional = positionalHeaderInvalid.length > 0 || positionalBodyInvalid.length > 0 || hasMissingPositional
  const namedHeaderChecks = variableMode === 'named' && headerType === 'TEXT' ? validateNamedTokens(headerText) : null
  const namedBodyChecks = variableMode === 'named' ? validateNamedTokens(bodyText) : null
  const namedFooterChecks = variableMode === 'named' ? validateNamedTokens(footerText) : null
  const hasInvalidNamed =
    (namedHeaderChecks?.invalid.length || 0) > 0 ||
    (namedBodyChecks?.invalid.length || 0) > 0 ||
    (namedFooterChecks?.invalid.length || 0) > 0
  const hasDuplicateNamed =
    (namedHeaderChecks?.duplicates.length || 0) > 0 ||
    (namedBodyChecks?.duplicates.length || 0) > 0 ||
    (namedFooterChecks?.duplicates.length || 0) > 0
  const hasLengthErrors = headerLengthExceeded || bodyLengthExceeded || footerLengthExceeded
  const ltoHeaderInvalid =
    isLimitedTimeOffer && headerEnabled && headerType !== 'IMAGE' && headerType !== 'VIDEO'
  const ltoFooterInvalid = isLimitedTimeOffer && Boolean(spec.footer)
  const copyCodeExamples = buttons
    .filter((b) => b?.type === 'COPY_CODE')
    .map((b) => {
      const value = Array.isArray(b?.example) ? b.example[0] : b?.example
      return String(value || '').trim()
    })
  const ltoCopyCodeMissing = isLimitedTimeOffer && (copyCodeExamples.length === 0 || copyCodeExamples.some((c) => !c))
  const ltoCopyCodeTooLong = isLimitedTimeOffer && copyCodeExamples.some((c) => c.length > 15)
  const limitedTimeOfferTextMissing = Boolean(spec.limited_time_offer) && !String(spec.limited_time_offer?.text || '').trim()

  const invalidButtonTypes = buttons.filter((b) => b?.type && !allowedButtonTypes.has(b.type)).map((b) => String(b?.type || ''))
  const buttonErrors: string[] = []
  if (counts.total > maxButtons) buttonErrors.push('Máximo de 10 botões no total.')
  if (counts.url > 2) buttonErrors.push('Máximo de 2 botões de URL.')
  if (counts.phone > 1) buttonErrors.push('Máximo de 1 botão de telefone.')
  if (counts.copyCode > 1) buttonErrors.push('Máximo de 1 botão de copiar código.')
  if (isAuthCategory && counts.otp !== 1) buttonErrors.push('Authentication exige 1 botão OTP.')
  if (!isAuthCategory && counts.otp > 0) buttonErrors.push('OTP é permitido apenas em Authentication.')
  if (invalidButtonTypes.length) buttonErrors.push(`Botões não permitidos: ${invalidButtonTypes.join(', ')}.`)
  if (ltoCopyCodeMissing) buttonErrors.push('Limited Time Offer exige botão COPY_CODE com exemplo.')
  if (ltoCopyCodeTooLong) buttonErrors.push('Limited Time Offer: código do COPY_CODE deve ter até 15 caracteres.')
  const requiresButtonText = new Set<ButtonType>([
    'QUICK_REPLY',
    'URL',
    'PHONE_NUMBER',
    'COPY_CODE',
    'FLOW',
    'VOICE_CALL',
    'CATALOG',
    'MPM',
    'EXTENSION',
    'ORDER_DETAILS',
    'POSTBACK',
    'REMINDER',
    'SEND_LOCATION',
    'SPM',
    'OTP',
  ])
  const missingButtonText = buttons.some((b) => requiresButtonText.has(b?.type) && !String(b?.text || '').trim())
  if (missingButtonText) buttonErrors.push('Preencha o texto dos botões.')

  const carouselErrors = validateCarouselSpec(spec.carousel)
  const limitedTimeOfferTextTooLong = Boolean(spec.limited_time_offer) && String(spec.limited_time_offer?.text || '').length > 16
  const limitedTimeOfferCategoryInvalid = Boolean(spec.limited_time_offer) && String(spec.category || '') !== 'MARKETING'
  const isButtonsValid =
    buttonErrors.length === 0 &&
    carouselErrors.length === 0 &&
    !limitedTimeOfferTextMissing &&
    !limitedTimeOfferTextTooLong &&
    !limitedTimeOfferCategoryInvalid

  const canShowMediaSample = headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'GIF' || headerType === 'DOCUMENT'
  const headerMediaHandleValue = canShowMediaSample ? String(header?.example?.header_handle?.[0] || '').trim() : ''
  const isHeaderMediaHandleMissing = canShowMediaSample && !headerMediaHandleValue
  const nameValue = String(spec.name || '').trim()
  const isNameValid = Boolean(nameValue) && /^[a-z0-9_]+$/.test(nameValue)
  const isConfigComplete = isNameValid && Boolean(spec.category) && Boolean(spec.language) && Boolean(spec.parameter_format)
  const isContentComplete =
    bodyText.trim().length > 0 &&
    isHeaderVariableValid &&
    isHeaderFormatValid &&
    !headerTextMissing &&
    !isHeaderMediaHandleMissing &&
    !hasInvalidNamed &&
    !hasDuplicateNamed &&
    !hasInvalidPositional &&
    !hasLengthErrors &&
    !ltoHeaderInvalid &&
    !ltoFooterInvalid &&
    !footerHasVariables &&
    !headerEdgeParameter.starts &&
    !headerEdgeParameter.ends &&
    !bodyEdgeParameter.starts &&
    !bodyEdgeParameter.ends
  const canContinue = step === 1 ? isConfigComplete : step === 2 ? isContentComplete : isButtonsValid && isContentComplete
  const steps = [
    { id: 1, label: 'Configuracao' },
    { id: 2, label: 'Conteudo' },
    { id: 3, label: 'Botoes' },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          {steps.map((item) => {
            const isStepEnabled =
              item.id === 1 ||
              (item.id === 2 && isConfigComplete) ||
              (item.id === 3 && isConfigComplete && isContentComplete)
            return (
              <button
                key={item.id}
                type="button"
                disabled={!isStepEnabled}
                onClick={() => {
                  if (!isStepEnabled) return
                  setStep(item.id)
                }}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  step === item.id
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-white'
                    : 'border-white/10 bg-zinc-900/40 text-gray-400'
                } ${!isStepEnabled ? 'cursor-not-allowed opacity-40' : 'hover:text-white'}`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold leading-none ${
                    step === item.id
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/10 text-gray-400'
                  }`}
                >
                  {item.id}
                </span>
                <span className="text-xs uppercase tracking-widest">{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* CONFIG (equivalente ao passo anterior na Meta, mas mantemos aqui) */}
        {step === 1 && (
          <div className={`${panelClass} ${panelPadding} min-h-140`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-white">Nome e idioma do modelo</div>
                <div className="text-xs text-gray-400 mt-0.5">Defina como o modelo será identificado.</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-300">Nome</label>
                <Input
                  value={spec.name || ''}
                  onChange={(e) => update({ name: e.target.value })}
                  className={`bg-zinc-950/40 text-white ${
                    isNameValid ? 'border-white/10' : 'border-amber-400/40'
                  }`}
                />
                <p className="text-xs text-gray-500">Apenas <span className="font-mono">a-z 0-9 _</span></p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-300">Categoria</label>
                <Select
                  value={spec.category}
                  onValueChange={(v) => {
                    const nextCategory = String(v)
                    const nextAllowedButtons = new Set<ButtonType>(
                      nextCategory === 'AUTHENTICATION'
                        ? ['OTP']
                        : [
                            'QUICK_REPLY',
                            'URL',
                            'PHONE_NUMBER',
                            'COPY_CODE',
                            'FLOW',
                            'VOICE_CALL',
                            'CATALOG',
                            'MPM',
                            'EXTENSION',
                            'ORDER_DETAILS',
                            'POSTBACK',
                            'REMINDER',
                            'SEND_LOCATION',
                            'SPM',
                          ],
                    )
                    const nextButtons = buttons.filter((b) => nextAllowedButtons.has(b?.type as ButtonType))
                    if (nextCategory === 'AUTHENTICATION' && nextButtons.length === 0) {
                      nextButtons.push(newButtonForType('OTP'))
                    }
                    update({
                      category: v,
                      buttons: normalizeButtons(nextButtons),
                      limited_time_offer: nextCategory === 'MARKETING' ? spec.limited_time_offer : null,
                    })
                  }}
                >
                  <SelectTrigger className="w-full bg-zinc-950/40 border-white/10 text-white">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="UTILITY">Utilidade</SelectItem>
                    <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-300">Idioma</label>
                <Select value={spec.language} onValueChange={(v) => update({ language: v })}>
                  <SelectTrigger className="w-full bg-zinc-950/40 border-white/10 text-white">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">pt_BR</SelectItem>
                    <SelectItem value="en_US">en_US</SelectItem>
                    <SelectItem value="es_ES">es_ES</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-300">Tipo de variável</label>
                <Select
                  value={variableMode}
                  onValueChange={(v) => {
                    const mode = v as 'positional' | 'named'
                    const next: Partial<Spec> = { parameter_format: mode }
                    if (headerType === 'TEXT') {
                      const cleanedHeader = sanitizePlaceholdersByMode(headerText, mode)
                      if (cleanedHeader !== headerText) {
                        next.header = { ...(header || { format: 'TEXT' }), format: 'TEXT', text: cleanedHeader, example: header?.example ?? null }
                        notifySanitized()
                      }
                    }
                    const cleanedBody = sanitizePlaceholdersByMode(bodyText, mode)
                    if (cleanedBody !== bodyText) {
                      const example = defaultBodyExamples(cleanedBody)
                      next.body = { ...(spec.body || {}), text: cleanedBody, example: example ? { body_text: example } : undefined }
                      notifySanitized()
                    }
                    if (spec.footer?.text) {
                      const cleanedFooter = stripAllPlaceholders(footerText)
                      if (cleanedFooter !== footerText) {
                        next.footer = { ...(spec.footer || {}), text: cleanedFooter }
                        notifySanitized()
                      }
                    }
                    update(next)
                  }}
                >
                  <SelectTrigger className="w-full bg-zinc-950/40 border-white/10 text-white">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positional">Número</SelectItem>
                    <SelectItem value="named">Nome (avançado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              ID do rascunho: <span className="font-mono">{id}</span>
            </div>
          </div>
        )}

        {/* CONTEÚDO (como na Meta) */}
        {step === 2 && (
          <div className={`${panelClass} p-5 space-y-2 min-h-140`}>
            <div>
              <div className="text-base font-semibold text-white">Conteúdo</div>
              <div className="text-xs text-gray-400 mt-1">
                Adicione um cabeçalho, corpo de texto e rodapé para o seu modelo. A Meta analisa variáveis e conteúdo antes da aprovação.
              </div>
            </div>
            {hasInvalidNamed || hasDuplicateNamed || hasInvalidPositional || footerHasVariables ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/10 bg-zinc-950/40 hover:bg-white/5 h-8 px-3 text-xs"
                  onClick={() => {
                    const next: Partial<Spec> = {}
                    if (headerType === 'TEXT') {
                      const cleanedHeader = sanitizePlaceholdersByMode(headerText, variableMode)
                      if (cleanedHeader !== headerText) {
                        next.header = { ...(header || { format: 'TEXT' }), format: 'TEXT', text: cleanedHeader, example: header?.example ?? null }
                        notifySanitized()
                      }
                    }
                    const cleanedBody = sanitizePlaceholdersByMode(bodyText, variableMode)
                    if (cleanedBody !== bodyText) {
                      const example = defaultBodyExamples(cleanedBody)
                      next.body = { ...(spec.body || {}), text: cleanedBody, example: example ? { body_text: example } : undefined }
                      notifySanitized()
                    }
                    if (spec.footer?.text) {
                      const cleanedFooter = stripAllPlaceholders(footerText)
                      if (cleanedFooter !== footerText) {
                        next.footer = { ...(spec.footer || {}), text: cleanedFooter }
                        notifySanitized()
                      }
                    }
                    if (Object.keys(next).length) update(next)
                  }}
                >
                  Limpar variáveis inválidas
                </Button>
              </div>
            ) : null}

            {/* CABEÇALHO */}
            <div className="pt-1">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Cabeçalho <span className="text-xs text-gray-500 font-normal">• Opcional</span></div>
                {headerType !== 'NONE' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-gray-400 hover:text-white hover:bg-white/5"
                    onClick={() => update({ header: null })}
                  >
                    Remover
                  </Button>
                ) : null}
              </div>

              {headerType === 'NONE' ? (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950/40 p-2">
                  <div className="text-xs text-gray-400">Sem cabeçalho configurado.</div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/10 bg-zinc-950/40 hover:bg-white/5"
                    onClick={() =>
                      updateHeader(
                        isLimitedTimeOffer
                          ? { format: 'IMAGE', example: { header_handle: [''] } }
                          : { format: 'TEXT', text: '', example: null },
                      )
                    }
                  >
                    Adicionar cabeçalho
                  </Button>
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">Tipo</label>
                    <Select
                      value={headerType}
                      onValueChange={(v) => {
                        const format = v as HeaderFormat | 'NONE'
                        if (format === 'NONE') {
                          update({ header: null })
                          return
                        }
                        if (format === 'TEXT') updateHeader({ format: 'TEXT', text: '', example: null })
                        else if (format === 'LOCATION') updateHeader({ format: 'LOCATION' })
                        else updateHeader({ format, example: { header_handle: [''] } })
                      }}
                    >
                      <SelectTrigger className="w-full bg-zinc-950/40 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Nenhum</SelectItem>
                        <SelectItem value="TEXT" disabled={isLimitedTimeOffer}>Texto</SelectItem>
                        <SelectItem value="IMAGE">Imagem</SelectItem>
                        <SelectItem value="VIDEO">Vídeo</SelectItem>
                        <SelectItem value="GIF" disabled={!isMarketingCategory || isLimitedTimeOffer}>GIF (mp4)</SelectItem>
                        <SelectItem value="DOCUMENT" disabled={isLimitedTimeOffer}>Documento</SelectItem>
                        <SelectItem value="LOCATION" disabled={isLimitedTimeOffer}>Localização</SelectItem>
                      </SelectContent>
                    </Select>

                    {headerType === 'GIF' ? (
                      <p className="text-xs text-gray-500">
                        Observação: GIF no header é documentado como disponível para Marketing Messages (GIF = mp4, máx 3.5MB).
                      </p>
                    ) : null}
                    {!isMarketingCategory ? (
                      <p className="text-xs text-gray-500">
                        Dica: a opção GIF fica disponível apenas em templates MARKETING.
                      </p>
                    ) : null}
                  </div>
                </div>
              )}

              {!isHeaderFormatValid ? (
                <p className="text-xs text-amber-300 mt-1">Tipo de cabeçalho inválido para templates.</p>
              ) : null}
              {ltoHeaderInvalid ? (
                <p className="text-xs text-amber-300 mt-1">Limited Time Offer aceita apenas cabeçalho IMAGE ou VIDEO.</p>
              ) : null}

              {headerType === 'TEXT' ? (
                <div className="mt-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-300">Texto</label>
                    <div className="text-xs text-gray-500">{headerTextCount}/60</div>
                  </div>
                  <Input
                    ref={headerTextRef as any}
                    value={headerText}
                    onChange={(e) => {
                      const raw = e.target.value
                      const cleaned = sanitizePlaceholdersByMode(raw, variableMode)
                      if (cleaned !== raw) notifySanitized()
                      updateHeader({ ...header, format: 'TEXT', text: cleaned })
                    }}
                    className="bg-zinc-950/40 border-white/10 text-white"
                    placeholder="Texto do cabeçalho"
                    maxLength={60}
                  />
                  {headerLengthExceeded ? (
                    <p className="text-xs text-amber-300">Cabeçalho excede 60 caracteres.</p>
                  ) : null}
                  {!isHeaderVariableValid ? (
                    <p className="text-xs text-amber-300">O cabeçalho permite apenas 1 variável.</p>
                  ) : null}
                  {namedHeaderChecks?.invalid.length ? (
                    <p className="text-xs text-amber-300">Variáveis devem ser minúsculas com underscore (ex: first_name).</p>
                  ) : null}
                  {namedHeaderChecks?.duplicates.length ? (
                    <p className="text-xs text-amber-300">Nomes de variável no cabeçalho devem ser únicos.</p>
                  ) : null}
                  {headerTextMissing ? (
                    <p className="text-xs text-amber-300">Cabeçalho de texto é obrigatório.</p>
                  ) : null}
                  {positionalHeaderInvalid.length ? (
                    <p className="text-xs text-amber-300">
                      No modo numérico, use apenas {'{{1}}'}, {'{{2}}'}…
                    </p>
                  ) : null}
                  {positionalHeaderMissing.length ? (
                    <p className="text-xs text-amber-300">
                      Sequência posicional deve começar em {'{{1}}'} e não ter buracos.
                    </p>
                  ) : null}
                  {headerEdgeParameter.starts || headerEdgeParameter.ends ? (
                    <p className="text-xs text-amber-300">O cabeçalho não pode começar nem terminar com variável.</p>
                  ) : null}
                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => addVariable('header')}
                      disabled={headerVariableCount >= 1}
                      className="h-8 px-2 text-gray-300 hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar variável
                    </Button>
                  </div>
                </div>
              ) : null}

              {canShowMediaSample ? (
                <div className="mt-2 space-y-2">
                  <label className="text-xs font-medium text-gray-300">Mídia (upload)</label>

                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept={headerMediaAccept(headerType)}
                      disabled={isUploadingHeaderMedia}
                      className="bg-zinc-950/40 border-white/10 text-white"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0]
                        // Permite selecionar o mesmo arquivo novamente
                        e.currentTarget.value = ''
                        if (!file) return
                        void uploadHeaderMedia(file)
                      }}
                    />
                    {isUploadingHeaderMedia ? (
                      <div className="inline-flex items-center gap-2 text-xs text-gray-300 px-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enviando...
                      </div>
                    ) : null}
                  </div>

                  {uploadHeaderMediaError ? (
                    <p className="text-xs text-amber-300">{uploadHeaderMediaError}</p>
                  ) : null}

                  <div className="pt-1 space-y-2">
                    <label className="text-xs font-medium text-gray-300">header_handle (mídia)</label>
                    <Input
                      value={header?.example?.header_handle?.[0] || ''}
                      onChange={(e) => updateHeader({ ...header, example: { ...(header.example || {}), header_handle: [e.target.value] } })}
                      className="bg-zinc-950/40 border-white/10 text-white"
                      placeholder="Preenchido automaticamente após o upload (ou cole manualmente)"
                      disabled={isUploadingHeaderMedia}
                    />
                    {isHeaderMediaHandleMissing ? (
                      <p className="text-xs text-amber-300">
                        Cabeçalho de mídia exige <span className="font-mono">header_handle</span>.
                      </p>
                    ) : null}
                    <p className="text-xs text-gray-500">
                      O <span className="font-mono">header_handle</span> é gerado via Resumable Upload (Graph API). Se preferir, você ainda pode colar manualmente.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* CORPO */}
            <div className="pt-1">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Corpo</div>
                <div className="text-xs text-gray-500">{bodyTextCount}/{bodyMaxLength}</div>
              </div>

              <div className="mt-2 rounded-xl border border-white/10 bg-zinc-950/40">
                <div className="p-2">
                  <Textarea
                    ref={bodyRef as any}
                    value={bodyText}
                    onChange={(e) => {
                      const raw = e.target.value
                      const cleaned = sanitizePlaceholdersByMode(raw, variableMode)
                      if (cleaned !== raw) notifySanitized()
                      const example = defaultBodyExamples(cleaned)
                      update({ body: { ...(spec.body || {}), text: cleaned, example: example ? { body_text: example } : undefined } })
                    }}
                    className="bg-transparent border-none text-white min-h-24 focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder="Digite o corpo (obrigatório)"
                    maxLength={bodyMaxLength}
                  />
                </div>

                <div className="flex items-center gap-1 px-2 py-1.5 border-t border-white/10">
                  <Button type="button" variant="ghost" onClick={() => applyBodyFormat('bold')} className="h-7 px-2 text-gray-200 hover:bg-white/5">
                    <Bold className="w-4 h-4" />
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => applyBodyFormat('italic')} className="h-7 px-2 text-gray-200 hover:bg-white/5">
                    <Italic className="w-4 h-4" />
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => applyBodyFormat('strike')} className="h-7 px-2 text-gray-200 hover:bg-white/5">
                    <Strikethrough className="w-4 h-4" />
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => applyBodyFormat('code')} className="h-7 px-2 text-gray-200 hover:bg-white/5">
                    <Code className="w-4 h-4" />
                  </Button>

                  <div className="flex-1" />

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => addVariable('body')}
                    className="h-7 px-2 text-gray-200 hover:bg-white/5"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar variável
                  </Button>
                </div>
              </div>

              {namedBodyChecks?.invalid.length ? (
                <div className="mt-2 text-xs text-amber-300">Use apenas minúsculas e underscore nas variáveis do corpo.</div>
              ) : null}
              {namedBodyChecks?.duplicates.length ? (
                <div className="mt-2 text-xs text-amber-300">Nomes de variável no corpo devem ser únicos.</div>
              ) : null}
              {positionalBodyInvalid.length ? (
                <div className="mt-2 text-xs text-amber-300">
                  No modo numérico, use apenas {'{{1}}'}, {'{{2}}'}…
                </div>
              ) : null}
              {positionalBodyMissing.length ? (
                <div className="mt-2 text-xs text-amber-300">
                  Sequência posicional deve começar em {'{{1}}'} e não ter buracos.
                </div>
              ) : null}
              {bodyLengthExceeded ? (
                <div className="mt-2 text-xs text-amber-300">Corpo excede {bodyMaxLength} caracteres.</div>
              ) : null}
              {bodyEdgeParameter.starts || bodyEdgeParameter.ends ? (
                <div className="mt-2 text-xs text-amber-300">O corpo não pode começar nem terminar com variável.</div>
              ) : null}
              {!bodyText.trim() ? (
                <div className="mt-2 text-xs text-amber-300">O corpo é obrigatório.</div>
              ) : null}
            </div>

            {/* RODAPÉ */}
            <div className="pt-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Rodapé <span className="text-xs text-gray-500 font-normal">• Opcional</span></div>
                <div className="text-xs text-gray-500">{footerTextCount}/60</div>
              </div>

              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="border-white/10 bg-zinc-950/40 hover:bg-white/5 h-8 px-3"
                    disabled={isLimitedTimeOffer && !spec.footer}
                    onClick={() => updateFooter(spec.footer ? null : { text: '' })}
                  >
                    {spec.footer ? 'Remover rodapé' : 'Adicionar rodapé'}
                  </Button>
                </div>

                {isLimitedTimeOffer ? (
                  <div className="text-xs text-amber-300">Limited Time Offer não permite rodapé.</div>
                ) : null}

                {spec.footer ? (
                  <div className="space-y-2">
                    <Input
                      ref={footerRef as any}
                      value={footerText}
                      onChange={(e) => {
                        const nextText = stripAllPlaceholders(e.target.value)
                        if (nextText !== e.target.value) notifySanitized()
                        updateFooter({ ...(spec.footer || {}), text: nextText })
                      }}
                      className="bg-zinc-950/40 border-white/10 text-white"
                      placeholder="Inserir texto"
                      maxLength={60}
                    />
                    {footerLengthExceeded ? (
                      <div className="text-xs text-amber-300">Rodapé excede 60 caracteres.</div>
                    ) : null}
                    {footerHasVariables ? (
                      <div className="text-xs text-amber-300">Rodapé não permite variáveis.</div>
                    ) : null}
                    {namedFooterChecks?.invalid.length ? (
                      <div className="text-xs text-amber-300">Use apenas minúsculas e underscore nas variáveis do rodapé.</div>
                    ) : null}
                    {namedFooterChecks?.duplicates.length ? (
                      <div className="text-xs text-amber-300">Nomes de variável no rodapé devem ser únicos.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={`${panelClass} ${panelPadding} space-y-4`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Botões <span className="text-xs text-gray-500 font-normal">• Opcional</span></div>
              <div className="text-xs text-gray-400">É possível adicionar até 10 botões. Se adicionar mais de 3, eles aparecem em lista.</div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="border-white/10 bg-zinc-950/40 hover:bg-white/5"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar botão
                  <ChevronDown className="w-4 h-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white min-w-60">
                <DropdownMenuLabel className="text-xs text-gray-500 uppercase tracking-wider">
                  Ações
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => addButton('QUICK_REPLY')}
                  disabled={!canAddButtonType('QUICK_REPLY').ok}
                  className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                >
                  Resposta rápida
                  <DropdownMenuShortcut>até 10</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addButton('URL')}
                  disabled={!canAddButtonType('URL').ok}
                  className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                >
                  Visitar site
                  <DropdownMenuShortcut>máx 2</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addButton('PHONE_NUMBER')}
                  disabled={!canAddButtonType('PHONE_NUMBER').ok}
                  className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                >
                  Ligar
                  <DropdownMenuShortcut>máx 1</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addButton('COPY_CODE')}
                  disabled={!canAddButtonType('COPY_CODE').ok}
                  className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                >
                  Copiar código
                  <DropdownMenuShortcut>máx 1</DropdownMenuShortcut>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/10" />

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer hover:bg-white/5 focus:bg-white/5">
                    Avançado
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-zinc-900 border-white/10 text-white min-w-56">
                    <DropdownMenuItem
                      onClick={() => addButton('FLOW')}
                      disabled={!canAddButtonType('FLOW').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      Flow
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => addButton('OTP')}
                      disabled={!canAddButtonType('OTP').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      OTP
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => addButton('CATALOG')}
                      disabled={!canAddButtonType('CATALOG').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      Catálogo
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => addButton('MPM')}
                      disabled={!canAddButtonType('MPM').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      MPM
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => addButton('VOICE_CALL')}
                      disabled={!canAddButtonType('VOICE_CALL').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      Chamada de voz
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => addButton('ORDER_DETAILS')}
                      disabled={!canAddButtonType('ORDER_DETAILS').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      Detalhes do pedido
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => addButton('SPM')}
                      disabled={!canAddButtonType('SPM').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      SPM
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => addButton('SEND_LOCATION')}
                      disabled={!canAddButtonType('SEND_LOCATION').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      Enviar localização
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => addButton('REMINDER')}
                      disabled={!canAddButtonType('REMINDER').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      Lembrete
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => addButton('POSTBACK')}
                      disabled={!canAddButtonType('POSTBACK').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      Postback
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => addButton('EXTENSION')}
                      disabled={!canAddButtonType('EXTENSION').ok}
                      className="cursor-pointer hover:bg-white/5 focus:bg-white/5"
                    >
                      Extensão
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {buttons.length === 0 ? (
            <div className="text-sm text-gray-500">Nenhum botão</div>
          ) : (
            <div className="space-y-5">
              {/* Resposta rápida */}
              {(() => {
                const rows = buttons
                  .map((b, idx) => ({ b, idx }))
                  .filter(({ b }) => b?.type === 'QUICK_REPLY')

                if (rows.length === 0) return null

                return (
                  <div className="space-y-3">
                    <div className="text-xs text-gray-400">Resposta rápida <span className="text-gray-500">• Opcional</span></div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-[18px_minmax(0,1fr)_40px] gap-3 items-center">
                        <div />
                        <div className="text-xs font-medium text-gray-300">Texto do botão</div>
                        <div />
                      </div>

                      <div className="space-y-3">
                        {rows.map(({ b, idx }) => {
                          const text = String(b?.text || '')
                          const hasTextError = requiresButtonText.has(b?.type) && !text.trim()
                          return (
                            <div key={idx} className="grid grid-cols-[18px_minmax(0,1fr)_40px] gap-3 items-center">
                              <GripVertical className="w-4 h-4 text-gray-500" />

                              <div className="relative">
                                <Input
                                  value={text}
                                  onChange={(e) => {
                                    const next = [...buttons]
                                    next[idx] = { ...b, text: clampText(e.target.value, maxButtonText) }
                                    updateButtons(next)
                                  }}
                                  className="h-11 bg-zinc-950/40 border-white/10 text-white pr-16"
                                  maxLength={maxButtonText}
                                  placeholder="Quick Reply"
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                                  {countChars(text)}/{maxButtonText}
                                </div>
                                {hasTextError && (
                                  <div className="mt-1 text-xs text-amber-300">Informe o texto do botão.</div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => updateButtons(buttons.filter((_, i) => i !== idx))}
                                className="h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5"
                                title="Remover"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Chamada para ação */}
              {(() => {
                const rows = buttons
                  .map((b, idx) => ({ b, idx }))
                  .filter(({ b }) => b?.type !== 'QUICK_REPLY')

                if (rows.length === 0) return null

                return (
                  <div className="space-y-3">
                    <div className="text-xs text-gray-400">Chamada para ação <span className="text-gray-500">• Opcional</span></div>

                    <div className="space-y-4">
                      {rows.map(({ b, idx }, rowIndex) => {
                        const type = b?.type as ButtonType
                        const buttonText = String(b?.text || '')
                        const hasTextError = requiresButtonText.has(type) && !buttonText.trim()
                        const rowClassName = rowIndex === 0
                          ? 'relative pb-4 pr-12'
                          : 'relative border-t border-white/10 pt-4 pb-4 pr-12'

                        const headerRow = (
                          <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-4">
                            <div className="pt-6">
                              <GripVertical className="w-4 h-4 text-gray-500" />
                            </div>

                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-gray-300">Tipo de ação</div>
                                  <Select
                                    value={type}
                                    onValueChange={(v) => {
                                      const t = v as ButtonType
                                      if (!allowedButtonTypes.has(t)) return
                                      const next = [...buttons]
                                      next[idx] = { type: t }
                                      if (
                                        t === 'QUICK_REPLY' ||
                                        t === 'URL' ||
                                        t === 'PHONE_NUMBER' ||
                                        t === 'FLOW' ||
                                        t === 'CATALOG' ||
                                        t === 'MPM' ||
                                        t === 'VOICE_CALL' ||
                                        t === 'EXTENSION' ||
                                        t === 'ORDER_DETAILS' ||
                                        t === 'POSTBACK' ||
                                        t === 'REMINDER' ||
                                        t === 'SEND_LOCATION' ||
                                        t === 'SPM'
                                      ) {
                                        next[idx].text = ''
                                      }
                                      if (t === 'URL') next[idx].url = 'https://'
                                      if (t === 'PHONE_NUMBER') next[idx].phone_number = ''
                                      if (t === 'COPY_CODE') {
                                        next[idx].text = 'Copiar código'
                                        next[idx].example = 'CODE123'
                                      }
                                      if (t === 'OTP') {
                                        next[idx].text = 'Copiar código'
                                        next[idx].otp_type = 'COPY_CODE'
                                      }
                                      if (t === 'FLOW') next[idx].flow_id = ''
                                      updateButtons(next)
                                    }}
                                  >
                                    <SelectTrigger className="h-11 w-full bg-zinc-950/40 border-white/10 text-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="URL" disabled={!allowedButtonTypes.has('URL')}>Acessar o site</SelectItem>
                                      <SelectItem value="PHONE_NUMBER" disabled={!allowedButtonTypes.has('PHONE_NUMBER')}>Ligar</SelectItem>
                                      <SelectItem value="COPY_CODE" disabled={!allowedButtonTypes.has('COPY_CODE')}>Copiar código da oferta</SelectItem>
                                      <SelectItem value="FLOW" disabled={!allowedButtonTypes.has('FLOW')}>Concluir flow</SelectItem>
                                      <SelectItem value="VOICE_CALL" disabled={!allowedButtonTypes.has('VOICE_CALL')}>Ligar no WhatsApp</SelectItem>
                                      <SelectItem value="CATALOG" disabled={!allowedButtonTypes.has('CATALOG')}>Catálogo</SelectItem>
                                      <SelectItem value="MPM" disabled={!allowedButtonTypes.has('MPM')}>MPM</SelectItem>
                                      <SelectItem value="ORDER_DETAILS" disabled={!allowedButtonTypes.has('ORDER_DETAILS')}>Detalhes do pedido</SelectItem>
                                      <SelectItem value="SPM" disabled={!allowedButtonTypes.has('SPM')}>SPM</SelectItem>
                                      <SelectItem value="SEND_LOCATION" disabled={!allowedButtonTypes.has('SEND_LOCATION')}>Enviar localização</SelectItem>
                                      <SelectItem value="REMINDER" disabled={!allowedButtonTypes.has('REMINDER')}>Lembrete</SelectItem>
                                      <SelectItem value="POSTBACK" disabled={!allowedButtonTypes.has('POSTBACK')}>Postback</SelectItem>
                                      <SelectItem value="EXTENSION" disabled={!allowedButtonTypes.has('EXTENSION')}>Extensão</SelectItem>
                                      <SelectItem value="OTP" disabled={!allowedButtonTypes.has('OTP')}>OTP</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-gray-300">Texto do botão</div>
                                  <div className="relative">
                                    <Input
                                      value={buttonText}
                                      onChange={(e) => {
                                        const next = [...buttons]
                                        next[idx] = { ...b, text: clampText(e.target.value, maxButtonText) }
                                        updateButtons(next)
                                      }}
                                      className="h-11 bg-zinc-950/40 border-white/10 text-white pr-16"
                                      maxLength={maxButtonText}
                                      placeholder={type === 'URL' ? 'Visualizar' : 'Texto'}
                                    />
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                                      {countChars(buttonText)}/{maxButtonText}
                                    </div>
                                    {hasTextError && (
                                      <div className="mt-1 text-xs text-amber-300">Informe o texto do botão.</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )

                        const bodyRow = (() => {
                          if (type === 'URL') {
                            const url = String(b?.url || '')
                            const isDynamic = /\{\{\s*\d+\s*\}\}/.test(url)
                            const example = (Array.isArray(b?.example) ? b.example[0] : b?.example) || ''

                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-gray-300">Tipo de URL</div>
                                  <Select
                                    value={isDynamic ? 'dynamic' : 'static'}
                                    onValueChange={(v) => {
                                      const next = [...buttons]
                                      const nextUrl = v === 'dynamic'
                                        ? (url.includes('{{') ? url : `${url.replace(/\/$/, '')}/{{1}}`)
                                        : url.replace(/\{\{\s*\d+\s*\}\}/g, '').replace(/\/+$/, '')
                                      next[idx] = { ...b, url: nextUrl }
                                      if (v !== 'dynamic') {
                                        delete next[idx].example
                                      } else {
                                        next[idx].example = Array.isArray(b?.example) ? b.example : [example || 'Exemplo 1']
                                      }
                                      updateButtons(next)
                                    }}
                                  >
                                    <SelectTrigger className="h-11 w-full bg-zinc-950/40 border-white/10 text-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="static">Estático</SelectItem>
                                      <SelectItem value="dynamic">Dinâmico</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-gray-300">URL do site</div>
                                  <Input
                                    value={url}
                                    onChange={(e) => {
                                      const next = [...buttons]
                                      next[idx] = { ...b, url: e.target.value }
                                      updateButtons(next)
                                    }}
                                    className="h-11 bg-zinc-950/40 border-white/10 text-white"
                                    placeholder="https://www.exemplo.com"
                                  />
                                </div>

                                {isDynamic ? (
                                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1">
                                      <div className="text-xs font-medium text-gray-300">Exemplo</div>
                                      <Input
                                        value={example}
                                        onChange={(e) => {
                                          const next = [...buttons]
                                          next[idx] = { ...b, example: [e.target.value] }
                                          updateButtons(next)
                                        }}
                                        className="h-11 bg-zinc-950/40 border-white/10 text-white"
                                        placeholder="Exemplo 1"
                                      />
                                    </div>
                                    <div className="text-xs text-gray-500 self-end">
                                      Use <span className="font-mono">{'{{1}}'}</span> para URL dinâmica.
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            )
                          }

                          if (type === 'PHONE_NUMBER') {
                            const { country, number } = splitPhone(String(b?.phone_number || ''))
                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-gray-300">País</div>
                                  <Select
                                    value={country}
                                    onValueChange={(v) => {
                                      const next = [...buttons]
                                      next[idx] = { ...b, phone_number: joinPhone(v, number) }
                                      updateButtons(next)
                                    }}
                                  >
                                    <SelectTrigger className="h-11 w-full bg-zinc-950/40 border-white/10 text-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="55">BR +55</SelectItem>
                                      <SelectItem value="1">US +1</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-gray-300">Telefone</div>
                                  <Input
                                    value={number}
                                    onChange={(e) => {
                                      const next = [...buttons]
                                      next[idx] = { ...b, phone_number: joinPhone(country, e.target.value) }
                                      updateButtons(next)
                                    }}
                                    className="h-11 bg-zinc-950/40 border-white/10 text-white"
                                    placeholder="(11) 99999-7777"
                                  />
                                </div>
                              </div>
                            )
                          }

                          if (type === 'COPY_CODE') {
                            const maxCodeLength = isLimitedTimeOffer ? 15 : 20
                            const code = String((Array.isArray(b?.example) ? b.example[0] : b?.example) || '')
                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-gray-300">Código da oferta (máx {maxCodeLength})</div>
                                  <Input
                                    value={code}
                                    onChange={(e) => {
                                      const next = [...buttons]
                                      next[idx] = { ...b, example: clampText(e.target.value, maxCodeLength) }
                                      updateButtons(next)
                                    }}
                                    className="h-11 bg-zinc-950/40 border-white/10 text-white"
                                    placeholder="1234"
                                  />
                                </div>
                                <div className="text-xs text-gray-500">
                                  O código é exibido ao usuário e pode ser copiado.
                                </div>
                              </div>
                            )
                          }

                          if (type === 'FLOW') {
                            const currentFlowId = String(b.flow_id || '')
                            const hasMatch = publishedFlows.some((f) => String(f.meta_flow_id || '') === currentFlowId)
                            const selectValue = hasMatch ? currentFlowId : '__manual__'

                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-gray-300">Escolher Flow publicado</div>
                                  <Select
                                    value={selectValue}
                                    onValueChange={(v) => {
                                      const next = [...buttons]
                                      next[idx] = v === '__manual__' ? { ...b, flow_id: '' } : { ...b, flow_id: v }
                                      updateButtons(next)
                                    }}
                                    disabled={flowsQuery.isLoading || publishedFlows.length === 0}
                                  >
                                    <SelectTrigger className="h-11 w-full bg-zinc-950/40 border-white/10 text-white">
                                      <SelectValue
                                        placeholder={
                                          flowsQuery.isLoading
                                            ? 'Carregando…'
                                            : (publishedFlows.length === 0 ? 'Nenhum Flow publicado' : 'Selecionar')
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__manual__">Digitar / colar manualmente</SelectItem>
                                      {publishedFlows.map((f) => (
                                        <SelectItem key={f.id} value={String(f.meta_flow_id)}>
                                          <div className="flex items-center justify-between gap-2 w-full">
                                            <span className="truncate">{f.name} · {String(f.meta_flow_id)}</span>
                                            {(() => {
                                              const st = (f as any)?.meta_status
                                              const status = st ? String(st) : 'DESCONHECIDO'
                                              const cls =
                                                status === 'PUBLISHED'
                                                  ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/20'
                                                  : status === 'DRAFT'
                                                    ? 'bg-amber-500/15 text-amber-200 border-amber-500/20'
                                                    : 'bg-white/5 text-gray-300 border-white/10'
                                              return (
                                                <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] ${cls}`}>
                                                  {status}
                                                </span>
                                              )
                                            })()}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  <div className="mt-3 text-xs font-medium text-gray-300">flow_id</div>
                                  <Input
                                    value={b.flow_id || ''}
                                    onChange={(e) => {
                                      const next = [...buttons]
                                      next[idx] = { ...b, flow_id: e.target.value }
                                      updateButtons(next)
                                    }}
                                    className="h-11 bg-zinc-950/40 border-white/10 text-white"
                                    placeholder="Usar existente"
                                  />
                                  <div className="text-[11px] text-gray-500">
                                    Dica: publique o Flow no Builder e selecione acima. Isso coloca o <span className="font-mono">meta_flow_id</span> aqui.
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-gray-300">flow_action</div>
                                  <Select
                                    value={b.flow_action || 'navigate'}
                                    onValueChange={(v) => {
                                      const next = [...buttons]
                                      next[idx] = { ...b, flow_action: v }
                                      updateButtons(next)
                                    }}
                                  >
                                    <SelectTrigger className="h-11 w-full bg-zinc-950/40 border-white/10 text-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="navigate">navigate</SelectItem>
                                      <SelectItem value="data_exchange">data_exchange</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )
                          }

                          return null
                        })()

                        return (
                          <div key={idx} className={rowClassName}>
                            <button
                              type="button"
                              onClick={() => updateButtons(buttons.filter((_, i) => i !== idx))}
                              className="absolute right-4 top-4 h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5"
                              title="Remover"
                              aria-label="Remover"
                            >
                              <X className="w-4 h-4" />
                            </button>

                            <div className="space-y-4">
                              {headerRow}
                              {bodyRow ? (
                                <div className="pl-8.5">
                                  {bodyRow}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}

                      <div className="text-xs text-gray-500">
                        Regras: URL máx 2, Ligar máx 1, Copiar código máx 1, OTP máx 1; Respostas rápidas ficam agrupadas.
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {counts.total >= maxButtons ? (
            <div className="text-xs text-amber-300">
              Você já atingiu o limite de {maxButtons} botões.
            </div>
          ) : null}
          {buttonErrors.length ? (
            <div className="text-xs text-amber-300 space-y-1">
              {buttonErrors.map((err) => (
                <div key={err}>{err}</div>
              ))}
            </div>
          ) : null}
          </div>
        )}

        {step === 3 && (
          <div className={`${panelClass} ${panelCompactPadding}`}>
          <details>
            <summary className="cursor-pointer list-none select-none flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Avançado</div>
                <div className="text-xs text-gray-400">Opções menos comuns (LTO, Auth e Carousel).</div>
              </div>
              <div className="text-xs text-gray-500">Abrir</div>
            </summary>

            <div className="mt-4 space-y-4">
              {spec.category === 'MARKETING' ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="text-sm font-semibold text-white">Limited Time Offer</div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="border-white/10 bg-zinc-950/40 hover:bg-white/5"
                      onClick={() => {
                        if (spec.limited_time_offer) {
                          update({ limited_time_offer: null })
                          return
                        }

                        const next: Partial<Spec> = { limited_time_offer: { text: '', has_expiration: true } }
                        if (spec.footer) next.footer = null
                        if (header?.format && !['IMAGE', 'VIDEO'].includes(String(header.format))) {
                          next.header = null
                        }

                        update(next)

                        if (spec.footer) {
                          toast.message('Limited Time Offer não permite rodapé. Removemos o rodapé.')
                        }
                        if (header?.format && !['IMAGE', 'VIDEO'].includes(String(header.format))) {
                          toast.message('Limited Time Offer só permite cabeçalho com imagem ou vídeo. Removemos o cabeçalho.')
                        }
                      }}
                    >
                      {spec.limited_time_offer ? 'Remover' : 'Adicionar'}
                    </Button>
                  </div>
                  {spec.limited_time_offer ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-300">Texto (máx 16)</label>
                        <Input
                          value={spec.limited_time_offer.text || ''}
                          onChange={(e) => update({ limited_time_offer: { ...(spec.limited_time_offer || {}), text: e.target.value } })}
                          className="bg-zinc-950/40 border-white/10 text-white"
                          maxLength={16}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-300">has_expiration</label>
                        <Select
                          value={String(!!spec.limited_time_offer.has_expiration)}
                          onValueChange={(v) => update({ limited_time_offer: { ...(spec.limited_time_offer || {}), has_expiration: v === 'true' } })}
                        >
                          <SelectTrigger className="w-full bg-zinc-950/40 border-white/10 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">true</SelectItem>
                            <SelectItem value="false">false</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : null}
                  {spec.limited_time_offer ? (
                    <div className="text-xs text-gray-500">
                      Regras: body máx 600, cabeçalho só imagem/vídeo, sem rodapé, COPY_CODE máx 15.
                    </div>
                  ) : null}
                  {spec.limited_time_offer && limitedTimeOfferTextTooLong ? (
                    <div className="text-xs text-amber-300">Texto do LTO deve ter até 16 caracteres.</div>
                  ) : null}
                  {spec.limited_time_offer && limitedTimeOfferTextMissing ? (
                    <div className="text-xs text-amber-300">Texto do LTO é obrigatório.</div>
                  ) : null}
                  {spec.limited_time_offer && limitedTimeOfferCategoryInvalid ? (
                    <div className="text-xs text-amber-300">Limited Time Offer só é permitido em Marketing.</div>
                  ) : null}
                </div>
              ) : null}

              {spec.category === 'AUTHENTICATION' ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="text-sm font-semibold text-white">Autenticação (Auth)</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-300">message_send_ttl_seconds</label>
                      <Input
                        value={spec.message_send_ttl_seconds ?? ''}
                        onChange={(e) => update({ message_send_ttl_seconds: e.target.value ? Number(e.target.value) : undefined })}
                        className="bg-zinc-950/40 border-white/10 text-white"
                        placeholder="ex: 300"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-300">add_security_recommendation</label>
                      <Select
                        value={String(!!spec.add_security_recommendation)}
                        onValueChange={(v) => update({ add_security_recommendation: v === 'true' })}
                      >
                        <SelectTrigger className="w-full bg-zinc-950/40 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">true</SelectItem>
                          <SelectItem value="false">false</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-300">code_expiration_minutes</label>
                      <Input
                        value={spec.code_expiration_minutes ?? ''}
                        onChange={(e) => update({ code_expiration_minutes: e.target.value ? Number(e.target.value) : undefined })}
                        className="bg-zinc-950/40 border-white/10 text-white"
                        placeholder="ex: 10"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {spec.category !== 'MARKETING' && spec.category !== 'AUTHENTICATION' ? (
                <div className="text-xs text-gray-500">
                  Sem opções avançadas específicas para esta categoria.
                </div>
              ) : null}

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">Carousel</div>
                <div className="text-xs text-gray-400">
                  Editor visual completo do Carousel vem depois. Por enquanto, você pode colar o JSON.
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-300">JSON (carousel)</label>
                  <Textarea
                    value={spec.carousel ? JSON.stringify(spec.carousel, null, 2) : ''}
                    onChange={(e) => {
                      try {
                        const val = e.target.value.trim()
                        update({ carousel: val ? JSON.parse(val) : null })
                      } catch {
                        // não travar digitando
                      }
                    }}
                    className="bg-zinc-950/40 border-white/10 text-white min-h-28 font-mono text-xs"
                    placeholder="Cole aqui um JSON de carousel (opcional)"
                  />
                </div>
                {carouselErrors.length ? (
                  <div className="text-xs text-amber-300 space-y-1">
                    {carouselErrors.map((err) => (
                      <div key={err}>{err}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </details>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 px-5 py-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <button
              type="button"
              onClick={() => setStep((prev) => Math.max(1, prev - 1))}
              disabled={step === 1}
              className={`text-sm transition ${step === 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}
            >
              Voltar
            </button>
            <div className="text-center text-xs text-gray-500">
              {step === 1 && !isConfigComplete && 'Complete a configuração para continuar'}
              {step === 2 && !isContentComplete && (
                !isHeaderFormatValid
                  ? 'Tipo de cabeçalho inválido'
                  : !isHeaderVariableValid
                    ? 'Cabeçalho permite apenas 1 variável'
                    : hasInvalidNamed
                      ? 'Corrija as variáveis: use minúsculas e underscore'
                    : hasDuplicateNamed
                      ? 'Nomes de variável devem ser únicos'
                    : hasMissingPositional
                      ? 'Sequência posicional deve começar em {{1}} e não ter buracos'
                    : hasInvalidPositional
                      ? 'No modo numérico, use apenas {{1}}, {{2}}…'
                    : footerHasVariables
                      ? 'Rodapé não permite variáveis'
                    : headerEdgeParameter.starts || headerEdgeParameter.ends
                      ? 'O cabeçalho não pode começar nem terminar com variável'
                    : bodyEdgeParameter.starts || bodyEdgeParameter.ends
                      ? 'O corpo não pode começar nem terminar com variável'
                    : hasLengthErrors
                      ? 'Revise os limites de caracteres'
                    : ltoHeaderInvalid
                      ? 'LTO aceita apenas cabeçalho imagem/vídeo'
                    : ltoFooterInvalid
                      ? 'LTO não permite rodapé'
                    : 'Preencha o corpo do template para continuar'
              )}
              {step === 3 && (
                isButtonsValid
                  ? 'Reveja os botões e envie para aprovação'
                  : buttonErrors.length
                    ? 'Revise as regras dos botões'
                    : carouselErrors.length
                      ? 'Revise o carousel'
                      : limitedTimeOfferCategoryInvalid
                        ? 'LTO só é permitido em Marketing'
                        : limitedTimeOfferTextTooLong || ltoCopyCodeMissing || ltoCopyCodeTooLong || ltoHeaderInvalid || ltoFooterInvalid
                          ? 'Revise o Limited Time Offer'
                          : 'Revise as regras do template'
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (!canContinue || isFinishing) return
                if (step < 3) {
                  setStep((prev) => Math.min(3, prev + 1))
                  return
                }
                // Último passo: delega a ação ao pai (ex.: salvar + enviar)
                onFinish?.()
              }}
              disabled={!canContinue || !!isFinishing}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                !isFinishing && canContinue
                  ? 'bg-white text-black hover:bg-gray-200'
                  : 'cursor-not-allowed border border-white/10 bg-white/10 text-gray-500'
              }`}
            >
              {step < 3 ? (
                'Continuar'
              ) : isFinishing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando pra Meta…
                </span>
              ) : (
                (onFinish ? 'Enviar pra Meta' : 'Fim')
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6 lg:sticky lg:top-6 self-start">
        <Preview spec={spec} />

        <div className={`${panelClass} ${panelCompactPadding}`}>
          <details>
            <summary className="cursor-pointer list-none select-none flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Avançado</div>
              <div className="text-xs text-gray-400">Abrir</div>
            </summary>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowDebug((v) => !v)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="text-sm font-semibold text-white">Debug</div>
                <div className="text-xs text-gray-400">{showDebug ? 'Ocultar' : 'Ver JSON'}</div>
              </button>
              {showDebug ? (
                <pre className="mt-3 text-xs text-gray-300 font-mono whitespace-pre-wrap wrap-break-word">
                  {JSON.stringify(spec, null, 2)}
                </pre>
              ) : null}
            </div>
          </details>
        </div>
      </div>
      <Dialog open={namedVarDialogOpen} onOpenChange={setNamedVarDialogOpen}>
        <DialogContent className="sm:max-w-105">
          <DialogHeader>
            <DialogTitle>Variavel nomeada</DialogTitle>
            <DialogDescription>Use apenas minúsculas, números e underscore.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-300">Nome da variavel</label>
            <Input
              value={namedVarName}
              onChange={(e) => {
                setNamedVarName(e.target.value)
                if (namedVarError) setNamedVarError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmNamedVariable()
                }
              }}
              placeholder="ex: first_name"
              className="bg-zinc-950/40 border-white/10 text-white"
              autoFocus
            />
            {namedVarError ? <p className="text-xs text-amber-300">{namedVarError}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setNamedVarDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmNamedVariable}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
