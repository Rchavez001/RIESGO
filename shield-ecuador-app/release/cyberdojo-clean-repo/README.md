# Cyber Dojo - Repositorio limpio

Este paquete contiene la aplicacion Ciber Dojo lista para trabajar, validar y desplegar.

## Contenido

- `frontend/`: cliente React + TypeScript para usuarios, login, magic link, katas, ranking, scanner, perfil y admin interno.
- `central-admin-app/`: consola administrativa Node/HTML/JS con Basic Auth, proxy Supabase y modulo T-Pot defensivo.
- `supabase/`: migraciones, RLS, funciones Edge y configuracion local.
- `docs/`: handoff tecnico, consultas de verificacion y manuales.
- `.github/workflows/`: workflow Playwright.
- `tests/`: pruebas end-to-end base.

## Documento para auditoria IA

La guia principal para que una IA audite o continue el codigo desde cero esta en:

```text
docs/AUDITORIA_IA_CODIGO_CYBER_DOJO.md
```

Incluye objetivo de la aplicacion, flujo de usuario, login/magic link, registro, funciones del administrador, modelo Supabase, Edge Functions, privacidad, T-Pot, riesgos y checklist de auditoria.

## Archivos excluidos

No se incluyen `.git`, `node_modules`, `build`, `.env`, `supabase/.temp`, logs, zips, credenciales, claves ni configuracion local de proveedores cloud.

## Preparar entorno

```bash
npm install
npm run frontend:install
```

Crear `frontend/.env` desde `frontend/.env.example`:

```env
REACT_APP_SUPABASE_URL=https://wbbcjiqzbzswxsmwjqlw.supabase.co
REACT_APP_SUPABASE_ANON_KEY=PEGAR_ANON_KEY
NODE_ENV=development
```

## Validar

```bash
cd frontend
npx tsc --noEmit
npm run build

cd ../central-admin-app
npm test
```

## Ejecutar local

Frontend desarrollo:

```bash
npm run frontend:dev
```

Frontend build estatico:

```bash
npm run frontend:build
npm run frontend:start
```

Admin central:

```bash
$env:SUPABASE_URL="https://wbbcjiqzbzswxsmwjqlw.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="PEGAR_SERVICE_ROLE_KEY"
$env:CENTRAL_ADMIN_USER="admin"
$env:CENTRAL_ADMIN_PASSWORD="PASSWORD_FUERTE"
npm run admin:start
```

## Supabase

```bash
supabase link --project-ref wbbcjiqzbzswxsmwjqlw
supabase db push
supabase functions deploy secure-register-user
supabase functions deploy get-private-profile
supabase functions deploy calculate-risk
supabase functions deploy complete-kata
supabase functions deploy ask-sensei
supabase functions deploy get-ranking
supabase functions deploy vuln-scanner-ai
```

Magic link requiere en Supabase Auth Redirect URLs:

```text
https://cyberdojo-61855290194.us-central1.run.app/auth/callback
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
```

## Despliegue frontend Cloud Run

```bash
cd frontend
gcloud config set project cool-archery-452216-v7
gcloud run deploy cyberdojo --source . --region us-central1 --allow-unauthenticated
```

## Seguridad

- No publicar `SUPABASE_SERVICE_ROLE_KEY` en frontend.
- Usar SMTP real para magic link.
- Mantener RLS activo.
- Usar `docs/SUPABASE_VERIFICATION_QUERIES.sql` para verificar estructura viva.
