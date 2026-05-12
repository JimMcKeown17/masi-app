UPDATE public.users u
SET school_id = s.id
FROM public.schools s
WHERE u.assigned_school IS NOT NULL
  AND u.school_id IS NULL
  AND regexp_replace(lower(trim(u.assigned_school)), '[^[:alnum:]]+', ' ', 'g')
    = regexp_replace(lower(trim(s.name)), '[^[:alnum:]]+', ' ', 'g');

UPDATE public.users u
SET job_title_id = j.id
FROM public.job_titles j
WHERE u.job_title_id IS NULL
  AND lower(trim(u.job_title)) = lower(trim(j.name));

UPDATE public.sessions s
SET session_type_id = j.id
FROM public.job_titles j
WHERE s.session_type_id IS NULL
  AND lower(trim(s.session_type)) = lower(trim(j.name));

ALTER TABLE public.children DROP CONSTRAINT IF EXISTS children_gender_chk;
ALTER TABLE public.children
  ADD CONSTRAINT children_gender_chk
  CHECK (gender IS NULL OR gender IN ('Male','Female'));

ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_grade_chk;
ALTER TABLE public.classes
  ADD CONSTRAINT classes_grade_chk
  CHECK (grade IN ('ECD','Grade R','Grade 1','Grade 2','Grade 3'));

ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_home_language_chk;
ALTER TABLE public.classes
  ADD CONSTRAINT classes_home_language_chk
  CHECK (home_language IN ('isiXhosa','English','Afrikaans'));

ALTER TABLE public.assessments DROP CONSTRAINT IF EXISTS assessments_type_chk;
ALTER TABLE public.assessments
  ADD CONSTRAINT assessments_type_chk
  CHECK (assessment_type IN ('letter_egra','word_egra'));
