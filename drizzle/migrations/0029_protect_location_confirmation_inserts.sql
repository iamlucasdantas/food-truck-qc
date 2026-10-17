CREATE OR REPLACE FUNCTION public.guard_location_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF TG_OP='INSERT' THEN
IF auth.uid() IS NOT NULL THEN NEW.google_location_verified := false; NEW.base_location_confirmed_at := NULL; END IF;
ELSIF NEW.base_address IS DISTINCT FROM OLD.base_address OR NEW.base_lat IS DISTINCT FROM OLD.base_lat OR NEW.base_lng IS DISTINCT FROM OLD.base_lng THEN NEW.google_location_verified := false; NEW.base_location_confirmed_at := NULL;
ELSIF current_setting('app.confirm_location',true) IS DISTINCT FROM 'yes' AND auth.uid() IS NOT NULL THEN NEW.google_location_verified := OLD.google_location_verified; NEW.base_location_confirmed_at := OLD.base_location_confirmed_at; END IF;
RETURN NEW; END $$;
CREATE TRIGGER guard_location_confirmation_insert BEFORE INSERT ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.guard_location_confirmation();