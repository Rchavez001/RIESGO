-- Row 16 (/campeonato): user-facing error texts lost their accents and showed English belt keys
-- ("cinturon black"), dates came out as raw UTC timestamps, guests could call register_for_championship
-- directly, and get_my_championship_status returned the opponent's user id, which no screen uses.

CREATE OR REPLACE FUNCTION public.belt_es(p_belt text) RETURNS text
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE p_belt WHEN 'white' THEN 'blanco' WHEN 'yellow' THEN 'amarillo' WHEN 'orange' THEN 'naranja'
    WHEN 'green' THEN 'verde' WHEN 'blue' THEN 'azul' WHEN 'brown' THEN 'marrón' WHEN 'black' THEN 'negro' ELSE p_belt END
$f$;

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
    RAISE EXCEPTION 'Inicia sesión para inscribirte.';
  END IF;
  -- Guests (anonymous sessions) cannot enter: the app hides the page, this keeps the RPC honest too.
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Regístrate con tu cuenta para inscribirte al campeonato.';
  END IF;

  SELECT * INTO champ FROM public.championships WHERE id = p_championship_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campeonato no encontrado.';
  END IF;

  IF champ.status <> 'registration_open' THEN
    RAISE EXCEPTION 'Las inscripciones no están abiertas para este campeonato.';
  END IF;
  IF NOW() < champ.registration_opens_at OR NOW() > champ.registration_closes_at THEN
    RAISE EXCEPTION 'Estamos fuera del período de inscripción (del % al %).',
      to_char(champ.registration_opens_at AT TIME ZONE 'America/Guayaquil', 'DD/MM/YYYY HH24:MI'),
      to_char(champ.registration_closes_at AT TIME ZONE 'America/Guayaquil', 'DD/MM/YYYY HH24:MI');
  END IF;

  IF p_birthdate IS NULL OR p_birthdate > CURRENT_DATE THEN
    RAISE EXCEPTION 'La fecha de nacimiento no es válida.';
  END IF;
  my_age := EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_birthdate))::INT;
  IF my_age > champ.max_age THEN
    RAISE EXCEPTION 'La edad máxima para este campeonato es de % años.', champ.max_age;
  END IF;

  SELECT belt INTO my_belt FROM public.users WHERE id = auth.uid();
  IF my_belt IS DISTINCT FROM champ.min_belt THEN
    RAISE EXCEPTION 'Este campeonato requiere cinturón % (tu cinturón actual: %).', belt_es(champ.min_belt), COALESCE(belt_es(my_belt), 'ninguno');
  END IF;

  INSERT INTO public.championship_registrations (championship_id, user_id, birthdate, belt_at_registration)
  VALUES (p_championship_id, auth.uid(), p_birthdate, my_belt)
  ON CONFLICT (championship_id, user_id) DO NOTHING
  RETURNING id INTO reg_id;

  IF reg_id IS NULL THEN
    RAISE EXCEPTION 'Ya estás inscrito en este campeonato.';
  END IF;

  RETURN reg_id;
END;
$$;

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
    RAISE EXCEPTION 'Inicia sesión.';
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
