ALTER TYPE public.stop_source ADD VALUE IF NOT EXISTS 'own_post';

ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS reddit text;

CREATE TABLE public.suggested_stops (
  id uuid not null default gen_random_uuid() primary key,
  truck_id text not null references public.trucks(id),
  source text not null default 'community',
  source_url text,
  author text,
  excerpt text not null default ''::text,
  venue_name text not null default ''::text,
  address text,
  city text not null default ''::text,
  lat double precision,
  lng double precision,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone not null,
  status text not null default 'pending'::text check (status in ('pending', 'approved', 'rejected')),
  created_at timestamp with time zone not null default now(),
  reviewed_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suggested_stops TO authenticated;
GRANT ALL ON public.suggested_stops TO service_role;

ALTER TABLE public.suggested_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read suggestions" ON public.suggested_stops FOR SELECT TO authenticated
  USING (owns_truck(truck_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "owners update suggestions" ON public.suggested_stops FOR UPDATE TO authenticated
  USING (owns_truck(truck_id) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (owns_truck(truck_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins insert suggestions" ON public.suggested_stops FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "owners delete suggestions" ON public.suggested_stops FOR DELETE TO authenticated
  USING (owns_truck(truck_id) OR has_role(auth.uid(), 'admin'::app_role));