CREATE TABLE public.truck_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  path text NOT NULL UNIQUE,
  position integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX truck_photos_truck_idx ON public.truck_photos (truck_id, position);
GRANT SELECT ON public.truck_photos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.truck_photos TO authenticated;
GRANT ALL ON public.truck_photos TO service_role;
ALTER TABLE public.truck_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads photos of visible trucks" ON public.truck_photos FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.trucks t WHERE t.id = truck_photos.truck_id));
CREATE POLICY "owners add photos" ON public.truck_photos FOR INSERT TO authenticated
  WITH CHECK (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owners update photos" ON public.truck_photos FOR UPDATE TO authenticated
  USING (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owners delete photos" ON public.truck_photos FOR DELETE TO authenticated
  USING (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));

-- Max 12 photos per truck.
CREATE OR REPLACE FUNCTION public.limit_truck_photos()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF (SELECT count(*) FROM public.truck_photos WHERE truck_id = NEW.truck_id) >= 12 THEN
    RAISE EXCEPTION 'A truck can have up to 12 photos';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER truck_photos_limit BEFORE INSERT ON public.truck_photos FOR EACH ROW EXECUTE FUNCTION public.limit_truck_photos();

-- Storage: files live under <truck_id>/<file>. Anyone can read (signed URLs); only that truck's owner writes.
CREATE POLICY "truck photos readable" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'truck-photos');
CREATE POLICY "truck owners upload photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'truck-photos' AND (public.owns_truck((storage.foldername(name))[1]) OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "truck owners delete photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'truck-photos' AND (public.owns_truck((storage.foldername(name))[1]) OR public.has_role(auth.uid(),'admin')));

-- Structured menu confirmed by the owner (sections/items/tags); legacy trucks.menu stays as fallback.
ALTER TABLE public.trucks ADD COLUMN menu_sections jsonb;
ALTER TABLE public.trucks ADD COLUMN menu_updated_at timestamptz;
ALTER TABLE public.trucks ADD COLUMN menu_search text NOT NULL DEFAULT '';