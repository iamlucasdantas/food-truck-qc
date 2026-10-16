ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS google_place_id text;
ALTER TABLE public.trucks ADD CONSTRAINT trucks_google_place_id_key UNIQUE (google_place_id);