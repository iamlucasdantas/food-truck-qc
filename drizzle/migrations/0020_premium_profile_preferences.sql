CREATE TABLE public.profile_settings (
 user_id uuid PRIMARY KEY,
 bio text NOT NULL DEFAULT '',
 home_area text NOT NULL DEFAULT '',
 dietary text[] NOT NULL DEFAULT '{}',
 cuisines text[] NOT NULL DEFAULT '{}',
 notifications jsonb NOT NULL DEFAULT '{}',
 share_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_settings TO authenticated;
GRANT ALL ON public.profile_settings TO service_role;
ALTER TABLE public.profile_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own private preferences" ON public.profile_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TABLE public.profile_trucks (
 user_id uuid NOT NULL,
 truck_id text NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
 list text NOT NULL DEFAULT 'want_to_try' CHECK (list IN ('want_to_try', 'regulars')),
 following boolean NOT NULL DEFAULT false,
 bell boolean NOT NULL DEFAULT true,
 visited_at timestamptz,
 viewed_at timestamptz,
 PRIMARY KEY(user_id, truck_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_trucks TO authenticated;
GRANT ALL ON public.profile_trucks TO service_role;
ALTER TABLE public.profile_trucks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own truck library" ON public.profile_trucks FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE FUNCTION public.shared_foodie_profile(_user_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url, 'bio', s.bio, 'cuisines', s.cuisines, 'member_since', p.created_at)
 FROM public.profiles p JOIN public.profile_settings s ON s.user_id = p.id
 WHERE p.id = _user_id AND s.share_enabled = true;
$$;
REVOKE ALL ON FUNCTION public.shared_foodie_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_foodie_profile(uuid) TO anon, authenticated, service_role;