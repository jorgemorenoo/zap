/**
 * WhatsApp Flow Endpoint - Handlers
 *
 * Processa as acoes do WhatsApp Flow para agendamento dinamico.
 * Integra com Google Calendar para buscar slots e criar eventos.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
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
  slots?: Array<{ start: string; end: string }>
}

type CalendarBookingConfig = {
  timezone: string
  slotDurationMinutes: number
  slotBufferMinutes: number
  workingHours: WorkingHoursDay[]
  minAdvanceHours?: number
  maxAdvanceDays?: number
  allowSimultaneous?: boolean
}

type ServiceType = {
  id: string
  title: string
  durationMinutes?: number
}

// --- Constantes ---

const WEEKDAY_KEYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const WEEKDAY_LABELS: Record<Weekday, 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

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
  minAdvanceHours: 4,
  maxAdvanceDays: 14,
  allowSimultaneous: false,
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

const WEEKDAY_FULL_LABELS: Record<Weekday, string> = {
  mon: 'Segunda',
  tue: 'Terca',
  wed: 'Quarta',
  thu: 'Quinta',
  fri: 'Sexta',
  sat: 'Sabado',
  sun: 'Domingo',
}

function getWeekdayLabel(date: Date, timeZone: string): string {
  const isoDay = Number(formatInTimeZone(date, timeZone, 'i'))
  const dayKey = WEEKDAY_KEYS[isoDay - 1]
  return WEEKDAY_FULL_LABELS[dayKey]
}

function formatDateLabel(dateStr: string, timeZone: string): string {
  const date = fromZonedTime(`${dateStr}T00:00:00`, timeZone)
  const dayLabel = getWeekdayLabel(date, timeZone)
  return `${formatInTimeZone(date, timeZone, 'dd/MM/yyyy')} (${dayLabel})`
}

function formatDateChip(dateStr: string, timeZone: string): string {
  const date = fromZonedTime(`${dateStr}T00:00:00`, timeZone)
  const dayLabel = getWeekdayLabel(date, timeZone)
  return `${dayLabel} - ${formatInTimeZone(date, timeZone, 'dd/MM')}`
}

type CalendarPickerData = {
  minDate: string
  maxDate: string
  includeDays: Array<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'>
  unavailableDates: string[]
}

/**
 * Dados para CalendarPicker (min/max e dias permitidos)
 */
async function getCalendarPickerData(): Promise<CalendarPickerData> {
  const config = await getCalendarBookingConfig()
  const timeZone = config.timezone
  const maxAdvanceDays = config.maxAdvanceDays ?? 14
  
  // Pega a data atual no timezone correto (ex: America/Sao_Paulo)
  const todayStr = formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd')
  const [year, month, day] = todayStr.split('-').map(Number)

  const maxUtcDate = new Date(Date.UTC(year, month - 1, day + maxAdvanceDays, 12, 0, 0))
  const maxDateStr = maxUtcDate.toISOString().split('T')[0]

  const includeDays = config.workingHours
    .filter((d) => d.enabled)
    .map((d) => WEEKDAY_LABELS[d.day])

  const unavailableDates: string[] = []
  for (let dayOffset = 0; dayOffset <= maxAdvanceDays; dayOffset += 1) {
    const utcDate = new Date(Date.UTC(year, month - 1, day + dayOffset, 12, 0, 0))
    const dateStr = utcDate.toISOString().split('T')[0]
    const jsDay = utcDate.getUTCDay()
    const isoDay = jsDay === 0 ? 7 : jsDay
    const dayKey = WEEKDAY_KEYS[isoDay - 1]
    const workingDay = config.workingHours.find((d) => d.day === dayKey)
    if (!workingDay?.enabled) {
      unavailableDates.push(dateStr)
    }
  }

  return {
    minDate: todayStr,
    maxDate: maxDateStr,
    includeDays,
    unavailableDates,
  }
}

