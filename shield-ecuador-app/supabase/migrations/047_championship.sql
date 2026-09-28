-- Championship / "Campeonato" tournament feature.
--
-- Format chosen explicitly over true real-time sync: each match gets a
-- scheduled window (communicated by email); both players independently take
-- their timed 5-question attempt any time within that window, and results
-- are compared once both are done (or the window closes). This avoids
-- needing any live/websocket infrastructure, which does not exist anywhere
-- else in this codebase.
--
-- One row in `championships` represents one edition/season, so history from
-- past tournaments is never overwritten when a new one is configured.

CREATE TABLE IF NOT EXISTS public.championships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'registration_open', 'registration_closed', 'in_progress', 'completed'
  )),
  min_belt TEXT NOT NULL DEFAULT 'black' CHECK (min_belt IN (
    'white', 'yellow', 'orange', 'green', 'blue', 'brown', 'black'
  )),
  max_age INT NOT NULL DEFAULT 18 CHECK (max_age > 0),
  registration_opens_at TIMESTAMPTZ NOT NULL,
  registration_closes_at TIMESTAMPTZ NOT NULL CHECK (registration_closes_at > registration_opens_at),
  questions_per_match INT NOT NULL DEFAULT 5 CHECK (questions_per_match > 0),
  time_limit_easy_seconds INT NOT NULL DEFAULT 60 CHECK (time_limit_easy_seconds > 0),
  time_limit_medium_seconds INT NOT NULL DEFAULT 90 CHECK (time_limit_medium_seconds > 0),
  time_limit_hard_seconds INT NOT NULL DEFAULT 120 CHECK (time_limit_hard_seconds > 0),
  rules_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one championship should ever be actively taking registrations or
-- running at a time — guards against the admin accidentally configuring two
-- overlapping tournaments.
CREATE UNIQUE INDEX IF NOT EXISTS championships_one_active
  ON public.championships ((true))
  WHERE status IN ('registration_open', 'registration_closed', 'in_progress');

CREATE TABLE IF NOT EXISTS public.championship_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  birthdate DATE NOT NULL,
  belt_at_registration TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (championship_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.championship_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  round INT NOT NULL,
  player1_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  player2_id UUID REFERENCES public.users(id) ON DELETE CASCADE, -- NULL = bye (odd participant count), auto-advances
  question_ids TEXT[] NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  window_closes_at TIMESTAMPTZ NOT NULL CHECK (window_closes_at > scheduled_at),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'in_progress', 'completed', 'bye'
  )),
  winner_id UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_championship_matches_round
  ON public.championship_matches(championship_id, round);

CREATE TABLE IF NOT EXISTS public.championship_match_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.championship_matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '[]', -- [{question_id, correct, time_taken_seconds}]
  score INT NOT NULL DEFAULT 0,
  total_time_seconds NUMERIC NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE (match_id, user_id)
);

ALTER TABLE public.championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_match_attempts ENABLE ROW LEVEL SECURITY;

-- Every table here is written exclusively through SECURITY DEFINER RPCs
-- below (register, submit answers) or the service-role admin panel — no
-- direct client INSERT/UPDATE/DELETE path exists, matching how
-- agent_configs/ai_providers are locked down elsewhere in this schema.
REVOKE ALL ON public.championships, public.championship_registrations,
  public.championship_matches, public.championship_match_attempts
  FROM anon, authenticated;

-- Read access: any signed-in student can see the current championship's
-- rules and their own registration/matches/attempts — never anyone else's.
CREATE POLICY "Anyone can view championships" ON public.championships
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users see their own registration" ON public.championship_registrations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users see their own matches" ON public.championship_matches
  FOR SELECT TO authenticated USING (player1_id = auth.uid() OR player2_id = auth.uid());

CREATE POLICY "Users see their own attempts" ON public.championship_match_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins manage championships" ON public.championships
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins view all registrations" ON public.championship_registrations
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins view all matches" ON public.championship_matches
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins view all attempts" ON public.championship_match_attempts
  FOR SELECT TO authenticated USING (public.is_admin());

