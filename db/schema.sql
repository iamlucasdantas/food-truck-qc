-- FoodTruckQC — complete schema for a fresh Supabase project (Postgres 17).
-- Idempotent: safe to run more than once in the Supabase SQL editor.
-- Sources: src/integrations/supabase/types.ts (final column set), drizzle/migrations 0000..0041,
-- and the pre-drizzle base (trucks, stops, favorites, claims, user_roles, ingestion_runs, has_role,
-- review_claim, merge_trucks, auth triggers) reconstructed from app usage.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pg_cron; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron not available: %', SQLERRM; END $$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','owner','consumer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.claim_status AS ENUM ('pending','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.truck_status AS ENUM ('active','pending','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.stop_source AS ENUM ('owner','apify_event','apify_post','apify_maps','estimated','own_post','calendar'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE public.stop_source ADD VALUE IF NOT EXISTS 'own_post';
ALTER TYPE public.stop_source ADD VALUE IF NOT EXISTS 'calendar';

-- ---------------------------------------------------------------------------
-- Tables (final shape; later migrations' columns are included inline)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trucks (
  id text PRIMARY KEY,
  name text NOT NULL,
  business_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  emoji text NOT NULL DEFAULT '🚚',
  description text NOT NULL DEFAULT '',
  truck_type text NOT NULL DEFAULT 'mobile',
  status public.truck_status NOT NULL DEFAULT 'pending',
  is_food_truck boolean NOT NULL DEFAULT true,
  base_address text,
  base_lat double precision,
  base_lng double precision,
  base_location_confirmed_at timestamptz,
  google_place_id text,
  google_regular_hours jsonb,
  google_business_status text,
  google_types text[] NOT NULL DEFAULT '{}',
  google_hours_updated_at timestamptz,
  google_location_verified boolean NOT NULL DEFAULT false,
  phone text,
  website text,
  facebook text,
  instagram text,
  reddit text,
  accepts_card boolean NOT NULL DEFAULT false,
  payment_methods text[] NOT NULL DEFAULT '{}',
  payment_other text NOT NULL DEFAULT '',
  payments_same_as_business boolean NOT NULL DEFAULT true,
  logo_url text,
  menu jsonb NOT NULL DEFAULT '[]'::jsonb,
  menu_sections jsonb,
  menu_summary text,
  menu_search text NOT NULL DEFAULT '',
  menu_updated_at timestamptz,
  source text NOT NULL DEFAULT 'owner',
  claimed_by uuid,
  created_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  merged_into text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trucks_google_place_id_key UNIQUE (google_place_id),
  CONSTRAINT trucks_truck_type_check CHECK (truck_type IN ('fixed','mobile','hybrid')),
  CONSTRAINT trucks_google_business_status_check CHECK (google_business_status IN ('OPERATIONAL','CLOSED_TEMPORARILY','CLOSED_PERMANENTLY'))
);
COMMENT ON COLUMN public.trucks.website IS 'Legacy/unclaimed only: claimed trucks use businesses.website';
COMMENT ON COLUMN public.trucks.instagram IS 'Legacy/unclaimed only: claimed trucks use businesses.instagram';
COMMENT ON COLUMN public.trucks.facebook IS 'Legacy/unclaimed only: claimed trucks use businesses.facebook';
COMMENT ON COLUMN public.trucks.reddit IS 'Legacy/unclaimed only: claimed trucks use businesses.reddit';
COMMENT ON COLUMN public.trucks.is_food_truck IS 'Admin classification: false excludes restaurants and chains from public truck discovery.';
COMMENT ON COLUMN public.trucks.google_regular_hours IS 'Google Places regularOpeningHours snapshot; expanded as America/Chicago stationary-truck stops on read, not stored as individual stops.';
COMMENT ON COLUMN public.trucks.google_location_verified IS 'Explicit Google verification evidence attested by admin; a Place ID alone is not verification.';
COMMENT ON COLUMN public.trucks.google_business_status IS 'Last explicit Google business status; not the daily openNow flag. Closed records are archived, never deleted.';
COMMENT ON COLUMN public.trucks.menu_summary IS 'One-paragraph summary of what the business offers; shown above the menu.';
CREATE INDEX IF NOT EXISTS trucks_status_idx ON public.trucks (status);
CREATE INDEX IF NOT EXISTS trucks_claimed_by_idx ON public.trucks (claimed_by);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  notify_favorites boolean NOT NULL DEFAULT true,
  onboarding jsonb NOT NULL DEFAULT '{}'::jsonb,
  crm_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  truck_id text NOT NULL CONSTRAINT favorites_truck_id_fkey REFERENCES public.trucks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, truck_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_truck_uniq ON public.favorites (user_id, truck_id);

CREATE TABLE IF NOT EXISTS public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL CONSTRAINT claims_truck_id_fkey REFERENCES public.trucks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  message text NOT NULL DEFAULT '',
  status public.claim_status NOT NULL DEFAULT 'pending',
  reject_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claims_truck_idx ON public.claims (truck_id);
CREATE INDEX IF NOT EXISTS claims_user_idx ON public.claims (user_id);

CREATE TABLE IF NOT EXISTS public.ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  items_found integer NOT NULL DEFAULT 0,
  items_created integer NOT NULL DEFAULT 0,
  error text,
  notes text,
  cities_total text[] NOT NULL DEFAULT '{}',
  cities_done text[] NOT NULL DEFAULT '{}',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.social_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  url text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  truck_id text CONSTRAINT social_sources_truck_id_fkey REFERENCES public.trucks(id) ON DELETE CASCADE,
  last_run_at timestamptz,
  last_status text,
  last_posts integer NOT NULL DEFAULT 0,
  last_stops integer NOT NULL DEFAULT 0,
  last_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.social_sources DROP CONSTRAINT IF EXISTS social_sources_kind_check;
ALTER TABLE public.social_sources ADD CONSTRAINT social_sources_kind_check CHECK (kind = ANY (ARRAY['group','page','instagram','reddit','website']));

CREATE TABLE IF NOT EXISTS public.social_posts (
  url text PRIMARY KEY,
  source_id uuid CONSTRAINT social_posts_source_id_fkey REFERENCES public.social_sources(id) ON DELETE SET NULL,
  run_id uuid,
  stops_created integer NOT NULL DEFAULT 0,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.geocode_cache (
  query text PRIMARY KEY,
  lat double precision,
  lng double precision,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stop_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL CONSTRAINT stop_series_truck_id_fkey REFERENCES public.trucks(id) ON DELETE CASCADE,
  venue_name text NOT NULL DEFAULT '',
  address text,
  city text NOT NULL DEFAULT '',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  note text,
  start_time text NOT NULL,
  end_time text NOT NULL,
  freq text NOT NULL CHECK (freq IN ('weekly','biweekly','monthly')),
  weekdays int[] NOT NULL DEFAULT '{}',
  month_nth int,
  start_date date NOT NULL,
  end_date date,
  skip_dates date[] NOT NULL DEFAULT '{}',
  external_uid text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venue_calendar_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  url text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  imported integer NOT NULL DEFAULT 0,
  ignored integer NOT NULL DEFAULT 0,
  in_review integer NOT NULL DEFAULT 0,
  last_error text,
  sync_token uuid,
  sync_started_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.venue_calendar_titles (
  source_id uuid NOT NULL CONSTRAINT venue_calendar_titles_source_id_fkey REFERENCES public.venue_calendar_sources(id) ON DELETE CASCADE,
  title_key text NOT NULL,
  title text NOT NULL,
  decision text NOT NULL DEFAULT 'review' CHECK (decision IN ('review','link','ignore')),
  truck_id text CONSTRAINT venue_calendar_titles_truck_id_fkey REFERENCES public.trucks(id),
  occurrences jsonb NOT NULL DEFAULT '[]',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, title_key)
);

CREATE TABLE IF NOT EXISTS public.stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL CONSTRAINT stops_truck_id_fkey REFERENCES public.trucks(id) ON DELETE CASCADE,
  venue_name text NOT NULL DEFAULT '',
  address text,
  city text NOT NULL DEFAULT '',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_live boolean NOT NULL DEFAULT false,
  cancelled boolean NOT NULL DEFAULT false,
  source public.stop_source NOT NULL DEFAULT 'owner',
  source_url text,
  confidence double precision NOT NULL DEFAULT 1,
  repeat_group text,
  note text,
  series_id uuid CONSTRAINT stops_series_id_fkey REFERENCES public.stop_series(id) ON DELETE CASCADE,
  occurrence_date date,
  calendar_source_id uuid CONSTRAINT stops_calendar_source_id_fkey REFERENCES public.venue_calendar_sources(id),
  calendar_uid text,
  calendar_occurrence text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stops_truck_idx ON public.stops (truck_id);
CREATE INDEX IF NOT EXISTS stops_starts_at_idx ON public.stops (starts_at);
CREATE INDEX IF NOT EXISTS stops_series_idx ON public.stops (series_id);
CREATE UNIQUE INDEX IF NOT EXISTS stops_source_url_start_uq ON public.stops (source_url, starts_at);
CREATE UNIQUE INDEX IF NOT EXISTS stops_calendar_identity ON public.stops (calendar_source_id, calendar_uid, calendar_occurrence);
ALTER TABLE public.stops REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS public.suggested_stops (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id text NOT NULL CONSTRAINT suggested_stops_truck_id_fkey REFERENCES public.trucks(id),
  source text NOT NULL DEFAULT 'community',
  source_url text,
  author text,
  excerpt text NOT NULL DEFAULT ''::text,
  venue_name text NOT NULL DEFAULT ''::text,
  address text,
  city text NOT NULL DEFAULT ''::text,
  lat double precision,
  lng double precision,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  needs_address_check boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.businesses (
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

CREATE TABLE IF NOT EXISTS public.truck_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL CONSTRAINT truck_photos_truck_id_fkey REFERENCES public.trucks(id) ON DELETE CASCADE,
  path text NOT NULL UNIQUE,
  position integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS truck_photos_truck_idx ON public.truck_photos (truck_id, position);

CREATE TABLE IF NOT EXISTS public.calendar_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL CONSTRAINT calendar_feeds_truck_id_fkey REFERENCES public.trucks(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'ical',
  url text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (truck_id, kind)
);

CREATE TABLE IF NOT EXISTS public.truck_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL,
  truck_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('deleted','restored','purged')),
  actor uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  norm_name text NOT NULL UNIQUE,
  address text,
  city text NOT NULL DEFAULT '',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  confirmed boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'places',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_settings (
  user_id uuid PRIMARY KEY,
  bio text NOT NULL DEFAULT '',
  home_area text NOT NULL DEFAULT '',
  dietary text[] NOT NULL DEFAULT '{}',
  cuisines text[] NOT NULL DEFAULT '{}',
  notifications jsonb NOT NULL DEFAULT '{}',
  share_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_trucks (
  user_id uuid NOT NULL,
  truck_id text NOT NULL CONSTRAINT profile_trucks_truck_id_fkey REFERENCES public.trucks(id) ON DELETE CASCADE,
  list text NOT NULL DEFAULT 'want_to_try' CHECK (list IN ('want_to_try','regulars')),
  following boolean NOT NULL DEFAULT false,
  bell boolean NOT NULL DEFAULT true,
  visited_at timestamptz,
  viewed_at timestamptz,
  PRIMARY KEY (user_id, truck_id)
);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL CONSTRAINT api_keys_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'API key',
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.chat_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  endpoint text NOT NULL,
  method text NOT NULL,
  status int NOT NULL,
  auth_ok boolean NOT NULL,
  auth_detail text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS chat_api_logs_created_idx ON public.chat_api_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.app_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  truck_id text,
  venue text,
  path text,
  visitor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_events_created_idx ON public.app_events (created_at DESC);
CREATE INDEX IF NOT EXISTS app_events_kind_idx ON public.app_events (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS public.enrich_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','error')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enrich_runs_truck_created ON public.enrich_runs (truck_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Grants (Supabase default privileges already grant anon/authenticated/service_role;
-- these mirror the explicit grants/revokes from the migrations)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON public.trucks, public.stops, public.stop_series, public.businesses, public.truck_photos TO anon;
GRANT INSERT ON public.app_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trucks, public.stops, public.stop_series, public.favorites, public.claims, public.profiles,
  public.social_sources, public.suggested_stops, public.truck_photos, public.calendar_feeds, public.profile_settings, public.profile_trucks,
  public.ingestion_runs, public.user_roles, public.api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT SELECT ON public.social_posts, public.truck_deletions, public.app_events, public.enrich_runs, public.venue_calendar_sources, public.venue_calendar_titles TO authenticated;
GRANT SELECT, DELETE ON public.chat_api_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venues TO authenticated;
REVOKE ALL ON public.venues FROM anon;
REVOKE ALL ON public.geocode_cache FROM anon, authenticated;
REVOKE ALL ON public.social_posts FROM anon;
REVOKE ALL ON public.profile_settings, public.profile_trucks, public.favorites, public.claims, public.user_roles, public.profiles, public.api_keys,
  public.ingestion_runs, public.suggested_stops, public.social_sources, public.truck_deletions, public.enrich_runs, public.chat_api_logs,
  public.venue_calendar_sources, public.venue_calendar_titles, public.calendar_feeds FROM anon;

-- ---------------------------------------------------------------------------
-- Helper functions (base)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

-- Owners can set up menu, photos and schedule while their own new truck waits for approval. (0017)
CREATE OR REPLACE FUNCTION public.owns_truck(_truck_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.trucks WHERE id = _truck_id AND auth.uid() IS NOT NULL
    AND (claimed_by = auth.uid() OR (status = 'pending' AND claimed_by IS NULL AND created_by = auth.uid())))
$$;
GRANT EXECUTE ON FUNCTION public.owns_truck(text) TO anon, authenticated, service_role;

-- Base claim review: approve = truck.claimed_by := claimant + owner role; other pending claims on the truck are rejected.
CREATE OR REPLACE FUNCTION public.review_claim(_claim_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.claims;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO c FROM public.claims WHERE id = _claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF c.status <> 'pending' THEN RETURN; END IF;
  IF _approve THEN
    UPDATE public.trucks SET claimed_by = c.user_id WHERE id = c.truck_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (c.user_id, 'owner') ON CONFLICT DO NOTHING;
    UPDATE public.claims SET status = 'approved', reviewed_at = now() WHERE id = _claim_id;
    UPDATE public.claims SET status = 'rejected', reviewed_at = now() WHERE truck_id = c.truck_id AND id <> _claim_id AND status = 'pending';
  ELSE
    UPDATE public.claims SET status = 'rejected', reviewed_at = now() WHERE id = _claim_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.review_claim(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_claim(uuid, boolean) TO authenticated, service_role;

-- 0001: reason-aware wrapper
CREATE OR REPLACE FUNCTION public.review_claim(_claim_id uuid, _approve boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  PERFORM public.review_claim(_claim_id, _approve);
  IF NOT _approve THEN UPDATE public.claims SET reject_reason = nullif(_reason,'') WHERE id = _claim_id; END IF;
END $$;
REVOKE ALL ON FUNCTION public.review_claim(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_claim(uuid, boolean, text) TO authenticated;

-- Base merge: move favorites/stops/series/photos/claims into the kept truck, archive the duplicate.
CREATE OR REPLACE FUNCTION public.merge_trucks(_keep text, _dup text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _keep = _dup THEN RAISE EXCEPTION 'Pick a different master truck'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trucks WHERE id = _keep) OR NOT EXISTS (SELECT 1 FROM public.trucks WHERE id = _dup) THEN RAISE EXCEPTION 'Truck not found'; END IF;
  UPDATE public.favorites f SET truck_id = _keep WHERE truck_id = _dup
    AND NOT EXISTS (SELECT 1 FROM public.favorites k WHERE k.user_id = f.user_id AND k.truck_id = _keep);
  DELETE FROM public.favorites WHERE truck_id = _dup;
  UPDATE public.profile_trucks p SET truck_id = _keep WHERE truck_id = _dup
    AND NOT EXISTS (SELECT 1 FROM public.profile_trucks k WHERE k.user_id = p.user_id AND k.truck_id = _keep);
  DELETE FROM public.profile_trucks WHERE truck_id = _dup;
  UPDATE public.stops SET truck_id = _keep WHERE truck_id = _dup;
  UPDATE public.stop_series SET truck_id = _keep WHERE truck_id = _dup;
  UPDATE public.suggested_stops SET truck_id = _keep WHERE truck_id = _dup;
  UPDATE public.social_sources SET truck_id = _keep WHERE truck_id = _dup;
  UPDATE public.truck_photos SET truck_id = _keep WHERE truck_id = _dup;
  UPDATE public.claims SET truck_id = _keep WHERE truck_id = _dup;
  UPDATE public.trucks SET merged_into = _keep, status = 'archived' WHERE id = _dup;
END $$;
REVOKE ALL ON FUNCTION public.merge_trucks(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_trucks(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Auth triggers: profile + consumer role on signup; admin by verified email (0003/0004/0007/0015)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), ''),
    NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'consumer') ON CONFLICT DO NOTHING;
  IF NEW.email_confirmed_at IS NOT NULL
     AND NEW.email IN ('dantas@magneticfunnels.io', 'magneticfunnels@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_email_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL
     AND NEW.email IN ('dantas@magneticfunnels.io', 'magneticfunnels@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_admin_for_verified_email()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND lower(NEW.email) IN ('dantas@magneticfunnels.io','magneticfunnels@gmail.com','foodtruckqc@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_admin AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_for_verified_email();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_admin AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_admin_for_verified_email();

-- ---------------------------------------------------------------------------
-- Trigger functions + triggers from the migrations
-- ---------------------------------------------------------------------------
-- 0000 owner stops override scraped stops
CREATE OR REPLACE FUNCTION public.owner_stop_overrides()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source = 'owner' AND NOT NEW.cancelled THEN
    UPDATE public.stops SET cancelled = true
    WHERE truck_id = NEW.truck_id AND id <> NEW.id AND source <> 'owner' AND NOT cancelled
      AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stops_owner_override ON public.stops;
CREATE TRIGGER stops_owner_override AFTER INSERT OR UPDATE OF starts_at, ends_at, cancelled ON public.stops
  FOR EACH ROW EXECUTE FUNCTION public.owner_stop_overrides();

-- 0018 live stops capped at 12h (base trigger)
CREATE OR REPLACE FUNCTION public.cap_live_stop() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.is_live AND NEW.ends_at > NEW.starts_at + interval '12 hours' THEN
    NEW.ends_at := NEW.starts_at + interval '12 hours';
  END IF;
  IF NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'Closing time must be after opening time'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stops_cap_live ON public.stops;
CREATE TRIGGER stops_cap_live BEFORE INSERT OR UPDATE ON public.stops FOR EACH ROW EXECUTE FUNCTION public.cap_live_stop();

-- 0012 business auto-fill from truck
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
DROP TRIGGER IF EXISTS trucks_fill_business ON public.trucks;
CREATE TRIGGER trucks_fill_business AFTER INSERT OR UPDATE OF claimed_by, created_by ON public.trucks
  FOR EACH ROW EXECUTE FUNCTION public.fill_business_from_truck();

-- 0013 max 12 photos
CREATE OR REPLACE FUNCTION public.limit_truck_photos()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF (SELECT count(*) FROM public.truck_photos WHERE truck_id = NEW.truck_id) >= 12 THEN
    RAISE EXCEPTION 'A truck can have up to 12 photos';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS truck_photos_limit ON public.truck_photos;
CREATE TRIGGER truck_photos_limit BEFORE INSERT ON public.truck_photos FOR EACH ROW EXECUTE FUNCTION public.limit_truck_photos();

-- 0017 business name sync
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

-- 0018 updated_at, guard, soft delete, purge
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
DROP TRIGGER IF EXISTS trucks_guard_update ON public.trucks;
CREATE TRIGGER trucks_guard_update BEFORE UPDATE ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.guard_truck_update();

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

DO $$ BEGIN
  PERFORM cron.schedule('purge-deleted-trucks', '15 9 * * *', 'SELECT public.purge_deleted_trucks()');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron.schedule skipped: %', SQLERRM; END $$;

-- 0014 / 0040 email lookups
CREATE OR REPLACE FUNCTION public.owner_id_by_email(_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(trim(_email)) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.owner_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_id_by_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_user_id_by_email(_email text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT u.id INTO _id FROM auth.users u WHERE lower(u.email) = lower(trim(_email)) LIMIT 1;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_user_id_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_id_by_email(text) TO authenticated;

-- 0020 / 0021 profile helpers
CREATE OR REPLACE FUNCTION public.shared_foodie_profile(_user_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url, 'bio', s.bio, 'cuisines', s.cuisines, 'member_since', p.created_at)
 FROM public.profiles p JOIN public.profile_settings s ON s.user_id = p.id
 WHERE p.id = _user_id AND s.share_enabled = true;
$$;
REVOKE ALL ON FUNCTION public.shared_foodie_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_foodie_profile(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.owner_favorite_summary(_truck_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object('total', (SELECT count(*) FROM public.favorites WHERE truck_id = _truck_id), 'daily', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT date_trunc('day', created_at) AS day, count(*) AS count FROM public.favorites WHERE truck_id = _truck_id AND created_at >= now() - interval '7 days' GROUP BY 1 ORDER BY 1) x))
 WHERE public.owns_truck(_truck_id);
$$;
REVOKE ALL ON FUNCTION public.owner_favorite_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_favorite_summary(text) TO authenticated;

-- 0028 / 0029 location confirmation
CREATE OR REPLACE FUNCTION public.guard_location_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF TG_OP='INSERT' THEN
IF auth.uid() IS NOT NULL THEN NEW.google_location_verified := false; NEW.base_location_confirmed_at := NULL; END IF;
ELSIF NEW.base_address IS DISTINCT FROM OLD.base_address OR NEW.base_lat IS DISTINCT FROM OLD.base_lat OR NEW.base_lng IS DISTINCT FROM OLD.base_lng THEN NEW.google_location_verified := false; NEW.base_location_confirmed_at := NULL;
ELSIF current_setting('app.confirm_location',true) IS DISTINCT FROM 'yes' AND auth.uid() IS NOT NULL THEN NEW.google_location_verified := OLD.google_location_verified; NEW.base_location_confirmed_at := OLD.base_location_confirmed_at; END IF;
RETURN NEW; END $$;
DROP TRIGGER IF EXISTS guard_location_confirmation ON public.trucks;
CREATE TRIGGER guard_location_confirmation BEFORE UPDATE ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.guard_location_confirmation();
DROP TRIGGER IF EXISTS guard_location_confirmation_insert ON public.trucks;
CREATE TRIGGER guard_location_confirmation_insert BEFORE INSERT ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.guard_location_confirmation();

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

-- 0030 google business status guard
CREATE OR REPLACE FUNCTION public.guard_google_business_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
IF TG_OP='INSERT' THEN NEW.google_business_status := NULL; ELSE NEW.google_business_status := OLD.google_business_status; END IF;
END IF;
RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.guard_google_business_status() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_google_business_status ON public.trucks;
CREATE TRIGGER guard_google_business_status BEFORE INSERT OR UPDATE ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.guard_google_business_status();

-- 0031 / 0036 ingestion review on approval
CREATE OR REPLACE FUNCTION public.sync_truck_ingestion_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NEW.truck_type = 'fixed' AND (nullif(btrim(NEW.base_address),'') IS NULL OR NEW.base_lat IS NULL OR NEW.base_lng IS NULL) THEN
   RAISE EXCEPTION 'Fixed-location trucks need an address and coordinates before approval';
  END IF;
  IF nullif(btrim(NEW.category),'') IS NULL OR lower(btrim(NEW.category)) IN ('other','unknown','uncategorized') THEN
   RAISE EXCEPTION 'Add a category from the Google or Facebook profile before approving this truck';
  END IF;
  IF OLD.status = 'pending' AND NEW.claimed_by IS NULL THEN
   INSERT INTO public.stops (truck_id,venue_name,address,city,lat,lng,starts_at,ends_at,source,source_url)
   SELECT NEW.id,s.venue_name,s.address,s.city,s.lat,s.lng,s.starts_at,s.ends_at,'apify_post',s.source_url
   FROM public.suggested_stops s WHERE s.truck_id=NEW.id AND s.status='pending' AND NOT s.needs_address_check
    AND nullif(btrim(s.address),'') IS NOT NULL AND s.lat IS NOT NULL AND s.lng IS NOT NULL
    AND s.ends_at > now() AND s.ends_at > s.starts_at
    AND NOT EXISTS (SELECT 1 FROM public.stops p WHERE p.truck_id=s.truck_id AND p.starts_at=s.starts_at AND p.venue_name=s.venue_name)
   ON CONFLICT DO NOTHING;
   UPDATE public.suggested_stops SET status='approved',reviewed_at=now() WHERE truck_id=NEW.id AND status='pending'
    AND NOT needs_address_check AND nullif(btrim(address),'') IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL
    AND ends_at > now() AND ends_at > starts_at;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_truck_ingestion_review ON public.trucks;
CREATE TRIGGER sync_truck_ingestion_review BEFORE UPDATE OF status ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.sync_truck_ingestion_review();

CREATE OR REPLACE FUNCTION public.admin_review_suggested_stop(_id uuid,_approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.suggested_stops%ROWTYPE; t public.trucks%ROWTYPE;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO s FROM public.suggested_stops WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
 IF s.status <> 'pending' THEN RETURN; END IF;
 SELECT * INTO t FROM public.trucks WHERE id=s.truck_id FOR UPDATE;
 IF NOT FOUND OR t.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Truck not available'; END IF;
 IF _approve THEN
  IF t.status='archived' THEN RAISE EXCEPTION 'Approve the archived truck from Trucks first'; END IF;
  IF nullif(btrim(s.address),'') IS NULL OR s.lat IS NULL OR s.lng IS NULL OR s.needs_address_check OR s.ends_at<=s.starts_at THEN
   RAISE EXCEPTION 'Confirm the stop address and coordinates before publishing';
  END IF;
  IF t.status='pending' THEN UPDATE public.trucks SET status='active' WHERE id=t.id; END IF;
  INSERT INTO public.stops(truck_id,venue_name,address,city,lat,lng,starts_at,ends_at,source,source_url)
  SELECT s.truck_id,s.venue_name,s.address,s.city,s.lat,s.lng,s.starts_at,s.ends_at,'apify_post',s.source_url
  WHERE NOT EXISTS (SELECT 1 FROM public.stops p WHERE p.truck_id=s.truck_id AND p.starts_at=s.starts_at AND p.venue_name=s.venue_name)
  ON CONFLICT DO NOTHING;
 END IF;
 UPDATE public.suggested_stops SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,reviewed_at=now() WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_review_suggested_stop(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_review_suggested_stop(uuid,boolean) TO authenticated,service_role;

-- 0033 / 0034 venue calendar reconciliation
CREATE OR REPLACE FUNCTION public.reconcile_venue_calendar(_source_id uuid, _token uuid, _stops jsonb, _titles jsonb, _ignored integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.venue_calendar_sources; item jsonb;
BEGIN
 SELECT * INTO s FROM public.venue_calendar_sources WHERE id=_source_id FOR UPDATE;
 IF s.sync_token IS DISTINCT FROM _token THEN RAISE EXCEPTION 'Calendar sync lease expired'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_stops) LOOP
 INSERT INTO public.stops(truck_id,venue_name,address,city,lat,lng,starts_at,ends_at,source,confidence,is_live,cancelled,source_url,calendar_source_id,calendar_uid,calendar_occurrence)
 VALUES(item->>'truck_id',s.name,s.address,s.city,s.lat,s.lng,(item->>'start')::timestamptz,(item->>'end')::timestamptz,'calendar',1,false,EXISTS(SELECT 1 FROM public.stops o WHERE o.truck_id=item->>'truck_id' AND o.source='owner' AND NOT o.cancelled AND o.starts_at<(item->>'end')::timestamptz AND o.ends_at>(item->>'start')::timestamptz),s.url||'#event='||md5((item->>'uid')||':'||(item->>'occurrence')),s.id,item->>'uid',item->>'occurrence')
 ON CONFLICT(calendar_source_id,calendar_uid,calendar_occurrence) DO UPDATE SET truck_id=EXCLUDED.truck_id,venue_name=EXCLUDED.venue_name,address=EXCLUDED.address,city=EXCLUDED.city,lat=EXCLUDED.lat,lng=EXCLUDED.lng,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,cancelled=EXCLUDED.cancelled,source_url=EXCLUDED.source_url;
 END LOOP;
 DELETE FROM public.stops t WHERE t.calendar_source_id=s.id AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_stops) e WHERE e->>'uid'=t.calendar_uid AND e->>'occurrence'=t.calendar_occurrence);
 UPDATE public.venue_calendar_titles SET occurrences='[]' WHERE source_id=s.id;
 FOR item IN SELECT value FROM jsonb_array_elements(_titles) LOOP
 INSERT INTO public.venue_calendar_titles(source_id,title_key,title,occurrences) VALUES(s.id,item->>'key',item->>'title',item->'occurrences') ON CONFLICT(source_id,title_key) DO UPDATE SET title=EXCLUDED.title,occurrences=EXCLUDED.occurrences,last_seen_at=now();
 END LOOP;
 UPDATE public.venue_calendar_sources SET last_sync_at=now(), imported=jsonb_array_length(_stops),ignored=_ignored,in_review=jsonb_array_length(_titles),last_error=null,sync_token=null,sync_started_at=null WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_venue_calendar(uuid,uuid,jsonb,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_venue_calendar(uuid,uuid,jsonb,jsonb,integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stop_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggested_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.truck_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.truck_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrich_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_calendar_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_calendar_titles ENABLE ROW LEVEL SECURITY;

-- trucks (base, reconstructed): public sees non-archived live listings; owners see their own; admins see all.
DROP POLICY IF EXISTS "public reads trucks" ON public.trucks;
CREATE POLICY "public reads trucks" ON public.trucks FOR SELECT TO anon, authenticated
  USING ((status <> 'archived' AND deleted_at IS NULL) OR claimed_by = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "owners and admins insert trucks" ON public.trucks;
CREATE POLICY "owners and admins insert trucks" ON public.trucks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "owners and admins update trucks" ON public.trucks;
CREATE POLICY "owners and admins update trucks" ON public.trucks FOR UPDATE TO authenticated
  USING (public.owns_truck(id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_truck(id) OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins delete trucks" ON public.trucks;
CREATE POLICY "admins delete trucks" ON public.trucks FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- stops (0008 read; base writes)
DROP POLICY IF EXISTS "public reads stops" ON public.stops;
DROP POLICY IF EXISTS "public reads stops of visible trucks" ON public.stops;
CREATE POLICY "public reads stops of visible trucks" ON public.stops FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.trucks t WHERE t.id = stops.truck_id));
DROP POLICY IF EXISTS "owners insert stops" ON public.stops;
CREATE POLICY "owners insert stops" ON public.stops FOR INSERT TO authenticated
  WITH CHECK (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "owners update stops" ON public.stops;
CREATE POLICY "owners update stops" ON public.stops FOR UPDATE TO authenticated
  USING (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "owners delete stops" ON public.stops;
CREATE POLICY "owners delete stops" ON public.stops FOR DELETE TO authenticated
  USING (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));

-- stop_series (0009)
DROP POLICY IF EXISTS "public reads series of visible trucks" ON public.stop_series;
CREATE POLICY "public reads series of visible trucks" ON public.stop_series FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.trucks t WHERE t.id = stop_series.truck_id));
DROP POLICY IF EXISTS "owners insert series" ON public.stop_series;
CREATE POLICY "owners insert series" ON public.stop_series FOR INSERT TO authenticated
  WITH CHECK (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "owners update series" ON public.stop_series;
CREATE POLICY "owners update series" ON public.stop_series FOR UPDATE TO authenticated
  USING (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "owners delete series" ON public.stop_series;
CREATE POLICY "owners delete series" ON public.stop_series FOR DELETE TO authenticated
  USING (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));

-- favorites (base)
DROP POLICY IF EXISTS "own favorites" ON public.favorites;
CREATE POLICY "own favorites" ON public.favorites FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- claims (base)
DROP POLICY IF EXISTS "own or admin reads claims" ON public.claims;
CREATE POLICY "own or admin reads claims" ON public.claims FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "users create own claims" ON public.claims;
CREATE POLICY "users create own claims" ON public.claims FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "admins update claims" ON public.claims;
CREATE POLICY "admins update claims" ON public.claims FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admins delete claims" ON public.claims;
CREATE POLICY "admins delete claims" ON public.claims FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- user_roles (base): read own roles; writes only through security-definer functions
DROP POLICY IF EXISTS "own roles read" ON public.user_roles;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- profiles (0007)
DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "own profile delete" ON public.profiles;
CREATE POLICY "own profile delete" ON public.profiles FOR DELETE TO authenticated USING (id = auth.uid());

-- ingestion_runs (base): admins only
DROP POLICY IF EXISTS "admins manage ingestion runs" ON public.ingestion_runs;
CREATE POLICY "admins manage ingestion runs" ON public.ingestion_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- social (0006)
DROP POLICY IF EXISTS "admins manage social sources" ON public.social_sources;
CREATE POLICY "admins manage social sources" ON public.social_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins read social posts" ON public.social_posts;
CREATE POLICY "admins read social posts" ON public.social_posts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- suggested_stops (0011)
DROP POLICY IF EXISTS "owners read suggestions" ON public.suggested_stops;
CREATE POLICY "owners read suggestions" ON public.suggested_stops FOR SELECT TO authenticated
  USING (owns_truck(truck_id) OR has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "owners update suggestions" ON public.suggested_stops;
CREATE POLICY "owners update suggestions" ON public.suggested_stops FOR UPDATE TO authenticated
  USING (owns_truck(truck_id) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (owns_truck(truck_id) OR has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "admins insert suggestions" ON public.suggested_stops;
CREATE POLICY "admins insert suggestions" ON public.suggested_stops FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "owners delete suggestions" ON public.suggested_stops;
CREATE POLICY "owners delete suggestions" ON public.suggested_stops FOR DELETE TO authenticated
  USING (owns_truck(truck_id) OR has_role(auth.uid(), 'admin'::app_role));

-- businesses (0012 / 0040)
DROP POLICY IF EXISTS "public reads businesses of active trucks" ON public.businesses;
CREATE POLICY "public reads businesses of active trucks" ON public.businesses FOR SELECT TO anon, authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.trucks t WHERE t.claimed_by = businesses.owner_id AND t.status = 'active'));
DROP POLICY IF EXISTS "owner inserts own business" ON public.businesses;
CREATE POLICY "owner inserts own business" ON public.businesses FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "owner updates own business" ON public.businesses;
CREATE POLICY "owner updates own business" ON public.businesses FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admins delete businesses" ON public.businesses;
CREATE POLICY "admins delete businesses" ON public.businesses FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- truck_photos (0013)
DROP POLICY IF EXISTS "public reads photos of visible trucks" ON public.truck_photos;
CREATE POLICY "public reads photos of visible trucks" ON public.truck_photos FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.trucks t WHERE t.id = truck_photos.truck_id));
DROP POLICY IF EXISTS "owners add photos" ON public.truck_photos;
CREATE POLICY "owners add photos" ON public.truck_photos FOR INSERT TO authenticated
  WITH CHECK (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "owners update photos" ON public.truck_photos;
CREATE POLICY "owners update photos" ON public.truck_photos FOR UPDATE TO authenticated
  USING (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "owners delete photos" ON public.truck_photos;
CREATE POLICY "owners delete photos" ON public.truck_photos FOR DELETE TO authenticated
  USING (public.owns_truck(truck_id) OR public.has_role(auth.uid(),'admin'));

-- calendar_feeds (0009)
DROP POLICY IF EXISTS "owners manage feeds" ON public.calendar_feeds;
CREATE POLICY "owners manage feeds" ON public.calendar_feeds FOR ALL TO authenticated
  USING (public.owns_truck(truck_id)) WITH CHECK (public.owns_truck(truck_id) AND created_by = auth.uid());

-- truck_deletions (0018)
DROP POLICY IF EXISTS "admins read deletion log" ON public.truck_deletions;
CREATE POLICY "admins read deletion log" ON public.truck_deletions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- venues (0019 / 0024)
DROP POLICY IF EXISTS "anyone reads venues" ON public.venues;
DROP POLICY IF EXISTS "admins manage venues" ON public.venues;
CREATE POLICY "admins manage venues" ON public.venues FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- profile_settings / profile_trucks (0020)
DROP POLICY IF EXISTS "Own private preferences" ON public.profile_settings;
CREATE POLICY "Own private preferences" ON public.profile_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Own truck library" ON public.profile_trucks;
CREATE POLICY "Own truck library" ON public.profile_trucks FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- api_keys (0022 / 0023)
DROP POLICY IF EXISTS api_keys_owner_select ON public.api_keys;
CREATE POLICY api_keys_owner_select ON public.api_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS api_keys_owner_delete ON public.api_keys;
CREATE POLICY api_keys_owner_delete ON public.api_keys FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS api_keys_owner_insert ON public.api_keys;
CREATE POLICY api_keys_owner_insert ON public.api_keys FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- chat_api_logs (0026)
DROP POLICY IF EXISTS "Admins read chat api logs" ON public.chat_api_logs;
CREATE POLICY "Admins read chat api logs" ON public.chat_api_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins delete chat api logs" ON public.chat_api_logs;
CREATE POLICY "Admins delete chat api logs" ON public.chat_api_logs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- app_events (0036)
DROP POLICY IF EXISTS "anyone logs usage events" ON public.app_events;
CREATE POLICY "anyone logs usage events" ON public.app_events FOR INSERT TO anon, authenticated
  WITH CHECK (kind IN ('page_view','truck_view','direction_click','stop_view','search')
    AND coalesce(length(path),0) <= 300 AND coalesce(length(venue),0) <= 200
    AND coalesce(length(truck_id),0) <= 120 AND coalesce(length(visitor),0) <= 64);
DROP POLICY IF EXISTS "admins read usage events" ON public.app_events;
CREATE POLICY "admins read usage events" ON public.app_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- enrich_runs (0039)
DROP POLICY IF EXISTS "Admins read enrich runs" ON public.enrich_runs;
CREATE POLICY "Admins read enrich runs" ON public.enrich_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- venue calendars (0033)
DROP POLICY IF EXISTS admin_read ON public.venue_calendar_sources;
CREATE POLICY admin_read ON public.venue_calendar_sources FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS admin_read ON public.venue_calendar_titles;
CREATE POLICY admin_read ON public.venue_calendar_titles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Storage buckets + policies (0013 / 0016; avatars from the AI Studio reconstruction)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('truck-photos', 'truck-photos', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "logos public read" ON storage.objects;
DROP POLICY IF EXISTS "truck photos readable" ON storage.objects;
DROP POLICY IF EXISTS "truck owners read photos" ON storage.objects;
CREATE POLICY "truck owners read photos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'truck-photos' AND (public.owns_truck((storage.foldername(name))[1]) OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS "truck owners upload photos" ON storage.objects;
CREATE POLICY "truck owners upload photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'truck-photos' AND (public.owns_truck((storage.foldername(name))[1]) OR public.has_role(auth.uid(),'admin')));
DROP POLICY IF EXISTS "truck owners delete photos" ON storage.objects;
CREATE POLICY "truck owners delete photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'truck-photos' AND (public.owns_truck((storage.foldername(name))[1]) OR public.has_role(auth.uid(),'admin')));

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
CREATE POLICY "avatars owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
CREATE POLICY "avatars owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;
CREATE POLICY "avatars owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Realtime (0000)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stops') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stops;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'realtime publication skipped: %', SQLERRM; END $$;

-- ---------------------------------------------------------------------------
-- Drizzle bookkeeping: mark 0000..0041 as applied (hash = sha256 of file content, created_at = journal "when")
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint);
-- @@DRIZZLE_ROWS@@
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT v.hash, v.created_at FROM (VALUES
  /* 0000_owner_override_realtime */ ('561fcb2bf8940624de9e3c0c3e5ab08f4371805cddd548e186c861782bd0c48b', 1792113249931),
  /* 0001_admin_reasons_source */ ('950935ff063672ca19ce627d745d8a3fc77a085c87232c4dd187fd4b22dab892', 1792113505166),
  /* 0002_google_place_id */ ('0c13e6da42b57bbf3a23a3d582ebf94500e8242f9ebb92b4925edc98bd0cf931', 1792115374132),
  /* 0003_admin_by_verified_email */ ('c86b2f08f3b2f8861f574293cbd119bf0a659ec1489d3ba0a11b9c97802541f5', 1792115642837),
  /* 0004_second_admin_email */ ('a402c725216550bd8e1be7e1f4aa540d7a4b5422de5a845403c8f047d9644189', 1792115682338),
  /* 0005_ingestion_city_progress */ ('440e18695e61a5008ff1bfba20fde5986c5bd8a19c01e4f7bd9fc10b70ac5ec1', 1792117195034),
  /* 0006_facebook_sources */ ('b9780d7497cda9f08d0bdcfff3b45bb2be88929f9db02dd18d0883a3649260c0', 1792150534509),
  /* 0007_profiles */ ('2dd74bf008a75884dc8cc3263c56ec9b259164b8363d8a0b7b67e44d6022abcf', 1792157604941),
  /* 0008_tighten_stops_read_drop_logos_policy */ ('9192c6548e7f4e443c9a92469c3803f5b5db952ea1d0d576f72e9b2d58475700', 1792158223237),
  /* 0009_owner_schedule_series */ ('e098f82106fd66517ba5a25dad37811d0bda45e23b9e113660ac3fbe8f7cd6f8', 1792164686554),
  /* 0010_add_truck_type */ ('8492cd433494d8b81329fd6217ffadabb5a50e130a8f69c872057fa7943a3db8', 1792166323904),
  /* 0011_suggested_stops_and_reddit_handle */ ('7dc55363a1bd3e078f130f1991676500cb1225754ca5e8a7f13db82905fd85cc', 1792166569491),
  /* 0012_business_profiles */ ('2b14eaf1dbd397487d484fcd38e0f0de9088b6863a72a50b03a26d6cfb4cbed8', 1792167784643),
  /* 0013_truck_photos_and_menu */ ('f0ef7a4d85f11d52cbe8ed0585be8ad35b9acb403176d400f3deb2424888de36', 1792168069874),
  /* 0014_owner_id_by_email */ ('705ccebf821b893cf47f5a8d1d26cda4741a4eadc80502dd0e19b3396807eae7', 1792168669291),
  /* 0015_admin_email_foodtruckqc */ ('deda7ab02eda44d4bd886df78175991bbaa2d0fb51043e5e109b83cff5a017b3', 1792169623796),
  /* 0016_truck_photos_read_owner_only */ ('b82cce6212345d27c61808db5a8dc0ec016d2883e7bb651694bb07bd8b46846c', 1792169971026),
  /* 0017_business_name_on_trucks_and_onboarding */ ('77d46713d55312d081dafad138f9ed5d31057dd8c89d8e85295bec475d971849', 1792170333692),
  /* 0018_admin_truck_delete_restore_live_12h */ ('7067baca129c4a4388bca0ace99f2a2ef3bf1741387a4dd2ac73074c56b3574e', 1792170993748),
  /* 0019_venues_and_source_results */ ('4094e763c95f4f43eef9775bfb87510621dd11fe4a068eca1dbb02837b479e4a', 1792171617410),
  /* 0020_premium_profile_preferences */ ('4ebe7049ea74433c92141d6c9c204efd777a58414db374032eca298f27c80eb7', 1792179950472),
  /* 0021_owner_profile_favorite_summary */ ('a7a0452ab35df0cc55a35aa2f6725df19cd01f29044534f2f44f1438e60f77e3', 1792180004589),
  /* 0022_api_keys */ ('f1ac7f71a10a15f64238c53f1c972b63c5c2f58dfe194d27c933a6043213346f', 1792244210078),
  /* 0023_api_keys_insert_policy */ ('138b6cdfc046a311db2276d32e1c2416fc813e8a57aebf40a096df8003c60c3a', 1792244252121),
  /* 0024_venues_admin_only_read */ ('81a2856bc0abeb8f40346ae3ce836f90c11482d294e3a454116e56e0a0f08880', 1792250543053),
  /* 0025_classify_food_trucks */ ('a5c8c8d96f8e9e12cc4d15e9fcfcb0f78d6a88c198971dda1cfcb2b82fa292c8', 1792254586680),
  /* 0026_chat_api_logs */ ('9807783fb3b4cfe352374cfec2627a8a9ce87901906935df8f42811afc3f42fd', 1792256985240),
  /* 0027_stationary_google_hours */ ('d7548d31afac6383ea78b7df1576b24da094b35f9e62a58a54b31a4b9d18e601', 1792259840028),
  /* 0028_truck_location_confirmation */ ('c393e6ed05e2c9e2b3195bc0378cb84664481d8c90858bfa9024f4cb40fb3b39', 1792260620803),
  /* 0029_protect_location_confirmation_inserts */ ('c3d8dcc4f46feb3fe7bdb6722ef21010cea37968e7e645fedbbafa36d20cefa1', 1792260713874),
  /* 0030_google_business_status */ ('c72d4181ce31508240488676d64ef12836bac3595f5b3c4dff44b4c323489439', 1792342533783),
  /* 0031_unified_scraper_review */ ('0b7a13274e9e475b2a302c52a9ee2ab0fca0335f0393fea39a36d7c7da79b4f9', 1792363048337),
  /* 0032_calendar_stop_source */ ('6d215a1fadd42e4b4bb2985a10332433289a6c5f9b5cd45048e5c4efea4cb344', 1792423326623),
  /* 0033_venue_calendar_sources */ ('62e40510ee0e3472cc078f3049695b3eb3ec078bd5296e246fd20455b9024b67', 1792423354054),
  /* 0034_calendar_event_provenance_identity */ ('b5069ad489506326eb53a179a9d45a74c3845963274d7b4da83ed656a1409a36', 1792423558372),
  /* 0035_social_sources_all_kinds */ ('3f51a783e3e87e9c2fedce6c93518dd56c3b63ba6b7374881f409b245b261b20', 1792432713176),
  /* 0036_fixed_address_rule_and_app_events */ ('aa663de676e0d050fc55ec7950eedac9d179d4c14c27bb1ce0792e54b1475230', 1792519697537),
  /* 0037_website_source_kind */ ('e18ea40c188ccb0b172ce95423edb5f1c7cc5bc63a0f6aec8991fb218da6016e', 1792519826295),
  /* 0038_hybrid_truck_type_and_menu_summary */ ('3129aeb227802a7e17574afde1d3ec9a04cadcc66a9059b777ea28bdd85e9d53', 1792531622618),
  /* 0039_enrich_runs */ ('761ea59cca58a70c7eb3161152464af27a60c17fccea234eba967e5aba82d10d', 1792533831879),
  /* 0040_admin_mcp_helpers */ ('43ec9152d0948884626bd6751d953d0fdda46ce442560cdbc15959cf8bbd7f0e', 1792630795847),
  /* 0041_remove_google_maps_base_stops */ ('78f8e62c62f5a3ac76f579950df0866b405d5e61c689e2d36058aa83112ea358', 1792968484596)
) AS v(hash, created_at)
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations m WHERE m.hash = v.hash);
