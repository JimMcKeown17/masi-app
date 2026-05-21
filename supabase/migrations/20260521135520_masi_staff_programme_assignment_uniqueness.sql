create unique index if not exists idx_staff_programme_assignments_active_user_unique
  on public.staff_programme_assignments(user_id)
  where ended_at is null;
