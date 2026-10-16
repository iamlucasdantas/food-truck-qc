DROP POLICY IF EXISTS "public reads stops" ON public.stops;
CREATE POLICY "public reads stops of visible trucks" ON public.stops FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.trucks t WHERE t.id = stops.truck_id));
DROP POLICY IF EXISTS "logos public read" ON storage.objects;