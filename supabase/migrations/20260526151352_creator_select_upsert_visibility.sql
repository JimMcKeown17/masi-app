-- Mobile sync uses PostgREST upsert for durable retry semantics. Supabase/Postgres
-- evaluates SELECT visibility during upsert, even for first-time inserts. Keep
-- direct creator-owned SELECT fallbacks on locally-created parent rows so the
-- initial INSERT path does not depend on child/group/class junction rows that
-- are queued later in the same outbox batch.

drop policy if exists children_select_created_by on public.children;
create policy children_select_created_by
  on public.children
  for select to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists classes_select_created_by on public.classes;
create policy classes_select_created_by
  on public.classes
  for select to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists groups_select_created_by on public.groups;
create policy groups_select_created_by
  on public.groups
  for select to authenticated
  using (created_by = (select auth.uid()));
