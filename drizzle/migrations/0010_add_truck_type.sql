ALTER TABLE public.trucks ADD COLUMN truck_type text NOT NULL DEFAULT 'mobile';
ALTER TABLE public.trucks ADD CONSTRAINT trucks_truck_type_check CHECK (truck_type IN ('fixed','mobile')) NOT VALID;
ALTER TABLE public.trucks VALIDATE CONSTRAINT trucks_truck_type_check;