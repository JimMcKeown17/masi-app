-- Assessment Results Plan 2: one current record per child, letter and language.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create or replace function private.letter_mastery_id(p_child_id uuid, p_letter text, p_language text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select extensions.uuid_generate_v5(
    '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2'::uuid,
    pg_catalog.concat_ws(pg_catalog.chr(31), 'letter_mastery', p_child_id::text, p_letter, p_language)
  );
$$;
revoke execute on function private.letter_mastery_id(uuid,text,text)
  from public, anon, authenticated, authenticator, service_role;

create or replace function private.current_user_delivers_to_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.child_ea_assignments cea
    where cea.child_id = p_child_id
      and cea.user_id = (select auth.uid())
      and cea.unassigned_at is null
  );
$$;
revoke execute on function private.current_user_delivers_to_child(uuid)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function private.current_user_delivers_to_child(uuid) to authenticated;

-- Keep these additions top-level for the server-column contract parser.
alter table public.letter_mastery
  add column if not exists confirmed boolean,
  add column if not exists changed_at timestamptz,
  add column if not exists correction_id uuid,
  add column if not exists changed_by uuid;

-- The old column is the cutover marker: reruns preserve current records byte-for-byte.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'letter_mastery' and column_name = 'user_id'
  ) then
    drop policy if exists letter_mastery_select_assigned_child_history on public.letter_mastery;
    drop policy if exists letter_mastery_insert_active_assignment on public.letter_mastery;
    drop policy if exists letter_mastery_update_active_assignment on public.letter_mastery;
    drop policy if exists letter_mastery_delete_active_assignment on public.letter_mastery;

    drop index if exists public.idx_letter_mastery_unique_active;
    drop index if exists public.idx_letter_mastery_child_programme;

    -- Mapping and ranking share one statement snapshot, before the trigger restamps updated_at.
    with codes as (
      select old.id, old.child_id, old.user_id, old.updated_at, old.deleted_at,
             pg_catalog.lower(old.letter) as l,
             case pg_catalog.lower(pg_catalog.btrim(old.language))
               when 'english' then 'en'
               when 'isixhosa' then 'xh'
               when 'xhosa' then 'xh'
               when 'isizulu' then 'zu'
               when 'zulu' then 'zu'
               when 'afrikaans' then 'af'
               else case when old.language ~ '^[a-z]{2}$' then old.language else null end
             end as code
      from public.letter_mastery old
    ), mapped as (
      select codes.*,
             row_number() over (
               partition by codes.child_id, codes.l, codes.code
               order by codes.updated_at desc, codes.id desc
             ) as rn
      from codes
    )
    update public.letter_mastery lm
       set letter = m.l, language = m.code, confirmed = (m.deleted_at is null),
           changed_at = m.updated_at, correction_id = m.id, changed_by = m.user_id
      from mapped m
     where lm.id = m.id and m.rn = 1 and m.code is not null and pg_catalog.char_length(m.l) = 1;

    delete from public.letter_mastery where correction_id is null;
    update public.letter_mastery set id = private.letter_mastery_id(child_id, letter, language);
    alter table public.letter_mastery
      drop column user_id,
      drop column source,
      drop column mastered_at,
      drop column deleted_at;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.letter_mastery'::regclass
      and conname = 'letter_mastery_child_letter_language_key'
  ) then
    alter table public.letter_mastery
      add constraint letter_mastery_child_letter_language_key unique (child_id, letter, language);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.letter_mastery'::regclass and conname = 'letter_mastery_language_code_chk'
  ) then
    alter table public.letter_mastery add constraint letter_mastery_language_code_chk
      check (language ~ '^[a-z]{2}$');
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.letter_mastery'::regclass and conname = 'letter_mastery_letter_chk'
  ) then
    alter table public.letter_mastery add constraint letter_mastery_letter_chk
      check (char_length(letter) = 1 and letter = pg_catalog.lower(letter));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.letter_mastery'::regclass and conname = 'letter_mastery_changed_by_fkey'
  ) then
    alter table public.letter_mastery add constraint letter_mastery_changed_by_fkey
      foreign key (changed_by) references auth.users(id) on delete restrict;
  end if;
end;
$$;

alter table public.letter_mastery
  alter column confirmed set not null,
  alter column changed_at set not null,
  alter column correction_id set not null,
  alter column changed_by set not null,
  alter column programme_id drop not null;
create index if not exists letter_mastery_changed_by_idx on public.letter_mastery(changed_by);
-- Keep letter_mastery_set_updated_at from Plan 1 (BEFORE INSERT OR UPDATE).

