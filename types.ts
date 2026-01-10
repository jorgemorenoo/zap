import React from 'react';

// =============================================================================
// CAMPAIGN & CONTACT TYPES (Existing)
// =============================================================================

export enum CampaignStatus {
  DRAFT = 'Rascunho',
  SCHEDULED = 'Agendado',
  SENDING = 'Enviando',
  COMPLETED = 'Concluído',
  PAUSED = 'Pausado',
  FAILED = 'Falhou',
  CANCELLED = 'Cancelado'
}

export enum ContactStatus {
  OPT_IN = 'Opt-in',
  OPT_OUT = 'Opt-out',
  UNKNOWN = 'Desconhecido'
}

export enum MessageStatus {
  PENDING = 'Pendente',
  SENT = 'Enviado',
  DELIVERED = 'Entregue',
  READ = 'Lido',
  SKIPPED = 'Ignorado',
  FAILED = 'Falhou'
}

export type TemplateCategory = 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO';
export type TemplateStatus = 'DRAFT' | 'APPROVED' | 'PENDING' | 'REJECTED';

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  status: TemplateStatus;
  content: string;
  preview: string;
  lastUpdated: string;
  parameterFormat?: 'positional' | 'named';
  specHash?: string | null;
  fetchedAt?: string | null;
  headerMediaId?: string | null;
  headerMediaHash?: string | null;
  headerMediaPreviewUrl?: string | null;
  headerMediaPreviewExpiresAt?: string | null;
  components?: TemplateComponent[]; // Full components from Meta API
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | 'LIMITED_TIME_OFFER';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  buttons?: TemplateButton[];
  example?: any;
  limited_time_offer?: {
    text: string;
    has_expiration?: boolean;
  };
}

export interface TemplateButton {
  type:
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
    | 'SPM';
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[] | string;
  otp_type?: 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP';
  flow_id?: string;
  action?: Record<string, unknown>;
  payload?: string | Record<string, unknown>;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  skipped: number;
  failed: number;
  createdAt: string;
  templateName: string;
  templateVariables?: { header: string[], body: string[], buttons?: Record<string, string> };  // Meta API structure: arrays por componente
  // Template snapshot (fonte operacional por campanha)
  templateSnapshot?: any;
  templateSpecHash?: string | null;
  templateParameterFormat?: 'positional' | 'named' | null;
  templateFetchedAt?: string | null;
  // Scheduling
  scheduledAt?: string | null;  // ISO timestamp for scheduled campaigns
  // QStash scheduling (one-shot)
  qstashScheduleMessageId?: string | null;
  qstashScheduleEnqueuedAt?: string | null;
  startedAt?: string | null;    // When campaign actually started sending
  firstDispatchAt?: string | null; // When the first contact started dispatching (claim/sending) (dispatch-only)
  lastSentAt?: string | null;   // When the last contact was marked as "sent" (dispatch-only)
  completedAt?: string | null;  // When campaign finished
  cancelledAt?: string | null;  // When campaign was cancelled by user
  pausedAt?: string | null;     // When campaign was paused
  // Contacts (for resume functionality and optimistic UI)
  selectedContactIds?: string[];
  pendingContacts?: { name: string; phone: string }[];  // For immediate "Pending" display
}

export interface Contact {
  id: string;
  name?: string;
  phone: string;
  email?: string | null;
  status: ContactStatus;
  tags: string[];
  lastActive: string;
  createdAt?: string;
  updatedAt?: string;
  custom_fields?: Record<string, any>;
  suppressionReason?: string | null;
  suppressionSource?: string | null;
  suppressionExpiresAt?: string | null;
}

// =============================================================================
// LEAD FORMS (Captação de contatos)
// =============================================================================

export interface LeadForm {
  id: string;
  name: string;
  slug: string;
  tag: string;
  isActive: boolean;
  collectEmail?: boolean; // quando false, o formulário público não mostra/coleta email
  successMessage?: string | null;
  webhookToken?: string | null;
  fields?: LeadFormField[];
  createdAt?: string;
  updatedAt?: string | null;
}

export type LeadFormFieldType = 'text' | 'number' | 'date' | 'select'

export interface LeadFormField {
  key: string;            // ex: "curso" (vai para contact.custom_fields.curso)
  label: string;          // ex: "Qual seu curso?"
  type: LeadFormFieldType;
  required?: boolean;
  options?: string[];     // para select
  order?: number;
}

export interface CreateLeadFormDTO {
  name: string;
  slug: string;
  tag: string;
  isActive?: boolean;
  collectEmail?: boolean;
  successMessage?: string | null;
  fields?: LeadFormField[];
}

export interface UpdateLeadFormDTO extends Partial<CreateLeadFormDTO> {}

export interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
  entity_type: 'contact' | 'deal';
  created_at?: string;
}

export interface Message {
  id: string;
  campaignId: string;
  contactId?: string;
  contactName: string;
  contactPhone: string;
  status: MessageStatus;
  messageId?: string;      // WhatsApp message ID
  sentAt: string;
  deliveredAt?: string;    // Quando foi entregue
  readAt?: string;         // Quando foi lido
  error?: string;
}

