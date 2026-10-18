CREATE OR REPLACE FUNCTION public.sync_truck_ingestion_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF nullif(btrim(NEW.base_address),'') IS NULL OR NEW.base_lat IS NULL OR NEW.base_lng IS NULL THEN
   RAISE EXCEPTION 'Add an evidenced address and coordinates before approving this truck';
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
CREATE TRIGGER sync_truck_ingestion_review BEFORE UPDATE OF status ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.sync_truck_ingestion_review();
CREATE OR REPLACE FUNCTION public.admin_review_suggested_stop(_id uuid,_approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.suggested_stops%ROWTYPE; t public.trucks%ROWTYPE;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO s FROM public.suggested_stops WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
 IF s.status <> 'pending' THEN RETURN; END IF;
 SELECT * INTO t FROM public.trucks WHERE id=s.truck_id FOR UPDATE;
 IF NOT FOUND OR t.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Truck not available'; END IF;
 IF _approve THEN
  IF t.status='archived' THEN RAISE EXCEPTION 'Approve the archived truck from Trucks first'; END IF;
  IF nullif(btrim(s.address),'') IS NULL OR s.lat IS NULL OR s.lng IS NULL OR s.needs_address_check OR s.ends_at<=s.starts_at THEN
   RAISE EXCEPTION 'Confirm the stop address and coordinates before publishing';
  END IF;
  IF t.status='pending' THEN UPDATE public.trucks SET status='active' WHERE id=t.id; END IF;
  INSERT INTO public.stops(truck_id,venue_name,address,city,lat,lng,starts_at,ends_at,source,source_url)
  SELECT s.truck_id,s.venue_name,s.address,s.city,s.lat,s.lng,s.starts_at,s.ends_at,'apify_post',s.source_url
  WHERE NOT EXISTS (SELECT 1 FROM public.stops p WHERE p.truck_id=s.truck_id AND p.starts_at=s.starts_at AND p.venue_name=s.venue_name)
  ON CONFLICT DO NOTHING;
 END IF;
 UPDATE public.suggested_stops SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,reviewed_at=now() WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_review_suggested_stop(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_review_suggested_stop(uuid,boolean) TO authenticated,service_role;