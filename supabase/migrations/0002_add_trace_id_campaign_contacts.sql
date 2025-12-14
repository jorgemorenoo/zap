-- Add trace_id to correlate dispatch/workflow/webhook logs
-- Also index message_id for faster webhook lookup.

alter table if exists public.campaign_contacts
  add column if not exists trace_id text;

create index if not exists idx_campaign_contacts_trace_id
  on public.campaign_contacts (trace_id);

create index if not exists idx_campaign_contacts_message_id
  on public.campaign_contacts (message_id);
