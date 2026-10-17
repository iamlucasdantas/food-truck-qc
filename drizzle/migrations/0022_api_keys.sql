CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'API key',
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_keys_owner_select ON public.api_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY api_keys_owner_delete ON public.api_keys FOR DELETE TO authenticated USING (auth.uid() = user_id);
GRANT SELECT, DELETE ON public.api_keys TO authenticated;