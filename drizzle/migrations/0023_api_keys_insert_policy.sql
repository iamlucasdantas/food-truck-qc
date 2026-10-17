CREATE POLICY api_keys_owner_insert ON public.api_keys FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
GRANT INSERT ON public.api_keys TO authenticated;