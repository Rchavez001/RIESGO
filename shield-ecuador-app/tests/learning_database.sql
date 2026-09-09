\set ON_ERROR_STOP on
-- Run only in an empty, disposable PostgreSQL database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users(id), belt text DEFAULT 'white', total_points int DEFAULT 0,
  role text DEFAULT 'user', current_risk_level text, last_evaluation_at timestamptz);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT SELECT,UPDATE ON public.users TO authenticated;
\ir ../supabase/migrations/026_learning_progress.sql
CREATE TRIGGER prevent_user_security_field_tampering_trigger BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_user_security_field_tampering();
\ir ../supabase/migrations/027_learning_bank_seed.sql

INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO public.users(id) SELECT id FROM auth.users;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);

DO $$
DECLARE s jsonb; exam jsonb; replay jsonb; q jsonb; d record; i int; a int; previous_points int;
BEGIN
  s := learning_state('passwords');
  ASSERT (s->>'answered')::int=0;
  BEGIN
    PERFORM learning_start_exam('EXAM_BLANCO_AMARILLO');
    RAISE EXCEPTION 'TEST FAILED: exam opened without practice';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Completa las 30%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM learning_state('mentorship');
    RAISE EXCEPTION 'TEST FAILED: higher dojo unlocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Primero completa%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM learning_next('passwords',s->'question'->>'id');
    RAISE EXCEPTION 'TEST FAILED: skipped unanswered question';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Responde primero%' THEN RAISE; END IF;
  END;
  s := learning_answer('passwords',s->'question'->>'id',0);
  replay := learning_answer('passwords',s->'question'->>'id',1);
  ASSERT s=replay, 'Duplicate answer changed progress';
  ASSERT learning_state('passwords')=s, 'Resume lost feedback or question';
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  ASSERT (learning_state('passwords')->>'answered')::int=0, 'Accounts share progress';
  BEGIN
    UPDATE users SET belt='black' WHERE id=auth.uid();
    RAISE EXCEPTION 'TEST FAILED: forged belt';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'El cinturón%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  FOR d IN SELECT * FROM learning_dojos ORDER BY rank LOOP
    s := learning_state(d.id);
    FOR i IN 0..29 LOOP
      q := s->'question';
      -- Intentionally all wrong: answering, not accuracy, unlocks the exam.
      s := learning_answer(d.id,q->>'id',((q->>'correct')::int+1)%4);
      IF i=28 THEN
        BEGIN
          PERFORM learning_start_exam(d.exam_code);
          RAISE EXCEPTION 'TEST FAILED: exam opened after 29 answers';
        EXCEPTION WHEN raise_exception THEN
          IF SQLERRM NOT LIKE 'Completa las 30%' THEN RAISE; END IF;
        END;
      END IF;
      IF i<29 THEN
        s := learning_next(d.id,q->>'id');
        replay := learning_next(d.id,q->>'id');
        ASSERT s=replay, 'Double next skipped a question';
      END IF;
    END LOOP;
    ASSERT (s->>'complete')::boolean;
    exam := learning_start_exam(d.exam_code);
    ASSERT jsonb_array_length(exam->'cases')=5;
    ASSERT NOT (exam->'cases'->0 ? 'correct'), 'Answer leaked before submission';
    ASSERT NOT (exam->'cases'->0 ? 'explanation'), 'Explanation leaked before submission';
    ASSERT NOT (exam->'cases'->0 ? 'feedback_correct'), 'Feedback leaked before submission';
    ASSERT (exam->'cases'->4->>'sublevel')::int=3;
    ASSERT (SELECT count(DISTINCT value->>'family') FROM jsonb_array_elements(exam->'cases'))=5;
    ASSERT learning_start_exam(d.exam_code)=exam, 'Reload changed exam';
    IF d.rank=0 THEN
      FOR i IN 0..4 LOOP
        SELECT content INTO q FROM learning_items WHERE id=exam->'cases'->i->>'id';
        a := CASE WHEN i<3 THEN (q->>'correct')::int ELSE ((q->>'correct')::int+1)%4 END;
        exam := learning_exam_answer((exam->>'id')::uuid,q->>'id',a);
      END LOOP;
      ASSERT NOT (exam->>'passed')::boolean AND (exam->>'score')::int=3, '3/5 passed';
      ASSERT (SELECT belt='white' AND total_points=0 FROM users WHERE id=auth.uid());
      replay := learning_start_exam(d.exam_code,true);
      ASSERT replay->>'id'<>exam->>'id';
      ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(replay->'cases') r JOIN jsonb_array_elements(exam->'cases') e ON r->>'id'=e->>'id'), 'Retry reused seen cases while unused cases exist';
      exam := replay;
    END IF;
    SELECT total_points INTO previous_points FROM users WHERE id=auth.uid();
    FOR i IN 0..4 LOOP
      SELECT content INTO q FROM learning_items WHERE id=exam->'cases'->i->>'id';
      a := CASE WHEN i<4 THEN (q->>'correct')::int ELSE ((q->>'correct')::int+1)%4 END;
      exam := learning_exam_answer((exam->>'id')::uuid,q->>'id',a);
    END LOOP;
    ASSERT (exam->>'passed')::boolean AND (exam->>'score')::int=4, '4/5 did not pass';
    ASSERT exam->'cases'->4 ? 'explanation', 'Last explanation absent';
    ASSERT (SELECT total_points=previous_points+250 FROM users WHERE id=auth.uid()), 'Points not awarded once';
    replay := learning_exam_answer((exam->>'id')::uuid,q->>'id',a);
    ASSERT replay=exam;
    ASSERT (SELECT total_points=previous_points+250 FROM users WHERE id=auth.uid()), 'Duplicate request awarded points';
    ASSERT (SELECT belt=(SELECT db_belt FROM learning_dojos WHERE rank=least(6,d.rank+1)) FROM users WHERE id=auth.uid()), 'Wrong belt';
    PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
    BEGIN
      PERFORM learning_exam_view((exam->>'id')::uuid);
      RAISE EXCEPTION 'TEST FAILED: account read another exam';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  END LOOP;
  PERFORM learning_start_exam('EXAM_BLANCO_AMARILLO',true);
  ASSERT (SELECT belt='black' AND total_points=1750 FROM users WHERE id=auth.uid()), 'Review demoted learner';
END $$;

SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM * FROM learning_items; RAISE EXCEPTION 'TEST FAILED: private bank readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE learning_progress SET cursor=29; RAISE EXCEPTION 'TEST FAILED: progress forgeable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM learning_overview();
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM learning_overview(); RAISE EXCEPTION 'TEST FAILED: anonymous access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: prerequisites, resume, account isolation, five cases, retries, 3/5 fail, 4/5 pass, seven belts, idempotency, private bank' AS result;
