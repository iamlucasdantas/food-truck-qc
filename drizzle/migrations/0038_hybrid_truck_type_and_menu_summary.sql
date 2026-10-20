ALTER TABLE public.trucks DROP CONSTRAINT IF EXISTS trucks_truck_type_check;
ALTER TABLE public.trucks DROP CONSTRAINT IF EXISTS trucks_n_check;
ALTER TABLE public.trucks ADD CONSTRAINT trucks_truck_type_check CHECK (truck_type IN ('fixed','mobile','hybrid')) NOT VALID;
ALTER TABLE public.trucks VALIDATE CONSTRAINT trucks_truck_type_check;
ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS menu_summary text;
COMMENT ON COLUMN public.trucks.menu_summary IS 'One-paragraph summary of what the business offers; shown above the menu.';