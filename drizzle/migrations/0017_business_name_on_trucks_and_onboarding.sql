ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS business_name text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.trucks t SET business_name = coalesce(nullif(b.name,''), trim(coalesce(substring(t.description from 'Business: ([^\n]+)'), '')))
FROM public.businesses b WHERE b.owner_id = coalesce(t.claimed_by, t.created_by);
UPDATE public.trucks SET business_name = trim(coalesce(substring(description from 'Business: ([^\n]+)'), ''))
WHERE business_name = '' AND description LIKE '%Business:%';

CREATE OR REPLACE FUNCTION public.set_truck_business_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n text;
BEGIN
  SELECT name INTO _n FROM public.businesses WHERE owner_id = coalesce(NEW.claimed_by, NEW.created_by);
  IF coalesce(_n,'') <> '' THEN NEW.business_name := _n;
  ELSIF coalesce(NEW.business_name,'') = '' THEN
    NEW.business_name := trim(coalesce(substring(NEW.description from 'Business: ([^\n]+)'), ''));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trucks_business_name ON public.trucks;
CREATE TRIGGER trucks_business_name BEFORE INSERT OR UPDATE ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.set_truck_business_name();

CREATE OR REPLACE FUNCTION public.sync_business_name_to_trucks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM coalesce(OLD.name, '') AND NEW.name <> '' THEN
    UPDATE public.trucks SET business_name = NEW.name WHERE coalesce(claimed_by, created_by) = NEW.owner_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS businesses_sync_name ON public.businesses;
CREATE TRIGGER businesses_sync_name AFTER INSERT OR UPDATE OF name ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.sync_business_name_to_trucks();

-- Owners can set up menu, photos and schedule while their own new truck waits for approval.
CREATE OR REPLACE FUNCTION public.owns_truck(_truck_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.trucks WHERE id = _truck_id AND auth.uid() IS NOT NULL
    AND (claimed_by = auth.uid() OR (status = 'pending' AND claimed_by IS NULL AND created_by = auth.uid())))
$$;
DROP POLICY IF EXISTS "owners and admins update trucks" ON public.trucks;
CREATE POLICY "owners and admins update trucks" ON public.trucks FOR UPDATE TO authenticated
USING (public.owns_truck(id) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.owns_truck(id) OR public.has_role(auth.uid(), 'admin'));