-- Collapse the Purple (morado) and Red (rojo) belts into a single Brown (marron) belt,
-- matching the standard 7-belt kyu-to-dan karate path used by the frontend:
-- blanco -> amarillo -> naranja -> verde -> azul -> marron -> negro.
-- No production users hold 'purple' or 'red' yet, so this migrates forward safely.
-- Data is fixed up BEFORE each stricter CHECK constraint is added, so no existing row
-- can violate the new constraint mid-migration.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_belt_check;

UPDATE public.users SET belt = 'brown' WHERE belt IN ('purple', 'red');

ALTER TABLE public.users
  ADD CONSTRAINT users_belt_check
  CHECK (belt IN (
    'white',
    'yellow',
    'orange',
    'green',
    'blue',
    'brown',
    'black'
  ));

ALTER TABLE public.katas
  DROP CONSTRAINT IF EXISTS katas_required_belt_check;

-- Rename the azul -> marron promotion exam. Content is still valid, still gated behind 'blue'.
UPDATE public.katas
SET kata_code = 'EXAM_AZUL_MARRON',
    name = 'Examen para subir a cinturon marron',
    description = 'Valida criterio para ransomware, reportes, evidencias y proteccion de respaldos.'
WHERE kata_code = 'EXAM_AZUL_MORADO';

-- Merge the two retired exams (morado->rojo, rojo->negro) into a single marron->negro exam.
-- Every question from both is kept (steps arrays concatenated) so no authored content is lost.
UPDATE public.katas AS negro_exam
SET kata_code = 'EXAM_MARRON_NEGRO',
    name = 'Examen para subir a cinturon negro',
    description = 'Valida decisiones en incidentes de negocio y criterio integral para prevenir, responder, reportar y enseñar ciberseguridad a otros.',
    teaching = 'Un buen lider digital protege personas, datos y evidencia, y ayuda a otros a decidir con claridad.',
    estimated_minutes = 38,
    required_belt = 'brown',
    points_reward = 1350,
    steps = morado_rojo.steps || negro_exam.steps
FROM (SELECT steps FROM public.katas WHERE kata_code = 'EXAM_MORADO_ROJO') AS morado_rojo
WHERE negro_exam.kata_code = 'EXAM_ROJO_NEGRO';

-- Its content now lives inside EXAM_MARRON_NEGRO; retire the old row instead of deleting it.
-- required_belt is cleared to keep it out of the way of the new constraint below.
UPDATE public.katas
SET active = FALSE,
    required_belt = 'brown'
WHERE kata_code = 'EXAM_MORADO_ROJO';

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
      'brown',
      'black'
    )
  );
