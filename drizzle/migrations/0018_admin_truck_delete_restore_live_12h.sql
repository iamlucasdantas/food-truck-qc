ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS deleted_by uuid;
UPDATE public.trucks SET updated_at = created_at;

CREATE OR REPLACE FUNCTION public.touch_truck_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trucks_touch_updated_at ON public.trucks;
CREATE TRIGGER trucks_touch_updated_at BEFORE UPDATE ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.touch_truck_updated_at();

CREATE OR REPLACE FUNCTION public.guard_truck_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
    NEW.claimed_by := OLD.claimed_by; NEW.status := OLD.status;
    NEW.created_by := OLD.created_by; NEW.merged_into := OLD.merged_into;
    NEW.deleted_at := OLD.deleted_at; NEW.deleted_by := OLD.deleted_by;
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE public.truck_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL,
  truck_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('deleted','restored','purged')),
  actor uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.truck_deletions TO authenticated;
GRANT ALL ON public.truck_deletions TO service_role;
ALTER TABLE public.truck_deletions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read deletion log" ON public.truck_deletions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.admin_delete_trucks(_ids text[]) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n integer; _email text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.truck_deletions (truck_id, truck_name, action, actor, actor_email)
    SELECT id, name, 'deleted', auth.uid(), _email FROM public.trucks WHERE id = ANY(_ids) AND deleted_at IS NULL;
  UPDATE public.trucks SET status = 'archived', deleted_at = now(), deleted_by = auth.uid() WHERE id = ANY(_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.admin_restore_truck(_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _email text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.truck_deletions (truck_id, truck_name, action, actor, actor_email)
    SELECT id, name, 'restored', auth.uid(), _email FROM public.trucks WHERE id = _id AND deleted_at IS NOT NULL;
  UPDATE public.trucks SET status = 'active', deleted_at = NULL, deleted_by = NULL WHERE id = _id AND deleted_at IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.purge_deleted_trucks() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ids text[]; _n integer;
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO _ids FROM public.trucks WHERE deleted_at < now() - interval '30 days';
  IF cardinality(_ids) = 0 THEN RETURN 0; END IF;
  INSERT INTO public.truck_deletions (truck_id, truck_name, action) SELECT id, name, 'purged' FROM public.trucks WHERE id = ANY(_ids);
  DELETE FROM public.favorites WHERE truck_id = ANY(_ids);
  DELETE FROM public.stops WHERE truck_id = ANY(_ids);
  DELETE FROM public.stop_series WHERE truck_id = ANY(_ids);
  DELETE FROM public.suggested_stops WHERE truck_id = ANY(_ids);
  DELETE FROM public.truck_photos WHERE truck_id = ANY(_ids);
  DELETE FROM public.calendar_feeds WHERE truck_id = ANY(_ids);
  DELETE FROM public.claims WHERE truck_id = ANY(_ids);
  UPDATE public.social_sources SET truck_id = NULL WHERE truck_id = ANY(_ids);
  DELETE FROM public.trucks WHERE id = ANY(_ids);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_trucks(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_restore_truck(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purge_deleted_trucks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_trucks(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_truck(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cap_live_stop() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.is_live AND NEW.ends_at > NEW.starts_at + interval '12 hours' THEN
    NEW.ends_at := NEW.starts_at + interval '12 hours';
  END IF;
  IF NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'Closing time must be after opening time'; END IF;
  RETURN NEW;
END $$;

SELECT cron.schedule('purge-deleted-trucks', '15 9 * * *', 'SELECT public.purge_deleted_trucks()');