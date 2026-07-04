-- Capture mode for the assessment UI that produced each result.
-- Orthogonal to assessment_type (letter_egra/word_egra). NULL = legacy/grid pre-this-migration.
-- Stamped client-side at creation from the resolved mode; never re-derived from current settings.
-- Written idempotently so a re-run (or a clean rebuild) cannot fail on a duplicate constraint.

alter table public.assessments
  add column if not exists capture_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assessments_capture_mode_check'
      and conrelid = 'public.assessments'::regclass
  ) then
    alter table public.assessments
      add constraint assessments_capture_mode_check
      check (capture_mode is null or capture_mode in ('grid', 'sequential'));
  end if;
end $$;

create index if not exists idx_assessments_capture_mode
  on public.assessments (capture_mode);
