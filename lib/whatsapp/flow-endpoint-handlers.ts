/**
 * WhatsApp Flow Endpoint - Handlers
 *
 * Processa as acoes do WhatsApp Flow para agendamento dinamico.
 * Integra com Google Calendar para buscar slots e criar eventos.
 */

import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'
import { addDays, startOfDay, endOfDay, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  getCalendarConfig,
  listBusyTimes,
  createEvent,
  type GoogleCalendarConfig,
} from '@/lib/google-calendar'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  createSuccessResponse,
  createCloseResponse,
  createErrorResponse,
  type FlowDataExchangeRequest,
} from './flow-endpoint-crypto'

// --- Tipos ---

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

type WorkingHoursDay = {
  day: Weekday
  enabled: boolean
  start: string
  end: string
}

type CalendarBookingConfig = {
  timezone: string
  slotDurationMinutes: number
  slotBufferMinutes: number
  workingHours: WorkingHoursDay[]
}

type ServiceType = {
  id: string
  title: string
  durationMinutes?: number
}

// --- Constantes ---

const WEEKDAY_KEYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const DEFAULT_SERVICES: ServiceType[] = [
  { id: 'consulta', title: 'Consulta', durationMinutes: 30 },
  { id: 'visita', title: 'Visita', durationMinutes: 60 },
  { id: 'suporte', title: 'Suporte', durationMinutes: 30 },
]

const DEFAULT_CONFIG: CalendarBookingConfig = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  slotBufferMinutes: 10,
  workingHours: [
    { day: 'mon', enabled: true, start: '09:00', end: '18:00' },
    { day: 'tue', enabled: true, start: '09:00', end: '18:00' },
    { day: 'wed', enabled: true, start: '09:00', end: '18:00' },
    { day: 'thu', enabled: true, start: '09:00', end: '18:00' },
    { day: 'fri', enabled: true, start: '09:00', end: '18:00' },
    { day: 'sat', enabled: false, start: '09:00', end: '13:00' },
    { day: 'sun', enabled: false, start: '09:00', end: '13:00' },
  ],
}

// --- Helpers ---

async function getCalendarBookingConfig(): Promise<CalendarBookingConfig> {
  if (!isSupabaseConfigured()) return DEFAULT_CONFIG
  const raw = await settingsDb.get('calendar_booking_config')
  if (!raw) return DEFAULT_CONFIG
  try {
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return DEFAULT_CONFIG
  }
}

function getWeekdayKey(date: Date, timeZone: string): Weekday {
  const isoDay = Number(formatInTimeZone(date, timeZone, 'i'))
  return WEEKDAY_KEYS[isoDay - 1]
}

function isWorkingDay(date: Date, timeZone: string, workingHours: WorkingHoursDay[]): boolean {
  const dayKey = getWeekdayKey(date, timeZone)
  const workingDay = workingHours.find((d) => d.day === dayKey)
  return workingDay?.enabled ?? false
}

function parseTimeToMinutes(value: string): number {
  const [hh, mm] = value.split(':').map(Number)
  return (hh || 0) * 60 + (mm || 0)
}

/**
 * Gera lista de datas disponiveis (proximos N dias uteis)
 */
async function getAvailableDates(daysToShow: number = 14): Promise<Array<{ id: string; title: string }>> {
  const config = await getCalendarBookingConfig()
  const timeZone = config.timezone
  const today = startOfDay(toZonedTime(new Date(), timeZone))

  const dates: Array<{ id: string; title: string }> = []
  let cursor = today
  let attempts = 0
  const maxAttempts = 60 // Evita loop infinito

  while (dates.length < daysToShow && attempts < maxAttempts) {
    if (isWorkingDay(cursor, timeZone, config.workingHours)) {
      const dateStr = format(cursor, 'yyyy-MM-dd')
      const displayStr = format(cursor, "EEE, d 'de' MMM", { locale: ptBR })
      dates.push({
        id: dateStr,
        title: displayStr.charAt(0).toUpperCase() + displayStr.slice(1),
      })
    }
    cursor = addDays(cursor, 1)
    attempts++
  }

  return dates
}

/**
 * Busca slots disponiveis para uma data especifica
 */
