DROP POLICY IF EXISTS "anyone reads venues" ON public.venues;
REVOKE SELECT ON public.venues FROM anon;