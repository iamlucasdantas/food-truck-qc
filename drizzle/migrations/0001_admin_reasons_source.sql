ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'owner';
CREATE OR REPLACE FUNCTION public.review_claim(_claim_id uuid, _approve boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  PERFORM public.review_claim(_claim_id, _approve);
  IF NOT _approve THEN UPDATE public.claims SET reject_reason = nullif(_reason,'') WHERE id = _claim_id; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.review_claim(uuid, boolean, text) TO authenticated;