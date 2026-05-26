revoke truncate, references, trigger
  on all tables in schema public
  from public, anon, authenticated;

revoke insert, update, delete, truncate, references, trigger on public.schools
  from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.job_titles
  from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.programmes
  from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.academic_years
  from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.assessment_windows
  from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.assessment_tools
  from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.teachers
  from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.staff_programme_assignments
  from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.users
  from authenticated;

grant select on public.schools to authenticated;
grant select on public.job_titles to authenticated;
grant select on public.programmes to authenticated;
grant select on public.academic_years to authenticated;
grant select on public.assessment_windows to authenticated;
grant select on public.assessment_tools to authenticated;
grant select on public.teachers to authenticated;
grant select on public.staff_programme_assignments to authenticated;
grant select on public.users to authenticated;
