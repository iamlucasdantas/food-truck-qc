CREATE TABLE public.venue_calendar_sources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, address text NOT NULL, city text NOT NULL, lat double precision NOT NULL, lng double precision NOT NULL, url text NOT NULL UNIQUE, timezone text NOT NULL DEFAULT 'America/Chicago', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), last_sync_at timestamptz, imported integer NOT NULL DEFAULT 0, ignored integer NOT NULL DEFAULT 0, in_review integer NOT NULL DEFAULT 0, last_error text, sync_token uuid, sync_started_at timestamptz);
GRANT SELECT ON public.venue_calendar_sources TO authenticated;
GRANT ALL ON public.venue_calendar_sources TO service_role;
ALTER TABLE public.venue_calendar_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read ON public.venue_calendar_sources FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.venue_calendar_titles (source_id uuid NOT NULL REFERENCES public.venue_calendar_sources(id) ON DELETE CASCADE, title_key text NOT NULL, title text NOT NULL, decision text NOT NULL DEFAULT 'review' CHECK (decision IN ('review','link','ignore')), truck_id text REFERENCES public.trucks(id), occurrences jsonb NOT NULL DEFAULT '[]', last_seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (source_id,title_key));
GRANT SELECT ON public.venue_calendar_titles TO authenticated;
GRANT ALL ON public.venue_calendar_titles TO service_role;
ALTER TABLE public.venue_calendar_titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read ON public.venue_calendar_titles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.stops ADD COLUMN calendar_source_id uuid REFERENCES public.venue_calendar_sources(id), ADD COLUMN calendar_uid text, ADD COLUMN calendar_occurrence text;
CREATE UNIQUE INDEX stops_calendar_identity ON public.stops(calendar_source_id,calendar_uid,calendar_occurrence);
CREATE OR REPLACE FUNCTION public.reconcile_venue_calendar(_source_id uuid, _token uuid, _stops jsonb, _titles jsonb, _ignored integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.venue_calendar_sources; item jsonb;
BEGIN
 SELECT * INTO s FROM public.venue_calendar_sources WHERE id=_source_id FOR UPDATE;
 IF s.sync_token IS DISTINCT FROM _token THEN RAISE EXCEPTION 'Calendar sync lease expired'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_stops) LOOP
 INSERT INTO public.stops(truck_id,venue_name,address,city,lat,lng,starts_at,ends_at,source,confidence,is_live,cancelled,source_url,calendar_source_id,calendar_uid,calendar_occurrence)
 VALUES(item->>'truck_id',s.name,s.address,s.city,s.lat,s.lng,(item->>'start')::timestamptz,(item->>'end')::timestamptz,'calendar',1,false,EXISTS(SELECT 1 FROM public.stops o WHERE o.truck_id=item->>'truck_id' AND o.source='owner' AND NOT o.cancelled AND o.starts_at<(item->>'end')::timestamptz AND o.ends_at>(item->>'start')::timestamptz),s.url,s.id,item->>'uid',item->>'occurrence')
 ON CONFLICT(calendar_source_id,calendar_uid,calendar_occurrence) DO UPDATE SET truck_id=EXCLUDED.truck_id,venue_name=EXCLUDED.venue_name,address=EXCLUDED.address,city=EXCLUDED.city,lat=EXCLUDED.lat,lng=EXCLUDED.lng,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,cancelled=EXCLUDED.cancelled,source_url=EXCLUDED.source_url;
 END LOOP;
 DELETE FROM public.stops t WHERE t.calendar_source_id=s.id AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_stops) e WHERE e->>'uid'=t.calendar_uid AND e->>'occurrence'=t.calendar_occurrence);
 UPDATE public.venue_calendar_titles SET occurrences='[]' WHERE source_id=s.id;
 FOR item IN SELECT value FROM jsonb_array_elements(_titles) LOOP
 INSERT INTO public.venue_calendar_titles(source_id,title_key,title,occurrences) VALUES(s.id,item->>'key',item->>'title',item->'occurrences') ON CONFLICT(source_id,title_key) DO UPDATE SET title=EXCLUDED.title,occurrences=EXCLUDED.occurrences,last_seen_at=now();
 END LOOP;
 UPDATE public.venue_calendar_sources SET last_sync_at=now(), imported=jsonb_array_length(_stops),ignored=_ignored,in_review=jsonb_array_length(_titles),last_error=null,sync_token=null,sync_started_at=null WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_venue_calendar(uuid,uuid,jsonb,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_venue_calendar(uuid,uuid,jsonb,jsonb,integer) TO service_role;