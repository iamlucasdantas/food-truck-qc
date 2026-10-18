ALTER TABLE public.trucks ADD COLUMN google_business_status text CHECK (google_business_status IN ('OPERATIONAL','CLOSED_TEMPORARILY','CLOSED_PERMANENTLY'));
COMMENT ON COLUMN public.trucks.google_business_status IS 'Last explicit Google business status; not the daily openNow flag. Closed records are archived, never deleted.';
CREATE OR REPLACE FUNCTION public.guard_google_business_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
IF TG_OP='INSERT' THEN NEW.google_business_status := NULL; ELSE NEW.google_business_status := OLD.google_business_status; END IF;
END IF;
RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.guard_google_business_status() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_google_business_status BEFORE INSERT OR UPDATE ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.guard_google_business_status();