DROP POLICY IF EXISTS "truck photos readable" ON storage.objects;
CREATE POLICY "truck owners read photos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'truck-photos' AND (public.owns_truck((storage.foldername(name))[1]) OR public.has_role(auth.uid(), 'admin')));