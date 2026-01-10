-- =============================================================================
-- Backfill campaign_id on flow_submissions from flow_token suffix (:c:<campaignId>)
-- =============================================================================

WITH extracted AS (
  SELECT
    id,
    NULLIF(substring(flow_token from ':c:([A-Za-z0-9_-]+)'), '') AS campaign_id
  FROM public.flow_submissions
  WHERE campaign_id IS NULL
    AND flow_token IS NOT NULL
    AND flow_token LIKE '%:c:%'
)
UPDATE public.flow_submissions AS fs
SET campaign_id = extracted.campaign_id
FROM extracted
WHERE fs.id = extracted.id
  AND extracted.campaign_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.campaigns AS c WHERE c.id = extracted.campaign_id
  );
