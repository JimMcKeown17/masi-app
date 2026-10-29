-- Immutable receipts; retain the deployed v1 signature and validation contract.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

ALTER TABLE public.mobile_support_incidents
  DROP CONSTRAINT mobile_support_incidents_kind_check,
  ADD CONSTRAINT mobile_support_incidents_kind_check CHECK (kind IN (
    'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent',
    'upload_terminal', 'upload_backlog_stale', 'reconcile_breaker_tripped',
    'pull_failing', 'app_error_caught', 'ea_report', 'diagnostics_sent'
  )),
  ADD COLUMN report_id uuid,
  ADD COLUMN schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version IN (1, 2)),
  ADD COLUMN report_generation integer NOT NULL DEFAULT 1 CHECK (report_generation > 0),
  ADD COLUMN occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  ADD COLUMN first_seen_at timestamptz,
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN observed jsonb,
  ADD COLUMN first_observed jsonb,
  ADD COLUMN delivery jsonb,
  ADD COLUMN bundle_path text,
  ADD COLUMN screenshot_path text;

-- jsonb_build_array is unambiguous, including keys containing punctuation.
-- Historical observation times/provenance remain unknown (NULL).
UPDATE public.mobile_support_incidents
SET report_id = pg_catalog.md5(pg_catalog.jsonb_build_array(kind, repeat_key)::text)::uuid;
ALTER TABLE public.mobile_support_incidents
  ALTER COLUMN report_id SET NOT NULL,
  DROP CONSTRAINT mobile_support_incidents_once,
  ADD CONSTRAINT mobile_support_incidents_report_once UNIQUE (reporter_id, report_id);
CREATE INDEX mobile_support_incidents_condition_idx
  ON public.mobile_support_incidents (reporter_id, kind, repeat_key);
CREATE INDEX mobile_support_incidents_received_idx
  ON public.mobile_support_incidents (received_at, id);

ALTER TABLE public.mobile_support_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mobile_support_incidents
  FROM public, anon, authenticated, authenticator, service_role;
GRANT SELECT ON TABLE public.mobile_support_incidents TO service_role;

