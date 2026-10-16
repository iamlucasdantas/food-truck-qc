CREATE TABLE public.businesses (
  owner_id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  website text,
  instagram text,
  facebook text,
  reddit text,
  logo_url text,
  payment_methods text[] NOT NULL DEFAULT '{}',
  payment_other text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.businesses TO anon;
GRANT SELECT, INSERT, UPDATE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public reads businesses of active trucks" ON public.businesses FOR SELECT TO anon, authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.trucks t WHERE t.claimed_by = businesses.owner_id AND t.status = 'active'));
CREATE POLICY "owner inserts own business" ON public.businesses FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owner updates own business" ON public.businesses FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

ALTER TABLE public.trucks ADD COLUMN payments_same_as_business boolean NOT NULL DEFAULT true;
ALTER TABLE public.trucks ADD COLUMN payment_methods text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.trucks ADD COLUMN payment_other text NOT NULL DEFAULT '';
COMMENT ON COLUMN public.trucks.website IS 'Legacy/unclaimed only: claimed trucks use businesses.website';
COMMENT ON COLUMN public.trucks.instagram IS 'Legacy/unclaimed only: claimed trucks use businesses.instagram';
COMMENT ON COLUMN public.trucks.facebook IS 'Legacy/unclaimed only: claimed trucks use businesses.facebook';
COMMENT ON COLUMN public.trucks.reddit IS 'Legacy/unclaimed only: claimed trucks use businesses.reddit';

-- Copy a truck's business-level data into its owner's business, only filling empty business fields.
CREATE OR REPLACE FUNCTION public.fill_business_from_truck()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _owner uuid := coalesce(NEW.claimed_by, NEW.created_by);
DECLARE _desc text := trim(regexp_replace(regexp_replace(coalesce(NEW.description,''), 'Owner contact:[^\n]*', '', 'g'), 'Business:[^\n]*', '', 'g'));
DECLARE _bname text := coalesce(substring(NEW.description from 'Business: ([^\n]+)'), '');
BEGIN
  IF _owner IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.claimed_by IS NOT DISTINCT FROM OLD.claimed_by AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by THEN RETURN NEW; END IF;
  INSERT INTO public.businesses AS b (owner_id, name, description, website, instagram, facebook, reddit, logo_url, payment_methods)
  VALUES (_owner, _bname, _desc, NEW.website, NEW.instagram, NEW.facebook, NEW.reddit, NEW.logo_url,
          CASE WHEN NEW.accepts_card THEN ARRAY['Cash','Credit/debit card'] ELSE ARRAY['Cash'] END)
  ON CONFLICT (owner_id) DO UPDATE SET
    name = CASE WHEN b.name = '' THEN EXCLUDED.name ELSE b.name END,
    description = CASE WHEN b.description = '' THEN EXCLUDED.description ELSE b.description END,
    website = coalesce(nullif(b.website,''), EXCLUDED.website),
    instagram = coalesce(nullif(b.instagram,''), EXCLUDED.instagram),
    facebook = coalesce(nullif(b.facebook,''), EXCLUDED.facebook),
    reddit = coalesce(nullif(b.reddit,''), EXCLUDED.reddit),
    logo_url = coalesce(b.logo_url, EXCLUDED.logo_url),
    payment_methods = CASE WHEN cardinality(b.payment_methods) = 0 THEN EXCLUDED.payment_methods ELSE b.payment_methods END;
  RETURN NEW;
END $$;

CREATE TRIGGER trucks_fill_business AFTER INSERT OR UPDATE OF claimed_by, created_by ON public.trucks
  FOR EACH ROW EXECUTE FUNCTION public.fill_business_from_truck();

-- Backfill existing owners (claimed trucks first, then trucks they created), oldest first.
DO $$ DECLARE r public.trucks; BEGIN
  FOR r IN SELECT * FROM public.trucks WHERE claimed_by IS NOT NULL OR created_by IS NOT NULL
           ORDER BY (claimed_by IS NULL), created_at LOOP
    PERFORM 1;
    INSERT INTO public.businesses AS b (owner_id, name, description, website, instagram, facebook, reddit, logo_url, payment_methods)
    VALUES (coalesce(r.claimed_by, r.created_by), coalesce(substring(r.description from 'Business: ([^\n]+)'), ''),
            trim(regexp_replace(regexp_replace(coalesce(r.description,''), 'Owner contact:[^\n]*', '', 'g'), 'Business:[^\n]*', '', 'g')),
            r.website, r.instagram, r.facebook, r.reddit, r.logo_url,
            CASE WHEN r.accepts_card THEN ARRAY['Cash','Credit/debit card'] ELSE ARRAY['Cash'] END)
    ON CONFLICT (owner_id) DO UPDATE SET
      name = CASE WHEN b.name = '' THEN EXCLUDED.name ELSE b.name END,
      description = CASE WHEN b.description = '' THEN EXCLUDED.description ELSE b.description END,
      website = coalesce(nullif(b.website,''), EXCLUDED.website),
      instagram = coalesce(nullif(b.instagram,''), EXCLUDED.instagram),
      facebook = coalesce(nullif(b.facebook,''), EXCLUDED.facebook),
      reddit = coalesce(nullif(b.reddit,''), EXCLUDED.reddit),
      logo_url = coalesce(b.logo_url, EXCLUDED.logo_url);
  END LOOP;
END $$;