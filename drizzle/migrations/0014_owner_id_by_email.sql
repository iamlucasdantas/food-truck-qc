CREATE OR REPLACE FUNCTION public.owner_id_by_email(_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(trim(_email)) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.owner_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_id_by_email(text) TO service_role;