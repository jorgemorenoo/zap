import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

const CONFIG_KEY = 'calendar_booking_config'

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

interface WorkingHoursDay {
  day: Weekday
  enabled: boolean
  start: string
  end: string
}

export interface CalendarBookingConfig {
  timezone: string
  slotDurationMinutes: number
  slotBufferMinutes: number
  workingHours: WorkingHoursDay[]
}

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

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function boolFromUnknown(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'on'
  if (typeof value === 'number') return value === 1
  return fallback
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return fallback
  const [hh, mm] = trimmed.split(':').map(Number)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return fallback
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback
  return trimmed
}

function normalizeConfig(input?: Partial<CalendarBookingConfig>): CalendarBookingConfig {
  const workingHoursInput = Array.isArray(input?.workingHours) ? input?.workingHours : []
  const byDay = new Map<Weekday, Partial<WorkingHoursDay>>()
  for (const entry of workingHoursInput) {
    if (!entry || typeof entry !== 'object') continue
    const day = (entry as WorkingHoursDay).day
    if (!day || !DEFAULT_CONFIG.workingHours.find((d) => d.day === day)) continue
    byDay.set(day, entry as WorkingHoursDay)
  }

  const workingHours = DEFAULT_CONFIG.workingHours.map((defaultDay) => {
    const raw = byDay.get(defaultDay.day)
    if (!raw) return defaultDay
    return {
      day: defaultDay.day,
      enabled: boolFromUnknown(raw.enabled, defaultDay.enabled),
      start: normalizeTime(raw.start, defaultDay.start),
      end: normalizeTime(raw.end, defaultDay.end),
    }
  })

  return {
    timezone: typeof input?.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : DEFAULT_CONFIG.timezone,
    slotDurationMinutes: clampInt(input?.slotDurationMinutes, 5, 240, DEFAULT_CONFIG.slotDurationMinutes),
    slotBufferMinutes: clampInt(input?.slotBufferMinutes, 0, 120, DEFAULT_CONFIG.slotBufferMinutes),
    workingHours,
  }
}

async function getConfigFromDbOrDefault(): Promise<{ config: CalendarBookingConfig; source: 'db' | 'default' }> {
  let raw: string | null = null
  if (isSupabaseConfigured()) {
    try {
      raw = await settingsDb.get(CONFIG_KEY)
    } catch {
      raw = null
    }
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      return { config: normalizeConfig(parsed), source: 'db' }
    } catch {
      // fallthrough
    }
  }

  return { config: DEFAULT_CONFIG, source: 'default' }
}

export async function GET() {
  try {
    const { config, source } = await getConfigFromDbOrDefault()
    return NextResponse.json({ ok: true, source, config })
  } catch (error) {
    console.error('Error fetching calendar booking config:', error)
    return NextResponse.json({ ok: true, source: 'default', config: DEFAULT_CONFIG, warning: 'Falha ao carregar config; usando default.' })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false, error: 'Supabase nao configurado. Complete o setup antes de salvar.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const current = await getConfigFromDbOrDefault()

    const next = normalizeConfig({
      ...current.config,
      ...body,
      workingHours: Array.isArray(body.workingHours) ? body.workingHours : current.config.workingHours,
    })

    await settingsDb.set(CONFIG_KEY, JSON.stringify(next))

    return NextResponse.json({ ok: true, config: next })
  } catch (error) {
    console.error('Error saving calendar booking config:', error)
    return NextResponse.json({ ok: false, error: 'Falha ao salvar configuracao' }, { status: 502 })
  }
}
