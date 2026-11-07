-- 1) Columns of every public table as one JSON document: copy the single cell into columns.json, then run: node check.mjs columns.json
SELECT json_object_agg(table_name, cols) AS columns FROM (
  SELECT c.table_name, json_object_agg(c.column_name, json_build_object('data_type', c.data_type, 'nullable', c.is_nullable = 'YES', 'udt', c.udt_name) ORDER BY c.column_name) AS cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  GROUP BY c.table_name
) t;

-- 2) Row counts
SELECT 'trucks' AS t, count(*) FROM public.trucks
UNION ALL SELECT 'stops', count(*) FROM public.stops
UNION ALL SELECT 'stop_series', count(*) FROM public.stop_series
UNION ALL SELECT 'social_sources', count(*) FROM public.social_sources
UNION ALL SELECT 'app_events', count(*) FROM public.app_events
UNION ALL SELECT 'chat_api_logs', count(*) FROM public.chat_api_logs
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'user_roles', count(*) FROM public.user_roles;

-- 3) Functions that the app calls via rpc()
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS returns
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('admin_delete_trucks','admin_restore_truck','admin_review_suggested_stop','admin_user_id_by_email','confirm_truck_location','has_role','merge_trucks','owner_favorite_summary','owner_id_by_email','owns_truck','purge_deleted_trucks','reconcile_venue_calendar','review_claim','shared_foodie_profile')
ORDER BY 1, 2;

-- 4) Policies per table
SELECT tablename, count(*) AS policies FROM pg_policies WHERE schemaname = 'public' GROUP BY 1 ORDER BY 1;

-- 5) Triggers
SELECT c.relname AS table_name, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth') ORDER BY 1, 2;

-- 6) Buckets, realtime, drizzle bookkeeping
SELECT id, public FROM storage.buckets;
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
SELECT count(*) AS drizzle_rows FROM drizzle.__drizzle_migrations;
