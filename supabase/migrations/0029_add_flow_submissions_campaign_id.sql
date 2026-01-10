-- =============================================================================
-- Flow submissions: associar submissão à campanha (via flow_token)
-- =============================================================================

ALTER TABLE IF EXISTS public.flow_submissions
  ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flow_submissions_campaign_id ON public.flow_submissions (campaign_id);

-- Reload PostgREST schema (safe)
NOTIFY pgrst, 'reload schema';
