CREATE TABLE IF NOT EXISTS public.job_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.job_titles (code, name, sort_order) VALUES
  ('literacy_coach', 'Literacy Coach', 10),
  ('numeracy_coach', 'Numeracy Coach', 20),
  ('zz_coach', 'ZZ Coach', 30),
  ('yeboneer', 'Yeboneer', 40),
  ('one_thousand_stories', '1000 Stories', 50)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      is_active = EXCLUDED.is_active;

ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_titles_read ON public.job_titles;
CREATE POLICY job_titles_read ON public.job_titles
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.job_titles TO authenticated;

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS school_uid text,
  ADD COLUMN IF NOT EXISTS school_number text,
  ADD COLUMN IF NOT EXISTS school_type text,
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS coord_east numeric,
  ADD COLUMN IF NOT EXISTS coord_south numeric,
  ADD COLUMN IF NOT EXISTS google_maps_link text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_schools_name_lower ON public.schools (lower(name));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.schools'::regclass
      AND conname = 'schools_school_uid_key'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_school_uid_key UNIQUE (school_uid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schools_school_uid ON public.schools (school_uid);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS school_id uuid,
  ADD COLUMN IF NOT EXISTS job_title_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_school_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_job_title_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_job_title_id_fkey
      FOREIGN KEY (job_title_id) REFERENCES public.job_titles(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_school_id ON public.users (school_id);
CREATE INDEX IF NOT EXISTS idx_users_job_title_id ON public.users (job_title_id);

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS session_type_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sessions'::regclass
      AND conname = 'sessions_session_type_id_fkey'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_session_type_id_fkey
      FOREIGN KEY (session_type_id) REFERENCES public.job_titles(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_session_type_id ON public.sessions (session_type_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
