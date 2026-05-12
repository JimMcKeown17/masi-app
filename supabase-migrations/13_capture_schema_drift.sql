-- Capture known production drift so migration history matches reality.

ALTER TABLE public.users
  ALTER COLUMN job_title TYPE text USING job_title::text;

DROP TYPE IF EXISTS public.job_title;

ALTER TABLE public.children
  ALTER COLUMN age DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.children'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%age%>%0%age%<%18%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.children DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.children'::regclass
        AND pg_get_constraintdef(oid) ILIKE '%age%>%0%age%<%18%'
      LIMIT 1
    );
  END IF;
END $$;