export interface AppSettings {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  isConnected: boolean;
  displayPhoneNumber?: string;
  qualityRating?: string;
  verifiedName?: string;
  testContact?: TestContact;
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface WorkingHoursDay {
  day: Weekday;
  enabled: boolean;
  start: string;
  end: string;
}

export interface CalendarBookingConfig {
  timezone: string;
  slotDurationMinutes: number;
  slotBufferMinutes: number;
  workingHours: WorkingHoursDay[];
}

export interface TestContact {
  name?: string;
  phone: string;
}

export interface StatCardProps {
  title: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  icon: React.ReactNode;
}

// Template Workspace Types
export type WorkspaceStatus = 'draft' | 'active' | 'archived';
export type WorkspaceTemplateStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface TemplateWorkspace {
  id: string;
  name: string;
  description?: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
  // Computed fields (from API)
  templateCount?: number;
  statusSummary?: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
  };
}

export interface WorkspaceTemplate {
  id: string;
  workspaceId: string;
  name: string;
  content: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  status: WorkspaceTemplateStatus;
  metaId?: string;
  metaStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectedReason?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt?: string;
  // Optional components from AI generator
  components?: {
    header?: { format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string };
    footer?: { text: string };
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  };
}

// =============================================================================
// BATCH SUBMISSION TYPES (Factory)
// =============================================================================

export interface BatchSubmission {
  id: string;
  name: string; // e.g. "Aviso Aula 10/12"
  createdAt: string;
  status: 'processing' | 'completed' | 'partial_error';
  // Stats snapshot
  stats: {
    total: number;
    utility: number;
    marketing: number;
    poll_utility: number; // For "polling" check status
    rejected: number;
    pending: number;
  };
  templates: GeneratedTemplateWithStatus[];
}

export interface GeneratedTemplateWithStatus {
  id: string;
  name: string;
  content: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'; // Current status
  originalCategory: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'; // Intended status
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  metaStatus?: string; // Raw meta status
  rejectionReason?: string;
  generatedAt: string;
  language: string;
  // Components for preview
  header?: { format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string };
  footer?: { text: string };
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

// =============================================================================
// SUPABASE REALTIME TYPES
// =============================================================================

/**
 * Tables that have Realtime enabled
 */
export type RealtimeTable =
  | 'campaigns'
  | 'campaign_contacts'
  | 'contacts'
  | 'custom_field_definitions'
  | 'account_alerts'
  | 'template_projects'
  | 'template_project_items';

/**
 * Event types for Realtime subscriptions
 */
export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

/**
 * Payload received from Supabase Realtime
 */
export interface RealtimePayload<T = Record<string, unknown>> {
  schema: 'public';
  table: RealtimeTable;
  commit_timestamp: string;
  eventType: RealtimeEventType;
  new: T | null;
  old: T | null;
  errors: string[] | null;
}

/**
 * Channel connection status
 */
export type ChannelStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

/**
 * Subscription configuration
 */
export interface RealtimeSubscriptionConfig {
  table: RealtimeTable;
  event?: RealtimeEventType;
  filter?: string; // e.g., 'id=eq.123'
}

/**
 * Realtime connection state
 */
export interface RealtimeState {
  isConnected: boolean;
  status: ChannelStatus | null;
  error?: string;
}

// =============================================================================
// SUPABASE REALTIME BROADCAST (EPHEMERAL)
// =============================================================================

export type CampaignProgressBroadcastPhase =
  | 'batch_start'
  | 'batch_end'
  | 'cancelled'
  | 'complete'

export interface CampaignProgressBroadcastDelta {
  sent: number
  failed: number
  skipped: number
}

/**
 * Evento efêmero (não persistido) para sensação de tempo real.
 * - Nunca deve conter PII (telefone, nome, conteúdo de mensagem).
 * - Não é fonte da verdade: UI deve reconciliar com DB periodicamente.
 */
export interface CampaignProgressBroadcastPayload {
  campaignId: string
  traceId: string
  batchIndex: number
  seq: number
  ts: number
  delta?: CampaignProgressBroadcastDelta
  phase?: CampaignProgressBroadcastPhase
}

// =============================================================================
// REALTIME LATENCY TELEMETRY (DEBUG)
// =============================================================================

export interface RealtimeLatencyTelemetryBroadcast {
  traceId: string
  seq: number
  serverTs: number
  receivedAt: number
  paintedAt: number
  serverToClientMs: number
  handlerToPaintMs: number
  serverToPaintMs: number
}

export interface RealtimeLatencyTelemetryDbChange {
  table: string
  eventType: string
  commitTimestamp: string
  commitTs: number
  receivedAt: number
  paintedAt: number
  commitToClientMs: number
  handlerToPaintMs: number
  commitToPaintMs: number
}

export interface RealtimeLatencyTelemetryRefetch {
  startedAt: number
  finishedAt?: number
  durationMs?: number
  reason: 'debounced_refetch'
}

export interface RealtimeLatencyTelemetry {
  broadcast?: RealtimeLatencyTelemetryBroadcast
  dbChange?: RealtimeLatencyTelemetryDbChange
  refetch?: RealtimeLatencyTelemetryRefetch
}

export type ProjectStatus = 'draft' | 'submitted' | 'completed';

export interface TemplateProject {
  id: string;
  title: string;
  prompt: string;
  status: ProjectStatus;
  source?: 'ai' | 'manual' | string;
  template_count: number;
  approved_count: number;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateProjectItem {
  id: string;
  project_id: string;
  name: string;
  content: string;
  meta_id?: string;
  meta_status?: string;
  header?: any;
  footer?: any;
  buttons?: any;
  category?: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateProjectDTO {
  title: string;
  prompt: string;
  status?: string;
  items: Omit<TemplateProjectItem, 'id' | 'project_id' | 'created_at' | 'updated_at'>[];
}
