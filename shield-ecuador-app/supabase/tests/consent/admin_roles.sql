-- T04 (SEC-02): `admin_roles` y `has_privacy_role()` de la migración 073, vistos desde los roles `authenticated` y `anon`
-- (es lo que ve `requireRole` al consultar con el JWT del propio usuario). Autoverificable: cualquier aserción que no se
-- cumple lanza una excepción y psql (ON_ERROR_STOP) sale con código != 0. Datos ficticios (@example.test).
\set ON_ERROR_STOP on

CREATE FUNCTION pg_temp.expect_error(stmt text, fragment text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF position(fragment IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'error distinto del esperado para [%]: %', stmt, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'se esperaba un error con "%" al ejecutar [%]', fragment, stmt;
END $$;

INSERT INTO public.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'editora@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'sinrol@example.test');
INSERT INTO public.admin_roles (user_id, role) VALUES ('11111111-1111-4111-8111-111111111111', 'privacy_editor');

-- ── Usuaria con rol privacy_editor ───────────────────────────────────────────────────────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
DO $$ BEGIN
  IF NOT public.has_privacy_role('privacy_editor') THEN RAISE EXCEPTION 'FALLO: la editora no tiene privacy_editor'; END IF;
  IF public.has_privacy_role('privacy_admin') THEN RAISE EXCEPTION 'FALLO: rol insuficiente concedido (privacy_admin)'; END IF;
  IF (SELECT array_agg(role) FROM public.admin_roles) IS DISTINCT FROM ARRAY['privacy_editor'] THEN
    RAISE EXCEPTION 'FALLO: la editora debería ver solo su propia fila';
  END IF;
END $$;
-- Nadie se concede, cambia ni quita roles desde la sesión de usuario (073: REVOKE INSERT, UPDATE, DELETE).
SELECT pg_temp.expect_error($$INSERT INTO public.admin_roles (user_id, role) VALUES ('11111111-1111-4111-8111-111111111111', 'privacy_admin')$$, 'permission denied');
SELECT pg_temp.expect_error($$UPDATE public.admin_roles SET role = 'privacy_admin'$$, 'permission denied');
SELECT pg_temp.expect_error($$DELETE FROM public.admin_roles$$, 'permission denied');

-- ── Usuario sin rol: no ve filas ajenas y no tiene ningún rol ────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
DO $$ BEGIN
  IF public.has_privacy_role('privacy_editor') THEN RAISE EXCEPTION 'FALLO: usuario sin rol tiene privacy_editor'; END IF;
  IF (SELECT count(*) FROM public.admin_roles) <> 0 THEN RAISE EXCEPTION 'FALLO: usuario sin rol ve filas ajenas'; END IF;
END $$;
SELECT pg_temp.expect_error($$INSERT INTO public.admin_roles (user_id, role) VALUES ('22222222-2222-4222-8222-222222222222', 'privacy_admin')$$, 'permission denied');

-- ── Sin sesión (sub vacío) ───────────────────────────────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', '', false);
DO $$ BEGIN
  IF public.has_privacy_role('privacy_editor') THEN RAISE EXCEPTION 'FALLO: sin sesión tiene rol'; END IF;
END $$;
RESET ROLE;

-- ── Rol anon: no ve ninguna fila y no puede escribir ─────────────────────────────────────────────────────────────────
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.admin_roles) <> 0 THEN RAISE EXCEPTION 'FALLO: anon ve filas de admin_roles'; END IF;
END $$;
SELECT pg_temp.expect_error($$INSERT INTO public.admin_roles (user_id, role) VALUES ('22222222-2222-4222-8222-222222222222', 'privacy_admin')$$, 'permission denied');
RESET ROLE;
