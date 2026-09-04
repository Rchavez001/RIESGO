-- Align belt progression with the frontend dojo path and keep dojo points separate
-- from risk assessment scores.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_belt_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_belt_check
  CHECK (belt IN (
    'white',
    'yellow',
    'orange',
    'green',
    'blue',
    'purple',
    'red',
    'black'
  ));

ALTER TABLE public.katas
  DROP CONSTRAINT IF EXISTS katas_required_belt_check;

ALTER TABLE public.katas
  ADD CONSTRAINT katas_required_belt_check
  CHECK (
    required_belt IS NULL
    OR required_belt IN (
      'white',
      'yellow',
      'orange',
      'green',
      'blue',
      'purple',
      'red',
      'black'
    )
  );

COMMENT ON COLUMN public.users.total_points IS
  'Gamification points only. Risk assessment scores are stored in evaluations.total_score.';