-- v1 remains unlimited and retains its original received_at default.
create or replace function public.report_mobile_support_incident(
  p_kind text,
  p_repeat_key text,
  p_payload jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_inserted integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in (
    'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent'
  ) then
    raise exception 'Unknown incident kind' using errcode = '22023';
  end if;
  if p_repeat_key is null or pg_catalog.length(p_repeat_key) not between 1 and 512 then
    raise exception 'Repeat key must be 1-512 characters' using errcode = '22023';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Incident payload must be a JSON object' using errcode = '22023';
  end if;
  if pg_catalog.octet_length(p_payload::text) > 8192 then
    raise exception 'Incident payload exceeds 8192 bytes' using errcode = '22023';
  end if;

  insert into public.mobile_support_incidents (reporter_id, kind, repeat_key, payload, report_id)
  values (v_actor_id, p_kind, p_repeat_key, p_payload,
    pg_catalog.md5(pg_catalog.jsonb_build_array(p_kind, p_repeat_key)::text)::uuid)
  on conflict (reporter_id, report_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.report_mobile_support_incident(text, text, jsonb)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.report_mobile_support_incident(text, text, jsonb) to authenticated;

-- Unknown top-level keys are rejected; nested diagnostic content is unrestricted.
CREATE OR REPLACE FUNCTION public.report_mobile_support_incident_v2(p_envelope jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_report_id uuid;
  v_generation integer;
  v_count integer;
  v_first timestamptz;
  v_last timestamptz;
  v_kind text;
  v_key text;
  v_install text;
  v_field text;
  v_human boolean;
  v_now timestamptz;
  v_inserted integer;
  v_required text[] := ARRAY[
    'schema_version', 'kind', 'repeat_key', 'report_id', 'report_generation',
    'occurrence_count', 'first_seen_at', 'last_seen_at', 'payload', 'observed',
    'first_observed', 'delivery', 'bundle_path', 'screenshot_path'
  ];
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_envelope IS NULL OR pg_catalog.jsonb_typeof(p_envelope) <> 'object' THEN
    RAISE EXCEPTION 'Envelope must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.octet_length(p_envelope::text) > 65536 THEN
    RAISE EXCEPTION 'Envelope exceeds 65536 bytes' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_envelope ?& v_required) OR p_envelope - v_required <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Envelope keys do not match schema 2' USING ERRCODE = '22023';
  END IF;
  IF p_envelope->'schema_version' <> '2'::jsonb THEN
    RAISE EXCEPTION 'Unsupported envelope schema' USING ERRCODE = '22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['kind', 'repeat_key', 'report_id', 'first_seen_at', 'last_seen_at'] LOOP
    IF pg_catalog.jsonb_typeof(p_envelope->v_field) <> 'string' THEN
      RAISE EXCEPTION 'Envelope field % must be a string', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH v_field IN ARRAY ARRAY['payload', 'observed', 'first_observed', 'delivery'] LOOP
    IF pg_catalog.jsonb_typeof(p_envelope->v_field) <> 'object' THEN
      RAISE EXCEPTION 'Envelope field % must be an object', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH v_field IN ARRAY ARRAY['bundle_path', 'screenshot_path'] LOOP
    IF pg_catalog.jsonb_typeof(p_envelope->v_field) NOT IN ('null', 'string') THEN
      RAISE EXCEPTION 'Envelope path % must be null or a string', v_field USING ERRCODE = '22023';
    END IF;
    IF p_envelope->>v_field IS NOT NULL AND
      pg_catalog.left(p_envelope->>v_field, pg_catalog.length(v_actor_id::text) + 1) <> (v_actor_id::text || '/') THEN
      RAISE EXCEPTION 'Attachment path must belong to reporter' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_kind := p_envelope->>'kind';
  IF v_kind NOT IN (
    'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent',
    'upload_terminal', 'upload_backlog_stale', 'reconcile_breaker_tripped',
    'pull_failing', 'app_error_caught', 'ea_report', 'diagnostics_sent'
  ) THEN
    RAISE EXCEPTION 'Unknown incident kind' USING ERRCODE = '22023';
  END IF;
  v_key := p_envelope->>'repeat_key';
  v_install := p_envelope->'delivery'->>'installId';
  IF pg_catalog.length(v_key) NOT BETWEEN 1 AND 512
    OR pg_catalog.jsonb_typeof(p_envelope->'delivery'->'installId') IS DISTINCT FROM 'string'
    OR v_install IS NULL OR v_install = ''
    OR pg_catalog.split_part(v_key, ':', 1) <> v_install
    OR pg_catalog.length(v_key) <= pg_catalog.length(v_install) + 1 THEN
    RAISE EXCEPTION 'Repeat key must have the matching install prefix' USING ERRCODE = '22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['report_generation', 'occurrence_count'] LOOP
    IF pg_catalog.jsonb_typeof(p_envelope->v_field) <> 'number' THEN
      RAISE EXCEPTION 'Envelope counter % must be numeric', v_field USING ERRCODE = '22023';
    END IF;
    IF (p_envelope->>v_field)::numeric NOT BETWEEN 1 AND 2147483647
      OR pg_catalog.trunc((p_envelope->>v_field)::numeric) <> (p_envelope->>v_field)::numeric THEN
      RAISE EXCEPTION 'Envelope counter % must be a positive integer in range', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- Cast failures are part of the structural-validation API, never leaked 22P02/22007/etc.
  BEGIN
    v_report_id := (p_envelope->>'report_id')::uuid;
    v_generation := (p_envelope->>'report_generation')::numeric::integer;
    v_count := (p_envelope->>'occurrence_count')::numeric::integer;
    v_first := (p_envelope->>'first_seen_at')::timestamptz;
    v_last := (p_envelope->>'last_seen_at')::timestamptz;
  EXCEPTION WHEN data_exception THEN
    RAISE EXCEPTION 'Invalid envelope identifier, counter or timestamp' USING ERRCODE = '22023';
  END;
  IF NOT pg_catalog.isfinite(v_first) OR NOT pg_catalog.isfinite(v_last) OR v_first > v_last THEN
    RAISE EXCEPTION 'Invalid observation interval' USING ERRCODE = '22023';
  END IF;

  -- Admission serializes per reporter, including duplicates, across both categories.
  -- No durable quota state; the immutable receipts are the rolling-window ledger.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'mobile_support_incidents:' || v_actor_id::text, 0));
  IF EXISTS (SELECT FROM public.mobile_support_incidents
    WHERE reporter_id = v_actor_id AND report_id = v_report_id) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'duplicate');
  END IF;
  v_human := v_kind IN ('ea_report', 'diagnostics_sent');
  v_now := pg_catalog.clock_timestamp();
  IF (SELECT count(*) FROM public.mobile_support_incidents
    WHERE reporter_id = v_actor_id AND schema_version = 2
      AND received_at > v_now - interval '24 hours'
      AND (kind IN ('ea_report', 'diagnostics_sent')) = v_human
  ) >= (CASE WHEN v_human THEN 50 ELSE 150 END) THEN
    RAISE EXCEPTION 'Incident receipt allowance exhausted' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.mobile_support_incidents (
    reporter_id, report_id, kind, repeat_key, schema_version, report_generation, occurrence_count,
    first_seen_at, last_seen_at, payload, observed, first_observed, delivery,
    bundle_path, screenshot_path, received_at
  ) VALUES (
    v_actor_id, v_report_id, v_kind, v_key, 2, v_generation, v_count,
    v_first, v_last, p_envelope->'payload', p_envelope->'observed',
    p_envelope->'first_observed', p_envelope->'delivery',
    p_envelope->>'bundle_path', p_envelope->>'screenshot_path', pg_catalog.clock_timestamp()
  ) ON CONFLICT (reporter_id, report_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('status', CASE WHEN v_inserted = 1 THEN 'inserted' ELSE 'duplicate' END);
END;
$$;

REVOKE ALL ON FUNCTION public.report_mobile_support_incident_v2(jsonb)
  FROM public, anon, authenticated, authenticator, service_role;
GRANT EXECUTE ON FUNCTION public.report_mobile_support_incident_v2(jsonb) TO authenticated;

RESET statement_timeout;
RESET lock_timeout;
