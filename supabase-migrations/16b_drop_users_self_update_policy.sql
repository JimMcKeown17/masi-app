-- Corrects the Build A deployment gate: profile role/school fields are
-- admin-managed, so authenticated users must not update their own users row.
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
