CREATE OR REPLACE FUNCTION public.admin_user_id_by_email(_email text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT u.id INTO _id FROM auth.users u WHERE lower(u.email) = lower(trim(_email)) LIMIT 1;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_user_id_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_id_by_email(text) TO authenticated;
GRANT DELETE ON public.businesses TO authenticated;
CREATE POLICY "admins delete businesses" ON public.businesses FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));