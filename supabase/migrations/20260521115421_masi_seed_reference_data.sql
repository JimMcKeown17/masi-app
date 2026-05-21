insert into public.job_titles (code, name, sort_order) values
  ('literacy_coach', 'Literacy Coach', 10),
  ('numeracy_coach', 'Numeracy Coach', 20),
  ('zz_coach', 'ZZ Coach', 30),
  ('yeboneer', 'Yeboneer', 40),
  ('one_thousand_stories', '1000 Stories', 50)
on conflict (code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

insert into public.programmes (code, name, sort_order) values
  ('literacy', 'Literacy', 10),
  ('numeracy', 'Numeracy', 20),
  ('zazi_izandi', 'Zazi iZandi', 30),
  ('yeboneer', 'Yeboneer', 40),
  ('one_thousand_stories', '1000 Stories', 50)
on conflict (code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

insert into public.assessment_tools (
  programme_id,
  code,
  name,
  subject,
  language,
  version,
  config
)
select
  p.id,
  'egra_letter_sounds',
  'EGRA Letter Sound Assessment',
  'literacy',
  'multilingual',
  '1',
  jsonb_build_object(
    'item_type', 'letter_sound',
    'stores_items_in', 'assessment_items'
  )
from public.programmes p
where p.code = 'literacy'
on conflict (code) do update
set name = excluded.name,
    subject = excluded.subject,
    language = excluded.language,
    version = excluded.version,
    config = excluded.config,
    is_active = true,
    updated_at = now();
