CREATE FUNCTION public.owner_favorite_summary(_truck_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object('total', (SELECT count(*) FROM public.favorites WHERE truck_id = _truck_id), 'daily', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT date_trunc('day', created_at) AS day, count(*) AS count FROM public.favorites WHERE truck_id = _truck_id AND created_at >= now() - interval '7 days' GROUP BY 1 ORDER BY 1) x))
 WHERE public.owns_truck(_truck_id);
$$;
REVOKE ALL ON FUNCTION public.owner_favorite_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_favorite_summary(text) TO authenticated;