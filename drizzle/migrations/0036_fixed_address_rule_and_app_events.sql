CREATE OR REPLACE FUNCTION public.sync_truck_ingestion_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NEW.truck_type = 'fixed' AND (nullif(btrim(NEW.base_address),'') IS NULL OR NEW.base_lat IS NULL OR NEW.base_lng IS NULL) THEN
   RAISE EXCEPTION 'Fixed-location trucks need an address and coordinates before approval';
  END IF;
  IF nullif(btrim(NEW.category),'') IS NULL OR lower(btrim(NEW.category)) IN ('other','unknown','uncategorized') THEN
   RAISE EXCEPTION 'Add a category from the Google or Facebook profile before approving this truck';
  END IF;
  IF OLD.status = 'pending' AND NEW.claimed_by IS NULL THEN
   INSERT INTO public.stops (truck_id,venue_name,address,city,lat,lng,starts_at,ends_at,source,source_url)
   SELECT NEW.id,s.venue_name,s.address,s.city,s.lat,s.lng,s.starts_at,s.ends_at,'apify_post',s.source_url
   FROM public.suggested_stops s WHERE s.truck_id=NEW.id AND s.status='pending' AND NOT s.needs_address_check
    AND nullif(btrim(s.address),'') IS NOT NULL AND s.lat IS NOT NULL AND s.lng IS NOT NULL
    AND s.ends_at > now() AND s.ends_at > s.starts_at
    AND NOT EXISTS (SELECT 1 FROM public.stops p WHERE p.truck_id=s.truck_id AND p.starts_at=s.starts_at AND p.venue_name=s.venue_name)
   ON CONFLICT DO NOTHING;
   UPDATE public.suggested_stops SET status='approved',reviewed_at=now() WHERE truck_id=NEW.id AND status='pending'
    AND NOT needs_address_check AND nullif(btrim(address),'') IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL
    AND ends_at > now() AND ends_at > starts_at;
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE TABLE public.app_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  truck_id text,
  venue text,
  path text,
  visitor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_events_created_idx ON public.app_events (created_at DESC);
CREATE INDEX app_events_kind_idx ON public.app_events (kind, created_at DESC);
GRANT INSERT ON public.app_events TO anon, authenticated;
GRANT SELECT ON public.app_events TO authenticated;
GRANT ALL ON public.app_events TO service_role;
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone logs usage events" ON public.app_events FOR INSERT TO anon, authenticated
  WITH CHECK (kind IN ('page_view','truck_view','direction_click','stop_view','search')
    AND coalesce(length(path),0) <= 300 AND coalesce(length(venue),0) <= 200
    AND coalesce(length(truck_id),0) <= 120 AND coalesce(length(visitor),0) <= 64);
CREATE POLICY "admins read usage events" ON public.app_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));