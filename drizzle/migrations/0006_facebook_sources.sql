CREATE TABLE public.social_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('group','page')),
  url text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  truck_id text REFERENCES public.trucks(id) ON DELETE CASCADE,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_sources TO authenticated;
GRANT ALL ON public.social_sources TO service_role;
ALTER TABLE public.social_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage social sources" ON public.social_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.social_posts (
  url text PRIMARY KEY,
  source_id uuid REFERENCES public.social_sources(id) ON DELETE SET NULL,
  run_id uuid,
  stops_created integer NOT NULL DEFAULT 0,
  processed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read social posts" ON public.social_posts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.geocode_cache (
  query text PRIMARY KEY,
  lat double precision,
  lng double precision,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.geocode_cache TO service_role;
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stops ADD COLUMN source_url text;
CREATE UNIQUE INDEX stops_source_url_start_uq ON public.stops (source_url, starts_at);

ALTER TABLE public.ingestion_runs ADD COLUMN meta jsonb NOT NULL DEFAULT '{}'::jsonb;