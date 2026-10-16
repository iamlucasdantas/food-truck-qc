CREATE TABLE public.stop_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  venue_name text NOT NULL DEFAULT '',
  address text,
  city text NOT NULL DEFAULT '',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  note text,
  start_time text NOT NULL,
  end_time text NOT NULL,
  freq text NOT NULL CHECK (freq IN ('weekly','biweekly','monthly')),
  weekdays int[] NOT NULL DEFAULT '{}',
  month_nth int,
  start_date date NOT NULL,
  end_date date,
  skip_dates date[] NOT NULL DEFAULT '{}',
  external_uid text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stop_series TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stop_series TO authenticated;
GRANT ALL ON public.stop_series TO service_role;
ALTER TABLE public.stop_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads series of visible trucks" ON public.stop_series FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.trucks t WHERE t.id = stop_series.truck_id));
CREATE POLICY "owners insert series" ON public.stop_series FOR INSERT TO authenticated
  WITH CHECK (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owners update series" ON public.stop_series FOR UPDATE TO authenticated
  USING (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owners delete series" ON public.stop_series FOR DELETE TO authenticated
  USING (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));

ALTER TABLE public.stops ADD COLUMN note text, ADD COLUMN series_id uuid REFERENCES public.stop_series(id) ON DELETE CASCADE, ADD COLUMN occurrence_date date;

CREATE TABLE public.calendar_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'ical',
  url text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (truck_id, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_feeds TO authenticated;
GRANT ALL ON public.calendar_feeds TO service_role;
ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage feeds" ON public.calendar_feeds FOR ALL TO authenticated
  USING (public.owns_truck(truck_id)) WITH CHECK (public.owns_truck(truck_id) AND created_by = auth.uid());