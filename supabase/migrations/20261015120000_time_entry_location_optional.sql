SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- Location is optional for manual clock actions. NULL status is deliberately
-- unclassified: older builds and automatic clock-out do not record a reason.
ALTER TABLE public.time_entries
  ALTER COLUMN sign_in_lat DROP NOT NULL,
  ALTER COLUMN sign_in_lon DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS sign_in_location_status text,
  ADD COLUMN IF NOT EXISTS sign_out_location_status text,
  ADD CONSTRAINT time_entries_sign_in_location_status_check
    CHECK (sign_in_location_status IN ('fix', 'timeout', 'denied', 'services_off', 'unavailable')) NOT VALID,
  ADD CONSTRAINT time_entries_sign_in_location_pair_check
    CHECK ((sign_in_lat IS NULL) = (sign_in_lon IS NULL)) NOT VALID,
  ADD CONSTRAINT time_entries_sign_in_location_coherence_check
    CHECK (sign_in_location_status IS NULL OR
      (sign_in_location_status = 'fix' AND sign_in_lat IS NOT NULL AND sign_in_lon IS NOT NULL) OR
      (sign_in_location_status <> 'fix' AND sign_in_lat IS NULL AND sign_in_lon IS NULL)) NOT VALID,
  ADD CONSTRAINT time_entries_sign_out_location_status_check
    CHECK (sign_out_location_status IN ('fix', 'timeout', 'denied', 'services_off', 'unavailable')) NOT VALID,
  ADD CONSTRAINT time_entries_sign_out_location_pair_check
    CHECK ((sign_out_lat IS NULL) = (sign_out_lon IS NULL)) NOT VALID,
  ADD CONSTRAINT time_entries_sign_out_location_coherence_check
    CHECK (sign_out_location_status IS NULL OR
      (sign_out_location_status = 'fix' AND sign_out_lat IS NOT NULL AND sign_out_lon IS NOT NULL) OR
      (sign_out_location_status <> 'fix' AND sign_out_lat IS NULL AND sign_out_lon IS NULL)) NOT VALID;

-- Existing rows must satisfy the pairs; NULL statuses preserve old-client writes.
ALTER TABLE public.time_entries
  VALIDATE CONSTRAINT time_entries_sign_in_location_status_check,
  VALIDATE CONSTRAINT time_entries_sign_in_location_pair_check,
  VALIDATE CONSTRAINT time_entries_sign_in_location_coherence_check,
  VALIDATE CONSTRAINT time_entries_sign_out_location_status_check,
  VALIDATE CONSTRAINT time_entries_sign_out_location_pair_check,
  VALIDATE CONSTRAINT time_entries_sign_out_location_coherence_check;

-- Only the new columns are granted. Existing time_entries_*_own RLS policies
-- continue to govern every SELECT, INSERT and UPDATE; no policy is changed.
GRANT SELECT (sign_in_location_status, sign_out_location_status),
      INSERT (sign_in_location_status, sign_out_location_status),
      UPDATE (sign_in_location_status, sign_out_location_status)
  ON public.time_entries TO authenticated;

RESET statement_timeout;
RESET lock_timeout;
