CREATE TABLE public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  norm_name text NOT NULL UNIQUE,
  address text,
  city text NOT NULL DEFAULT '',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  confirmed boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'places',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.venues TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.venues TO authenticated;
GRANT ALL ON public.venues TO service_role;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads venues" ON public.venues FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage venues" ON public.venues FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.suggested_stops ADD COLUMN IF NOT EXISTS needs_address_check boolean NOT NULL DEFAULT false;
ALTER TABLE public.social_sources ADD COLUMN IF NOT EXISTS last_status text;
ALTER TABLE public.social_sources ADD COLUMN IF NOT EXISTS last_posts integer NOT NULL DEFAULT 0;
ALTER TABLE public.social_sources ADD COLUMN IF NOT EXISTS last_stops integer NOT NULL DEFAULT 0;
ALTER TABLE public.social_sources ADD COLUMN IF NOT EXISTS last_reason text;