-- ============================================================
-- RPC: register_for_championship
-- ============================================================
-- Server-side eligibility enforcement — belt, age, and registration window
-- are re-checked here regardless of what the client believes, since a
-- tournament with self-reported eligibility is not a real tournament.
CREATE OR REPLACE FUNCTION public.register_for_championship(p_championship_id UUID, p_birthdate DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champ public.championships%ROWTYPE;
  my_belt TEXT;
  my_age INT;
  reg_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesion para inscribirte.';
  END IF;

  SELECT * INTO champ FROM public.championships WHERE id = p_championship_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campeonato no encontrado.';
  END IF;

  IF champ.status <> 'registration_open' THEN
    RAISE EXCEPTION 'Las inscripciones no estan abiertas para este campeonato.';
  END IF;
  IF NOW() < champ.registration_opens_at OR NOW() > champ.registration_closes_at THEN
    RAISE EXCEPTION 'Estamos fuera de la fecha de inscripcion (% a %).', champ.registration_opens_at, champ.registration_closes_at;
  END IF;

  IF p_birthdate IS NULL OR p_birthdate > CURRENT_DATE THEN
    RAISE EXCEPTION 'Fecha de nacimiento invalida.';
  END IF;
  my_age := EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_birthdate))::INT;
  IF my_age > champ.max_age THEN
    RAISE EXCEPTION 'La edad maxima para este campeonato es % anos.', champ.max_age;
  END IF;

  SELECT belt INTO my_belt FROM public.users WHERE id = auth.uid();
  IF my_belt IS DISTINCT FROM champ.min_belt THEN
    RAISE EXCEPTION 'Este campeonato requiere cinturon % (tu cinturon actual: %).', champ.min_belt, COALESCE(my_belt, 'ninguno');
  END IF;

  INSERT INTO public.championship_registrations (championship_id, user_id, birthdate, belt_at_registration)
  VALUES (p_championship_id, auth.uid(), p_birthdate, my_belt)
  ON CONFLICT (championship_id, user_id) DO NOTHING
  RETURNING id INTO reg_id;

  IF reg_id IS NULL THEN
    RAISE EXCEPTION 'Ya estas inscrito en este campeonato.';
  END IF;

  RETURN reg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_for_championship(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_championship(UUID, DATE) TO authenticated;

-- ============================================================
-- RPC: get_my_championship_status
-- ============================================================
-- One call the student UI uses to render the whole modal: the active
-- championship (if any), whether this user is already registered, and
-- their upcoming/active match (if round 1 has been drawn).
CREATE OR REPLACE FUNCTION public.get_my_championship_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champ public.championships%ROWTYPE;
  reg public.championship_registrations%ROWTYPE;
  my_match JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesion.';
  END IF;

  SELECT * INTO champ FROM public.championships
  WHERE status IN ('registration_open', 'registration_closed', 'in_progress')
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('championship', NULL);
  END IF;

  SELECT * INTO reg FROM public.championship_registrations
  WHERE championship_id = champ.id AND user_id = auth.uid();

  SELECT jsonb_build_object(
    'id', m.id, 'round', m.round, 'scheduled_at', m.scheduled_at,
    'window_closes_at', m.window_closes_at, 'status', m.status,
    'opponent_id', CASE WHEN m.player1_id = auth.uid() THEN m.player2_id ELSE m.player1_id END,
    'is_bye', m.player2_id IS NULL,
    'winner_id', m.winner_id,
    'my_attempt_done', EXISTS (
      SELECT 1 FROM public.championship_match_attempts a
      WHERE a.match_id = m.id AND a.user_id = auth.uid() AND a.finished_at IS NOT NULL
    )
  ) INTO my_match
  FROM public.championship_matches m
  WHERE m.championship_id = champ.id AND (m.player1_id = auth.uid() OR m.player2_id = auth.uid())
  ORDER BY m.round DESC LIMIT 1;

  RETURN jsonb_build_object(
    'championship', jsonb_build_object(
      'id', champ.id, 'name', champ.name, 'status', champ.status,
      'min_belt', champ.min_belt, 'max_age', champ.max_age,
      'registration_opens_at', champ.registration_opens_at,
      'registration_closes_at', champ.registration_closes_at,
      'questions_per_match', champ.questions_per_match,
      'time_limit_easy_seconds', champ.time_limit_easy_seconds,
      'time_limit_medium_seconds', champ.time_limit_medium_seconds,
      'time_limit_hard_seconds', champ.time_limit_hard_seconds,
      'rules_text', champ.rules_text
    ),
    'registered', reg.id IS NOT NULL,
    'my_match', my_match
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_championship_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_championship_status() TO authenticated;
