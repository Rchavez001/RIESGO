← [[Índice]]

## Piezas del sistema

- **`frontend/`** — la app React que usan los estudiantes (Cloud Run: servicio `cyberdojo`). Servida en producción por `static-server.js` sobre el build de `react-scripts`.
- **`central-admin-app/`** — consola administrativa separada (Cloud Run: servicio `cyberdojo-admin`), Node puro (`server.js`) sin framework. Protegida con **HTTP Basic Auth compartida** (un solo usuario/contraseña para todo el club, `CENTRAL_ADMIN_USER`/`CENTRAL_ADMIN_PASSWORD`), no con Supabase Auth. Ver [[Manual del administrador]].
- **Supabase** (proyecto `wbbcjiqzbzswxsmwjqlw`) — Postgres + Auth + Edge Functions + Storage + Vault + pg_cron. Todas las migraciones en `supabase/migrations/*.sql`, todas las funciones en `supabase/functions/*/index.ts`.

## Cómo se comunican

`central-admin-app` nunca usa el cliente `supabase-js` directo desde el navegador del club: su propio servidor (`server.js`) hace de proxy (`/api/rest/v1/*`, `/api/functions/v1/*`) inyectando la **service role key** — así todas las llamadas del panel bypasean RLS. Ver `proxySupabase()` en `central-admin-app/server.js`.

Las funciones edge que necesitan distinguir "me llamó el panel admin" de "me llamó un usuario real" usan `requireAdminOrScheduler()` (en `supabase/functions/_shared/news-agent-core.ts`): decodifica el JWT y confía en el claim `role: service_role` sin volver a pedir nada, porque ese JWT ya lo verificó el gateway de Supabase.

## Deploy

Ambos servicios se despliegan con `gcloud run deploy <servicio> --source .` desde su carpeta respectiva (sin Dockerfile explícito en frontend — usa Buildpacks; `central-admin-app` sí tiene Dockerfile). La configuración de Supabase (Auth, etc.) se sincroniza con `supabase config push`; las migraciones con `supabase db push`; las funciones con `supabase functions deploy <nombre>`.

## Ver también

- [[Arquitectura/Autenticación y modo invitado]]
- [[Módulos/Centro de Seguridad]]
