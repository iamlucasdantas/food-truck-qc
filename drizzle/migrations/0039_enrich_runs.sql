CREATE TABLE public.enrich_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','error')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enrich_runs_truck_created ON public.enrich_runs (truck_id, created_at DESC);
GRANT SELECT ON public.enrich_runs TO authenticated;
GRANT ALL ON public.enrich_runs TO service_role;
ALTER TABLE public.enrich_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read enrich runs" ON public.enrich_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));