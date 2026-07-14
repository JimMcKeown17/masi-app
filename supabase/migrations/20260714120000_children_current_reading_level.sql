-- A child's current literacy reading level is durable child state. Individual
-- sessions keep their own activities.child_reading_levels snapshot for history.
alter table public.children
  add column if not exists reading_level text;
