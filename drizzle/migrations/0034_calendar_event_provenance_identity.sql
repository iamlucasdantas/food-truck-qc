CREATE OR REPLACE FUNCTION public.reconcile_venue_calendar(_source_id uuid, _token uuid, _stops jsonb, _titles jsonb, _ignored integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.venue_calendar_sources; item jsonb;
BEGIN
 SELECT * INTO s FROM public.venue_calendar_sources WHERE id=_source_id FOR UPDATE;
 IF s.sync_token IS DISTINCT FROM _token THEN RAISE EXCEPTION 'Calendar sync lease expired'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_stops) LOOP
 INSERT INTO public.stops(truck_id,venue_name,address,city,lat,lng,starts_at,ends_at,source,confidence,is_live,cancelled,source_url,calendar_source_id,calendar_uid,calendar_occurrence)
 VALUES(item->>'truck_id',s.name,s.address,s.city,s.lat,s.lng,(item->>'start')::timestamptz,(item->>'end')::timestamptz,'calendar',1,false,EXISTS(SELECT 1 FROM public.stops o WHERE o.truck_id=item->>'truck_id' AND o.source='owner' AND NOT o.cancelled AND o.starts_at<(item->>'end')::timestamptz AND o.ends_at>(item->>'start')::timestamptz),s.url||'#event='||md5((item->>'uid')||':'||(item->>'occurrence')),s.id,item->>'uid',item->>'occurrence')
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