set lock_timeout = '10s';
set statement_timeout = '60s';

-- A constant default fills existing rows without firing their UPDATE triggers.
alter table public.classes
  add column if not exists letter_order_edition text not null default '2026-10-23';
alter table public.classes alter column letter_order_edition drop default;

alter table public.classes drop constraint if exists classes_letter_order_edition_known;
alter table public.classes add constraint classes_letter_order_edition_known
  check (letter_order_edition in ('2026-10-23'));

create or replace function private.classes_letter_order_edition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') or new.letter_order_edition is null then
      new.letter_order_edition := '2026-10-23';
    end if;
  elsif tg_op = 'UPDATE' then
    if current_user in ('anon', 'authenticated') then
      new.letter_order_edition := old.letter_order_edition;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.classes_letter_order_edition() from public, anon, authenticated;

drop trigger if exists classes_letter_order_edition on public.classes;
create trigger classes_letter_order_edition
  before insert or update on public.classes
  for each row execute function private.classes_letter_order_edition();

reset statement_timeout;
reset lock_timeout;