/**
 * Busca slots disponiveis para uma data especifica
 * 
 * Respeita:
 * - minAdvanceHours: não mostra slots que estão dentro do período mínimo de antecedência
 * - Eventos ocupados no Google Calendar
 * - Buffer entre slots
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
  const minAdvanceHours = config.minAdvanceHours ?? 0

  // Limites do dia
  const dayStart = fromZonedTime(`${dateStr}T00:00:00`, timeZone)
  const dayEnd = fromZonedTime(`${dateStr}T23:59:59`, timeZone)
  const now = new Date()
  
  // Calcula o horário mínimo permitido (agora + minAdvanceHours)
  const minAllowedTime = new Date(now.getTime() + minAdvanceHours * 60 * 60 * 1000)

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

  // Suporta múltiplos períodos por dia (ex: 9h-12h e 14h-18h)
  // Se não tiver slots definidos, usa start/end como período único
  const workPeriods = workingDay.slots && workingDay.slots.length > 0
    ? workingDay.slots
    : [{ start: workingDay.start, end: workingDay.end }]

  // Gera slots para cada período de trabalho
  const slots: Array<{ id: string; title: string }> = []

  for (const period of workPeriods) {
    const workStart = parseTimeToMinutes(period.start)
    const workEnd = parseTimeToMinutes(period.end)
    let currentMinutes = workStart

    while (currentMinutes + slotDuration <= workEnd) {
      const hours = Math.floor(currentMinutes / 60)
      const mins = currentMinutes % 60
      const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`

      const slotStart = fromZonedTime(`${dateStr}T${timeStr}:00`, timeZone)
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000)

      // Verifica se slot está no passado ou dentro do período mínimo de antecedência
      if (slotStart.getTime() <= minAllowedTime.getTime()) {
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

  console.log('[flow-handler] 📋 Processing:', { action, screen, dataKeys: data ? Object.keys(data) : [] })

  // Notificacao de erro do client: apenas reconhecer o payload
  if (data && typeof data === 'object' && 'error' in data) {
    console.log('[flow-handler] ⚠️ Error notification received, acknowledging')
    return {
      data: {
        acknowledged: true,
      },
    }
  }

  let result: Record<string, unknown>
  switch (action) {
    case 'INIT':
      result = await handleInit()
      break

    case 'data_exchange':
      result = await handleDataExchange(screen || '', data || {})
      break

    case 'BACK':
      result = await handleBack(screen || '', data || {})
      break

    default:
      result = createErrorResponse(`Acao desconhecida: ${action}`)
  }

  console.log('[flow-handler] ✅ Result screen:', (result as Record<string, unknown>).screen ?? 'none')

  return result
}

/**
 * INIT - Primeira tela do flow
 * Retorna lista de servicos e datas disponiveis
 */
async function handleInit(): Promise<Record<string, unknown>> {
  try {
    const calendarPicker = await getCalendarPickerData()

    return createSuccessResponse('BOOKING_START', {
      services: DEFAULT_SERVICES.map((s) => ({ id: s.id, title: s.title })),
      min_date: calendarPicker.minDate,
      max_date: calendarPicker.maxDate,
      include_days: calendarPicker.includeDays,
      unavailable_dates: calendarPicker.unavailableDates,
      // Mensagens de UI
      title: 'Agendar Atendimento',
      subtitle: 'Escolha o tipo de atendimento e a data desejada',
      error_message: '',
      has_error: false,
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
          const calendarPicker = await getCalendarPickerData()
          const config = await getCalendarBookingConfig()
          const formattedChip = formatDateChip(selectedDate, config.timezone)
          return createSuccessResponse('BOOKING_START', {
            ...data,
            min_date: calendarPicker.minDate,
            max_date: calendarPicker.maxDate,
            include_days: calendarPicker.includeDays,
            unavailable_dates: calendarPicker.unavailableDates,
            error_message: `${formattedChip} sem horarios. Escolha outra data.`,
            has_error: true,
          })
        }

        const config = await getCalendarBookingConfig()
        const formattedDate = formatDateLabel(selectedDate, config.timezone)

        return createSuccessResponse('SELECT_TIME', {
          selected_service: selectedService,
          selected_date: selectedDate,
          slots,
          title: 'Escolha o Horario',
          subtitle: `Horarios disponiveis para ${formattedDate}`,
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
        const dateKey = formatInTimeZone(slotDate, config.timezone, 'yyyy-MM-dd')
        const formattedDate = formatDateLabel(dateKey, config.timezone)

        const serviceInfo = DEFAULT_SERVICES.find((s) => s.id === selectedService)
        const serviceName = serviceInfo?.title || selectedService

        // Finalizar flow com confirmacao
        return createCloseResponse({
          success: true,
          event_id: result.eventId,
          selected_service: selectedService,
          selected_date: formatInTimeZone(slotDate, config.timezone, 'yyyy-MM-dd'),
          selected_slot: selectedSlot,
          customer_name: customerName.trim(),
          customer_phone: customerPhone || '',
          notes: notes || '',
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
        const config = await getCalendarBookingConfig()
        const formattedDate = formatDateLabel(selectedDate, config.timezone)
        return createSuccessResponse('SELECT_TIME', {
          ...data,
          slots,
          title: 'Escolha o Horario',
          subtitle: `Horarios disponiveis para ${formattedDate}`,
        })
      }
      return handleInit()
    }

    default:
      return handleInit()
  }
}