create table if not exists public.letter_mastery_corrections (
  correction_id uuid not null,
  child_id uuid not null references public.children(id) on delete cascade,
  letter text not null,
  language text not null,
  confirmed boolean not null,
  requested_at timestamptz not null,
  effective_at timestamptz not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  programme_id uuid references public.programmes(id) on delete restrict,
  received_at timestamptz not null default pg_catalog.now(),
  constraint letter_mastery_corrections_pkey primary key (correction_id)
);
create index if not exists letter_mastery_corrections_child_letter_language_idx
  on public.letter_mastery_corrections(child_id, letter, language);
alter table public.letter_mastery_corrections enable row level security;
revoke all privileges on public.letter_mastery_corrections from public, anon, authenticated;
grant select, insert, update, delete on public.letter_mastery_corrections to service_role;

revoke insert, update, delete on public.letter_mastery from anon, authenticated;
drop policy if exists letter_mastery_select_writer_or_deliverer on public.letter_mastery;
create policy letter_mastery_select_writer_or_deliverer on public.letter_mastery
  for select to authenticated
  using (changed_by = (select auth.uid()) or (select private.current_user_delivers_to_child(child_id)));

create or replace function public.set_letter_mastery(
  p_correction_id uuid, p_child_id uuid, p_letter text, p_language text,
  p_confirmed boolean, p_changed_at timestamptz
)
returns table (
  outcome text, confirmed boolean, changed_at timestamptz, correction_id uuid, changed_by uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := (select auth.uid());
  v_receipt public.letter_mastery_corrections%rowtype;
  v_record public.letter_mastery%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_correction_id is null or p_child_id is null or p_letter is null
    or p_language is null or p_confirmed is null or p_changed_at is null
    or p_letter !~ '^[[:alpha:]]$' or p_letter <> pg_catalog.lower(p_letter)
    or p_language !~ '^[a-z]{2}$'
  then
    raise exception using errcode = '22023', message = 'Malformed letter mastery correction';
  end if;

  if not exists (
    select 1 from public.letter_mastery_corrections r where r.correction_id = p_correction_id
  ) then
    if private.current_user_delivers_to_child(p_child_id) is not true then
      raise exception using errcode = '42501', message = 'Active child delivery assignment required';
    end if;
    insert into public.letter_mastery_corrections (
      correction_id, child_id, letter, language, confirmed, requested_at,
      effective_at, changed_by, programme_id, received_at
    ) values (
      p_correction_id, p_child_id, p_letter, p_language, p_confirmed, p_changed_at,
      least(p_changed_at, pg_catalog.now()), v_actor,
      (select spa.programme_id from public.staff_programme_assignments spa
       where spa.user_id = v_actor and spa.ended_at is null),
      pg_catalog.now()
    )
    on conflict on constraint letter_mastery_corrections_pkey do nothing;
  end if;

  select r.* into v_receipt from public.letter_mastery_corrections r
  where r.correction_id = p_correction_id;
  if v_receipt.changed_by is distinct from v_actor
    or v_receipt.child_id is distinct from p_child_id
    or v_receipt.letter is distinct from p_letter
    or v_receipt.language is distinct from p_language
    or v_receipt.confirmed is distinct from p_confirmed
    or v_receipt.requested_at is distinct from p_changed_at
  then
    raise exception using errcode = 'MA001', message = 'Correction id payload mismatch';
  end if;

  insert into public.letter_mastery as lm (
    id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by, programme_id
  ) values (
    private.letter_mastery_id(v_receipt.child_id, v_receipt.letter, v_receipt.language),
    v_receipt.child_id, v_receipt.letter, v_receipt.language, v_receipt.confirmed,
    v_receipt.effective_at, v_receipt.correction_id, v_receipt.changed_by, v_receipt.programme_id
  )
  on conflict on constraint letter_mastery_child_letter_language_key do update
    set confirmed = excluded.confirmed, changed_at = excluded.changed_at,
        correction_id = excluded.correction_id, changed_by = excluded.changed_by,
        programme_id = excluded.programme_id
    where (excluded.changed_at, excluded.correction_id) > (lm.changed_at, lm.correction_id);

  select lm.* into v_record from public.letter_mastery lm
  where lm.child_id = v_receipt.child_id and lm.letter = v_receipt.letter
    and lm.language = v_receipt.language;
  if v_record.changed_by = v_actor or private.current_user_delivers_to_child(v_record.child_id) then
    return query select
      case when v_record.correction_id = p_correction_id then 'applied'::text else 'superseded'::text end,
      v_record.confirmed, v_record.changed_at, v_record.correction_id, v_record.changed_by;
  else
    return query select 'acknowledged'::text, null::boolean, null::timestamptz, null::uuid, null::uuid;
  end if;
end;
$$;
revoke execute on function public.set_letter_mastery(uuid,uuid,text,text,boolean,timestamptz)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.set_letter_mastery(uuid,uuid,text,text,boolean,timestamptz)
  to authenticated;

notify pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
