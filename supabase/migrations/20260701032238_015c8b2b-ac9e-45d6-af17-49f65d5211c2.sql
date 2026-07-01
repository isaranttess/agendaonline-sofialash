
-- has_role: switch to SECURITY INVOKER. It only checks the caller's own role,
-- and user_roles has an RLS policy allowing users to SELECT their own rows.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Restrict the auth-trigger function to postgres/service_role only.
REVOKE ALL ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
