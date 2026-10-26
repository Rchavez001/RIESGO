# Cyber Dojo - Documento maestro para continuidad con IA

Fecha de elaboracion original: 2026-08-27
Fecha de esta reescritura breve: 2026-10-26
Objetivo: dar a quien se incorpore (persona o IA) una orientacion rapida de por donde empezar,
sin repetir el contenido que ya vive, verificado y mantenido, en los documentos especializados de
la raiz de `shield-ecuador-app/`. Uso previsto: capacitacion del club Phycom y continuidad tecnica.

> **Por que este documento cambio de forma:** hasta el 2026-10-26 esta pagina tenia cerca de 900
> lineas que describian el estado del proyecto al 27 de agosto de 2026, con notas puntuales
> agregadas el 23 de septiembre. Gran parte de ese contenido quedo duplicado o contradicho por los
> documentos especializados, que si se mantienen actualizados. Esta version se reescribio breve: en
> vez de describir el sistema otra vez, senala a donde ir para cada tema. El contenido largo
> anterior sigue disponible en el historial de git de este archivo (`git log -- docs/AI_HANDOFF_CYBER_DOJO.md`)
> si se necesita el detalle crudo de la auditoria de agosto-septiembre de 2026.

## 1. Que es Cyber Dojo

Plataforma de entrenamiento en ciberseguridad para MIPYMEs ecuatorianas y usuarios no tecnicos, con
narrativa de dojo/karate: los usuarios responden preguntas, completan katas, suben de cinturon y
reciben apoyo de un Sensei IA. Tres superficies: `frontend/` (React/TypeScript), `supabase/`
(Postgres, RLS, migraciones, Edge Functions) y `central-admin-app/` (consola administrativa Node
que actua como proxy hacia Supabase con la service_role key).

## 2. Mapa de documentacion - a donde ir segun el tema

| Tema | Documento | Donde mirar |
|---|---|---|
| Arquitectura, capas, Edge Functions, paneles admin | `ARQUITECTURA_CYBER_DOJO.md` | Seccion 5 (las 33 Edge Functions y quien las llama) |
| Esquema completo de base de datos, tabla por tabla | `BASE_DE_DATOS.md` | Seccion 12 para el modulo de consentimiento |
| Requisitos funcionales/no funcionales, trazabilidad | `DOCUMENTO_FUNCIONALIDADES.md` | Seccion 2.6 para cumplimiento y privacidad |
| Panel `central-admin-app`, panel por panel | `MANUAL_ADMINISTRADOR.md` | Seccion 14 para el modulo de consentimiento (TOTP, roles) |
| Manual de usuario final, pantalla por pantalla | `MANUAL_USUARIO_CYBER_DOJO.md` | Secciones 14-16 para reconsentimiento, modo invitado y `/privacidad` |
| Seguridad y privacidad, cifrado PII, LOPDP | `SECURITY_PRIVACY.md` | Seccion "Modulo de consentimiento informado (LOPDP)" |
| Levantar el proyecto desde cero | `SETUP.md` (rapido) / `GUIA_LEVANTAMIENTO_PROYECTO.md` (detallado, incluye Cloud Run) | Seccion 9 de la guia detallada para variables del modulo de consentimiento |
| Verificar que la base de datos en Supabase coincide con el repo | `docs/SUPABASE_VERIFICATION_QUERIES.sql` | Ejecutar en el SQL Editor de Supabase |
| Indice general de toda la documentacion | `README.md` (raiz) | Lista todos los `.md` de la raiz, `docs/` y `vault/` |

## 3. Estado verificado hoy (2026-10-26)

- Migraciones: 82 archivos reales en `supabase/migrations/`, de `001` a `084`, con huecos en `023`
  y `033` (no es un rango contiguo).
- Edge Functions: 33 carpetas en `supabase/functions/` (sin contar `_shared`). Detalle de quien
  llama a cada una en `ARQUITECTURA_CYBER_DOJO.md` seccion 5.
- Modulo de consentimiento informado (LOPDP, migraciones `073` a `084`): **implementado, pendiente
  de despliegue**. En produccion solo esta aplicada la migracion `073`; las migraciones
  `074`-`084`, las Edge Functions del modulo, el panel admin nuevo y el frontend con su rediseno
  aun no estan desplegados (decision registrada en `loop-docs/DECISIONS.md`, `DOC-06`; plan de
  release en `loop-consentimiento/PLAN_RELEASE_COMPLETO.md`, rama `feature/consentimiento-lopdp`).

## 4. Reglas que no cambian (seguridad)

- El navegador nunca debe ver `SUPABASE_SERVICE_ROLE_KEY`, claves de IA, `CRON_SECRET` ni las
  claves de cifrado de PII. Esas operaciones viven en Edge Functions o en
  `central-admin-app/server.js` (que si corre en servidor).
- PII se cifra con AES-256-GCM (`SECURITY_PRIVACY.md`, seccion "Criptografia"); las busquedas
  exactas usan HMAC, nunca el valor en claro.
- RLS esta habilitado en las tablas sensibles y administrativas; cualquier operacion privilegiada
  nueva pasa por una Edge Function con service role, no por acceso directo desde el frontend.
- `central-admin-app` protege el panel general con Basic Auth fail-closed; el modulo de
  consentimiento, ademas, exige cuenta individual de Supabase Auth mas un segundo factor TOTP por
  administrador (ver `MANUAL_ADMINISTRADOR.md` seccion 14) - no reutilizar la logica de Basic Auth
  compartida para ese modulo.

## 5. Antes de tocar codigo

1. Leer la fila correspondiente del mapa de la seccion 2.
2. Leer `frontend/src/App.tsx` para las rutas reales (no asumir que esta pagina las tiene
   actualizadas).
3. Leer las migraciones reales de las tablas que se van a tocar antes de confiar en el resumen de
   `BASE_DE_DATOS.md`.
4. Buscar si ya existe una Edge Function para la capacidad deseada antes de crear una nueva.
5. Confirmar RLS y si el dato toca PII.
6. Si el cambio es sensible (PII, privilegios, consentimiento), seguir el patron de RLS + Edge
   Function con service role, resumido en `ARQUITECTURA_CYBER_DOJO.md` seccion 7.

## 6. Historial de este documento

- 2026-08-27: version original (elaboracion inicial, cerca de 900 lineas).
- 2026-09-23: notas puntuales agregadas en varias secciones (conteo de migraciones y Edge
  Functions de esa fecha, resumen de cambios desde agosto).
- 2026-10-26: reescritura breve (este cambio). El contenido detallado de las casi 900 lineas
  anteriores quedo repartido en los documentos especializados listados en la seccion 2; para el
  texto exacto de la version larga, usar `git log -- docs/AI_HANDOFF_CYBER_DOJO.md` sobre este
  archivo.
