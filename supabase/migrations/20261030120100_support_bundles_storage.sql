-- Private diagnostic files; SQL policies compose safely with existing broad policies.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('support-bundles', 'support-bundles', false, 15728640,
  ARRAY['application/json', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']::text[])
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage already supplies object grants and RLS. On hosted Supabase,
-- storage.objects is owned by supabase_storage_admin: postgres may CREATE
-- POLICY on it (supautils.policy_grants) but may not ALTER it or GRANT on it.
-- RLS is already enabled and service_role already has SELECT (verified
-- read-only on masi-app-sqlite 2026-10-29), so neither is reasserted here.
-- Do not revoke grants or change policies for other buckets.

CREATE POLICY support_bundles_own_insert ON storage.objects
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'support-bundles'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- A permissive grant alone cannot isolate the bucket: policies OR together.
-- These restrictive guards intersect *every* permissive policy, including an
-- unrelated pre-existing FOR ALL / TO PUBLIC policy. Outside this bucket they
-- are true, preserving the existing authorization of unrelated objects.
CREATE POLICY support_bundles_insert_guard ON storage.objects
AS RESTRICTIVE FOR INSERT TO public
WITH CHECK (bucket_id <> 'support-bundles' OR (
  CURRENT_USER = 'authenticated'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
));

CREATE POLICY support_bundles_read_guard ON storage.objects
AS RESTRICTIVE FOR SELECT TO public
USING (bucket_id <> 'support-bundles' OR CURRENT_USER = 'service_role');

CREATE POLICY support_bundles_update_guard ON storage.objects
AS RESTRICTIVE FOR UPDATE TO public
USING (bucket_id <> 'support-bundles')
WITH CHECK (bucket_id <> 'support-bundles');

CREATE POLICY support_bundles_delete_guard ON storage.objects
AS RESTRICTIVE FOR DELETE TO public
USING (bucket_id <> 'support-bundles');

CREATE POLICY support_bundles_service_read ON storage.objects
AS PERMISSIVE FOR SELECT TO service_role
USING (bucket_id = 'support-bundles');

RESET statement_timeout;
RESET lock_timeout;
