'use client';

import React from 'react';
import { Clock, Calendar, Users, Plus, Minus } from 'lucide-react';
import {
  CALENDAR_WEEK_LABELS,
  MIN_ADVANCE_OPTIONS,
  MAX_ADVANCE_OPTIONS,
} from '../../../../hooks/settings/useCalendarBooking';
import type { BookingConfigSectionProps } from './types';
import type { TimeSlot } from '../../../../types';

export function BookingConfigSection({
  calendarBookingLoading,
  calendarBooking,
  isEditingCalendarBooking,
  setIsEditingCalendarBooking,
  calendarDraft,
  updateCalendarDraft,
  updateWorkingHours,
  handleSaveCalendarBooking,
  isSavingCalendarBooking,
}: BookingConfigSectionProps) {
  if (calendarBookingLoading) {
    return (
      <div className="mt-6 text-sm text-gray-400">Carregando configuracoes...</div>
    );
  }

  const enabledDays = calendarDraft.workingHours.filter(d => d.enabled);

  return (
    <>
      {/* Configurações Básicas */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="text-xs text-gray-400 flex items-center gap-2">
            <Clock size={12} />
            Fuso horario
          </div>
          {isEditingCalendarBooking ? (
            <select
              value={calendarDraft.timezone}
              onChange={(e) => updateCalendarDraft({ timezone: e.target.value })}
              className="mt-2 w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-white"
            >
              <option value="America/Sao_Paulo">America/Sao_Paulo</option>
              <option value="America/Fortaleza">America/Fortaleza</option>
              <option value="America/Manaus">America/Manaus</option>
              <option value="America/Cuiaba">America/Cuiaba</option>
              <option value="America/Belem">America/Belem</option>
              <option value="America/Recife">America/Recife</option>
            </select>
          ) : (
            <div className="mt-2 text-sm text-white font-mono">{calendarDraft.timezone}</div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="text-xs text-gray-400 flex items-center gap-2">
            <Clock size={12} />
            Duracao do slot
          </div>
          {isEditingCalendarBooking ? (
            <select
              value={calendarDraft.slotDurationMinutes}
              onChange={(e) => updateCalendarDraft({ slotDurationMinutes: Number(e.target.value) })}
              className="mt-2 w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-white"
            >
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>1 hora</option>
              <option value={90}>1h30</option>
              <option value={120}>2 horas</option>
            </select>
          ) : (
            <div className="mt-2 text-sm text-white font-mono">{calendarDraft.slotDurationMinutes} min</div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="text-xs text-gray-400 flex items-center gap-2">
            <Clock size={12} />
            Buffer entre slots
          </div>
          {isEditingCalendarBooking ? (
            <select
              value={calendarDraft.slotBufferMinutes}
              onChange={(e) => updateCalendarDraft({ slotBufferMinutes: Number(e.target.value) })}
              className="mt-2 w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-white"
            >
              <option value={0}>Sem buffer</option>
              <option value={5}>5 minutos</option>
              <option value={10}>10 minutos</option>
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
            </select>
          ) : (
            <div className="mt-2 text-sm text-white font-mono">{calendarDraft.slotBufferMinutes} min</div>
          )}
        </div>
      </div>

      {/* Regras de Agendamento */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="text-xs text-gray-400 flex items-center gap-2 mb-2">
            <Clock size={12} />
            Tempo minimo de antecedencia
          </div>
          <p className="text-xs text-gray-500 mb-3">Nao permite agendas em cima da hora</p>
          {isEditingCalendarBooking ? (
            <select
              value={calendarDraft.minAdvanceHours ?? 4}
              onChange={(e) => updateCalendarDraft({ minAdvanceHours: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-white"
            >
              {MIN_ADVANCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <div className="text-sm text-white">
              {MIN_ADVANCE_OPTIONS.find(o => o.value === (calendarDraft.minAdvanceHours ?? 4))?.label || `${calendarDraft.minAdvanceHours} horas`}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="text-xs text-gray-400 flex items-center gap-2 mb-2">
            <Calendar size={12} />
            Distancia maxima permitida
          </div>
          <p className="text-xs text-gray-500 mb-3">Limite maximo de dias permitido</p>
          {isEditingCalendarBooking ? (
            <select
              value={calendarDraft.maxAdvanceDays ?? 14}
              onChange={(e) => updateCalendarDraft({ maxAdvanceDays: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-white"
            >
              {MAX_ADVANCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <div className="text-sm text-white">
              {MAX_ADVANCE_OPTIONS.find(o => o.value === (calendarDraft.maxAdvanceDays ?? 14))?.label || `${calendarDraft.maxAdvanceDays} dias`}
            </div>
          )}
        </div>
      </div>

      {/* Agendamentos Simultâneos */}
      <div className="mt-4">
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white flex items-center gap-2">
                <Users size={14} />
                Agendamentos simultaneos
              </div>
              <p className="text-xs text-gray-500 mt-1">Permitir mais de um agendamento no mesmo horario</p>
            </div>
            {isEditingCalendarBooking ? (
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={calendarDraft.allowSimultaneous ?? false}
                  onChange={(e) => updateCalendarDraft({ allowSimultaneous: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            ) : (
              <span className={`text-sm ${calendarDraft.allowSimultaneous ? 'text-emerald-400' : 'text-gray-400'}`}>
                {calendarDraft.allowSimultaneous ? 'Sim' : 'Nao'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Webhook externo */}
      <div className="mt-4">
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="text-xs text-gray-400 flex items-center gap-2 mb-2">
            <Calendar size={12} />
            Webhook externo (n8n, Make, etc.)
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Envia os dados do agendamento para a URL informada quando o Flow termina.
          </p>
          {isEditingCalendarBooking ? (
            <input
              type="url"
              value={calendarDraft.externalWebhookUrl || ''}
              onChange={(e) => updateCalendarDraft({ externalWebhookUrl: e.target.value })}
              placeholder="https://seu-webhook.com/flow"
              className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-white"
            />
          ) : (
            <div className="text-sm text-white font-mono">
              {calendarDraft.externalWebhookUrl || 'Nao configurado'}
            </div>
          )}
        </div>
      </div>

      {/* Mensagem de confirmação */}
      <div className="mt-4">
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="text-xs text-gray-400 flex items-center gap-2 mb-2">
            <Calendar size={12} />
            Mensagem de confirmação
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Texto que o usuário recebe quando finaliza o Flow de agendamento.
          </p>
          {isEditingCalendarBooking ? (
            <div className="space-y-2">
              <input
                type="text"
                value={calendarDraft.confirmationTitle || ''}
                onChange={(e) => updateCalendarDraft({ confirmationTitle: e.target.value })}
                placeholder="Agendamento confirmado ✅"
                className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-white"
              />
              <input
                type="text"
                value={calendarDraft.confirmationFooter || ''}
                onChange={(e) => updateCalendarDraft({ confirmationFooter: e.target.value })}
                placeholder="Qualquer ajuste, responda esta mensagem."
                className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-white"
              />
            </div>
          ) : (
            <div className="text-sm text-white font-mono">
              {(calendarDraft.confirmationTitle || 'Agendamento confirmado ✅')}{' '}
              ·{' '}
              {(calendarDraft.confirmationFooter || 'Qualquer ajuste, responda esta mensagem.')}
            </div>
          )}
        </div>
      </div>

      {/* Horários de Funcionamento */}
      <div className="mt-6">
        <div className="text-xs text-gray-400 mb-3 flex items-center gap-2">
          <Clock size={12} />
          Horario de funcionamento
        </div>
        
        {/* Toggle de dias */}
        <div className="flex flex-wrap gap-2 mb-4">
          {calendarDraft.workingHours.map((day) => (
            <button
              key={day.day}
              type="button"
              onClick={() => isEditingCalendarBooking && updateWorkingHours(day.day, { enabled: !day.enabled })}
              disabled={!isEditingCalendarBooking}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                day.enabled
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-gray-500 border border-white/10'
              } ${isEditingCalendarBooking ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
            >
              {CALENDAR_WEEK_LABELS[day.day] || day.day}
            </button>
          ))}
        </div>

        {/* Horários dos dias habilitados */}
        <div className="space-y-3">
          {enabledDays.map((day) => {
            // Usa slots se existir, senão usa start/end como slot único
            const slots: TimeSlot[] = day.slots && day.slots.length > 0 
              ? day.slots 
              : [{ start: day.start, end: day.end }];
            
            return (
              <div
                key={day.day}
                className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white font-medium">
                    {CALENDAR_WEEK_LABELS[day.day] || day.day}
                  </span>
                  {isEditingCalendarBooking && (
                    <button
                      type="button"
                      onClick={() => updateWorkingHours(day.day, { enabled: false })}
                      className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                      title="Desabilitar dia"
                    >
                      <Minus size={14} />
                    </button>
                  )}
                </div>
                
                {/* Lista de períodos */}
                <div className="space-y-2">
                  {slots.map((slot, slotIndex) => (
                    <div key={slotIndex} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.start}
                        disabled={!isEditingCalendarBooking}
                        onChange={(e) => {
                          const newSlots = [...slots];
                          newSlots[slotIndex] = { ...slot, start: e.target.value };
                          if (newSlots.length === 1) {
                            updateWorkingHours(day.day, { start: e.target.value, slots: newSlots });
                          } else {
                            updateWorkingHours(day.day, { slots: newSlots });
                          }
                        }}
                        className="px-3 py-2 bg-zinc-900/60 border border-white/10 rounded-lg text-sm text-white font-mono disabled:opacity-50"
                      />
                      <span className="text-gray-500 text-sm">ate</span>
                      <input
                        type="time"
                        value={slot.end}
                        disabled={!isEditingCalendarBooking}
                        onChange={(e) => {
                          const newSlots = [...slots];
                          newSlots[slotIndex] = { ...slot, end: e.target.value };
                          if (newSlots.length === 1) {
                            updateWorkingHours(day.day, { end: e.target.value, slots: newSlots });
                          } else {
                            updateWorkingHours(day.day, { slots: newSlots });
                          }
                        }}
                        className="px-3 py-2 bg-zinc-900/60 border border-white/10 rounded-lg text-sm text-white font-mono disabled:opacity-50"
                      />
                      
                      {isEditingCalendarBooking && slots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newSlots = slots.filter((_, i) => i !== slotIndex);
                            updateWorkingHours(day.day, { 
                              start: newSlots[0]?.start || '09:00',
                              end: newSlots[0]?.end || '18:00',
                              slots: newSlots 
                            });
                          }}
                          className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                          title="Remover periodo"
                        >
                          <Minus size={14} />
                        </button>
                      )}
                      
                      {isEditingCalendarBooking && slotIndex === slots.length - 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const lastSlot = slots[slots.length - 1];
                            const newSlots = [...slots, { start: '14:00', end: '18:00' }];
                            updateWorkingHours(day.day, { slots: newSlots });
                          }}
                          className="p-1 text-gray-500 hover:text-emerald-400 transition-colors"
                          title="Adicionar periodo (ex: apos almoco)"
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {enabledDays.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">
            Nenhum dia habilitado. Clique nos dias acima para habilitar.
          </div>
        )}

        <div className="mt-3 text-xs text-gray-500">
          Fonte: {calendarBooking?.source || 'default'}
        </div>
      </div>

      {/* Botões de Ação */}
      {isEditingCalendarBooking && (
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setIsEditingCalendarBooking(false);
            }}
            className="h-10 px-4 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveCalendarBooking}
            disabled={!!isSavingCalendarBooking}
            className="h-10 px-6 rounded-lg bg-emerald-500/90 text-white hover:bg-emerald-500 transition-colors text-sm font-medium inline-flex items-center gap-2"
          >
            {isSavingCalendarBooking ? 'Salvando...' : 'Salvar regras'}
          </button>
        </div>
      )}
    </>
  );
}
