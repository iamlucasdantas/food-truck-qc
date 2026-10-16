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
CREATE TRIGGER stops_owner_override AFTER INSERT OR UPDATE OF starts_at, ends_at, cancelled ON public.stops
  FOR EACH ROW EXECUTE FUNCTION public.owner_stop_overrides();

ALTER TABLE public.stops REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stops;