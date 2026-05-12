DROP FUNCTION IF EXISTS public.get_children_in_group(uuid);

ALTER TABLE public.children
  DROP COLUMN IF EXISTS class,
  DROP COLUMN IF EXISTS school,
  DROP COLUMN IF EXISTS teacher;

ALTER TABLE public.users
  ALTER COLUMN school_id SET NOT NULL,
  ALTER COLUMN job_title_id SET NOT NULL,
  DROP COLUMN IF EXISTS assigned_school,
  DROP COLUMN IF EXISTS job_title;

ALTER TABLE public.sessions
  ALTER COLUMN session_type_id SET NOT NULL,
  DROP COLUMN IF EXISTS session_type;