async function getAvailableSlots(
  dateStr: string
): Promise<Array<{ id: string; title: string }>> {
  const config = await getCalendarBookingConfig()
  const calendarConfig = await getCalendarConfig()
  const calendarId = calendarConfig?.calendarId

  if (!calendarId) {
    throw new Error('Google Calendar nao conectado')
  }

  const timeZone = config.timezone
  const slotDuration = config.slotDurationMinutes
  const bufferMinutes = config.slotBufferMinutes

  // Limites do dia
  const dayStart = fromZonedTime(`${dateStr}T00:00:00`, timeZone)
  const dayEnd = fromZonedTime(`${dateStr}T23:59:59`, timeZone)
  const now = new Date()

  // Busca ocupacoes do calendario
  const busyItems = await listBusyTimes({
    calendarId,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    timeZone,
  })

  const bufferMs = bufferMinutes * 60 * 1000
  const busy = busyItems.map((item) => ({
    startMs: new Date(item.start).getTime() - bufferMs,
    endMs: new Date(item.end).getTime() + bufferMs,
  }))

  // Pega horario de trabalho do dia
  const dayKey = getWeekdayKey(dayStart, timeZone)
  const workingDay = config.workingHours.find((d) => d.day === dayKey)

  if (!workingDay?.enabled) {
    return []
  }

  const workStart = parseTimeToMinutes(workingDay.start)
  const workEnd = parseTimeToMinutes(workingDay.end)

  // Gera slots
  const slots: Array<{ id: string; title: string }> = []
  let currentMinutes = workStart

  while (currentMinutes + slotDuration <= workEnd) {
    const hours = Math.floor(currentMinutes / 60)
    const mins = currentMinutes % 60
    const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`

    const slotStart = fromZonedTime(`${dateStr}T${timeStr}:00`, timeZone)
    const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000)

    // Verifica se slot esta no passado
    if (slotStart.getTime() <= now.getTime()) {
      currentMinutes += slotDuration
      continue
    }

    // Verifica colisao com eventos ocupados
    const slotStartMs = slotStart.getTime()
    const slotEndMs = slotEnd.getTime()
    const hasConflict = busy.some(
      (b) => slotStartMs < b.endMs && slotEndMs > b.startMs
    )

    if (!hasConflict) {
      slots.push({
        id: slotStart.toISOString(),
        title: timeStr,
      })
    }

    currentMinutes += slotDuration
  }

  return slots
}

/**
 * Cria evento no Google Calendar
 */
async function createBookingEvent(params: {
  slotIso: string
  service: string
  customerName: string
  customerPhone: string
  notes?: string
}): Promise<{ eventId: string; eventLink?: string }> {
  const config = await getCalendarBookingConfig()
  const calendarConfig = await getCalendarConfig()
  const calendarId = calendarConfig?.calendarId

  if (!calendarId) {
    throw new Error('Google Calendar nao conectado')
  }

  const slotStart = new Date(params.slotIso)
  const slotEnd = new Date(slotStart.getTime() + config.slotDurationMinutes * 60 * 1000)

  const serviceInfo = DEFAULT_SERVICES.find((s) => s.id === params.service)
  const serviceName = serviceInfo?.title || params.service

  const event = await createEvent({
    calendarId,
    event: {
      summary: `${serviceName} - ${params.customerName}`,
      description: [
        `Cliente: ${params.customerName}`,
        `Telefone: ${params.customerPhone}`,
        params.notes ? `Observacoes: ${params.notes}` : null,
        '',
        'Agendado via WhatsApp (SmartZap)',
      ]
        .filter(Boolean)
        .join('\n'),
      start: {
        dateTime: slotStart.toISOString(),
        timeZone: config.timezone,
      },
      end: {
        dateTime: slotEnd.toISOString(),
        timeZone: config.timezone,
      },
    },
  })

  return {
    eventId: event.id || 'created',
    eventLink: event.htmlLink,
  }
}

// --- Handler Principal ---

export async function handleFlowAction(
  request: FlowDataExchangeRequest
): Promise<Record<string, unknown>> {
  const { action, screen, data } = request

  console.log('[flow-handler] Processing:', { action, screen, data })

  // Notificacao de erro do client: apenas reconhecer o payload
  if (data && typeof data === 'object' && 'error' in data) {
    return {
      data: {
        acknowledged: true,
      },
    }
  }

  switch (action) {
    case 'INIT':
      return handleInit()

    case 'data_exchange':
      return handleDataExchange(screen || '', data || {})

    case 'BACK':
      return handleBack(screen || '', data || {})

    default:
      return createErrorResponse(`Acao desconhecida: ${action}`)
  }
}

/**
 * INIT - Primeira tela do flow
 * Retorna lista de servicos e datas disponiveis
 */
async function handleInit(): Promise<Record<string, unknown>> {
  try {
    const dates = await getAvailableDates(14)

    return createSuccessResponse('BOOKING_START', {
      services: DEFAULT_SERVICES.map((s) => ({ id: s.id, title: s.title })),
      dates,
      // Mensagens de UI
      title: 'Agendar Atendimento',
      subtitle: 'Escolha o tipo de atendimento e a data desejada',
    })
  } catch (error) {
    console.error('[flow-handler] INIT error:', error)
    return createErrorResponse('Erro ao carregar opcoes de agendamento')
  }
}

/**
 * data_exchange - Usuario interagiu com o flow
 */
async function handleDataExchange(
  screen: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    switch (screen) {
      // Usuario selecionou servico e data, buscar horarios
      case 'BOOKING_START': {
        const selectedDate = data.selected_date as string
        const selectedService = data.selected_service as string

        if (!selectedDate) {
          return createErrorResponse('Selecione uma data')
        }

        const slots = await getAvailableSlots(selectedDate)

        if (slots.length === 0) {
          return createSuccessResponse('BOOKING_START', {
            ...data,
            error_message: 'Nenhum horario disponivel nesta data. Escolha outra data.',
          })
        }

        return createSuccessResponse('SELECT_TIME', {
          selected_service: selectedService,
          selected_date: selectedDate,
          slots,
          title: 'Escolha o Horario',
          subtitle: `Horarios disponiveis para ${selectedDate}`,
        })
      }

      // Usuario selecionou horario, pedir dados do cliente
      case 'SELECT_TIME': {
        const selectedSlot = data.selected_slot as string
        const selectedService = data.selected_service as string
        const selectedDate = data.selected_date as string

        if (!selectedSlot) {
          return createErrorResponse('Selecione um horario')
        }

        return createSuccessResponse('CUSTOMER_INFO', {
          selected_service: selectedService,
          selected_date: selectedDate,
          selected_slot: selectedSlot,
          title: 'Seus Dados',
          subtitle: 'Preencha seus dados para confirmar',
        })
      }

      // Usuario preencheu dados, confirmar agendamento
      case 'CUSTOMER_INFO': {
        const customerName = data.customer_name as string
        const customerPhone = data.customer_phone as string
        const notes = data.notes as string
        const selectedSlot = data.selected_slot as string
        const selectedService = data.selected_service as string

        if (!customerName?.trim()) {
          return createErrorResponse('Informe seu nome')
        }

        // Criar evento no calendario
        const result = await createBookingEvent({
          slotIso: selectedSlot,
          service: selectedService,
          customerName: customerName.trim(),
          customerPhone: customerPhone || '',
          notes,
        })

        // Formatar horario para exibicao
        const slotDate = new Date(selectedSlot)
        const config = await getCalendarBookingConfig()
        const formattedTime = formatInTimeZone(slotDate, config.timezone, 'HH:mm')
        const formattedDate = formatInTimeZone(slotDate, config.timezone, "d 'de' MMMM", {
          locale: ptBR,
        })

        const serviceInfo = DEFAULT_SERVICES.find((s) => s.id === selectedService)
        const serviceName = serviceInfo?.title || selectedService

        // Finalizar flow com confirmacao
        return createCloseResponse({
          success: true,
          event_id: result.eventId,
          message: `Agendamento confirmado!\n\n${serviceName}\n${formattedDate} as ${formattedTime}\n\nVoce recebera um lembrete.`,
        })
      }

      default:
        return createErrorResponse(`Tela desconhecida: ${screen}`)
    }
  } catch (error) {
    console.error('[flow-handler] data_exchange error:', error)
    return createErrorResponse(
      error instanceof Error ? error.message : 'Erro ao processar'
    )
  }
}

/**
 * BACK - Usuario voltou para tela anterior
 */
async function handleBack(
  screen: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (screen) {
    case 'SELECT_TIME':
      // Voltar para selecao de data
      return handleInit()

    case 'CUSTOMER_INFO': {
      // Voltar para selecao de horario
      const selectedDate = data.selected_date as string
      if (selectedDate) {
        const slots = await getAvailableSlots(selectedDate)
        return createSuccessResponse('SELECT_TIME', {
          ...data,
          slots,
        })
      }
      return handleInit()
    }

    default:
      return handleInit()
  }
}
