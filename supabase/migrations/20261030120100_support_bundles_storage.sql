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

-- Storage already supplies object grants/RLS. Do not revoke grants or change
-- policies for other buckets. Reassert RLS and service reading explicitly.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE storage.objects TO service_role;

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
