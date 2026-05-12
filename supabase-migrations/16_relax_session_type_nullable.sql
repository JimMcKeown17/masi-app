-- Enables Build B to write sessions using session_type_id only.
ALTER TABLE public.sessions
  ALTER COLUMN session_type DROP NOT NULL;
