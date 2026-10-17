CREATE TABLE public.chat_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  endpoint text NOT NULL,
  method text NOT NULL,
  status int NOT NULL,
  auth_ok boolean NOT NULL,
  auth_detail text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  user_agent text
);
GRANT SELECT, DELETE ON public.chat_api_logs TO authenticated;
GRANT ALL ON public.chat_api_logs TO service_role;
ALTER TABLE public.chat_api_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read chat api logs" ON public.chat_api_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete chat api logs" ON public.chat_api_logs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX chat_api_logs_created_idx ON public.chat_api_logs (created_at DESC);