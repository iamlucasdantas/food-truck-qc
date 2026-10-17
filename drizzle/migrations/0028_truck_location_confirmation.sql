ALTER TABLE public.trucks ADD COLUMN google_location_verified boolean NOT NULL DEFAULT false, ADD COLUMN base_location_confirmed_at timestamptz;
COMMENT ON COLUMN public.trucks.google_location_verified IS 'Explicit Google verification evidence attested by admin; a Place ID alone is not verification.';
CREATE OR REPLACE FUNCTION public.guard_location_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.base_address IS DISTINCT FROM OLD.base_address OR NEW.base_lat IS DISTINCT FROM OLD.base_lat OR NEW.base_lng IS DISTINCT FROM OLD.base_lng THEN NEW.google_location_verified := false; NEW.base_location_confirmed_at := NULL;
ELSIF current_setting('app.confirm_location',true) IS DISTINCT FROM 'yes' AND auth.uid() IS NOT NULL THEN NEW.google_location_verified := OLD.google_location_verified; NEW.base_location_confirmed_at := OLD.base_location_confirmed_at; END IF;
RETURN NEW; END $$;
CREATE TRIGGER guard_location_confirmation BEFORE UPDATE ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.guard_location_confirmation();
CREATE OR REPLACE FUNCTION public.confirm_truck_location(_truck_id text, _google_verified boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t public.trucks; admin boolean; BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
SELECT * INTO t FROM public.trucks WHERE id=_truck_id AND deleted_at IS NULL FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Truck not found'; END IF;
admin := public.has_role(auth.uid(),'admin');
IF NOT admin AND (t.claimed_by IS DISTINCT FROM auth.uid() OR t.status <> 'active') THEN RAISE EXCEPTION 'An approved claim is required'; END IF;
IF _google_verified AND NOT admin THEN RAISE EXCEPTION 'Only admins may attest Google verification'; END IF;
IF NULLIF(trim(t.base_address),'') IS NULL OR t.base_lat IS NULL OR t.base_lng IS NULL THEN RAISE EXCEPTION 'Save an address and map coordinates first'; END IF;
PERFORM set_config('app.confirm_location','yes',true);
UPDATE public.trucks SET base_location_confirmed_at=now(), google_location_verified=(google_location_verified OR _google_verified) WHERE id=_truck_id;
PERFORM set_config('app.confirm_location','no',true);
END $$;
REVOKE ALL ON FUNCTION public.confirm_truck_location(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_truck_location(text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_location_confirmation() FROM PUBLIC,anon,authenticated;