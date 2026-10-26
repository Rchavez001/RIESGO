← [[Índice]]

Submódulo del panel admin (pestaña **Centro de Seguridad**). Runbook técnico completo en `README-centro-de-seguridad.md` (raíz del repo) — esta nota es el resumen navegable.

## Fases

1. **Protección pasiva** (RF-01 a RF-04): rate limiting atómico (`check_rate_limit` RPC), hash HMAC de IP (nunca se guarda la IP cruda), logging de eventos. Hoy solo dos endpoints reportan: `secure-register-user` y `login` (ver [[Arquitectura/Autenticación y modo invitado]]).
2. **Panel + alertas** (RF-05 a RF-08): feed filtrable, métricas, umbrales configurables con aviso por correo (Resend, reutiliza la misma clave del [[Módulos/Campeonato|Campeonato]]) o webhook. `check-security-alerts` corre cada 15 min vía pg_cron.
3. **Diagnóstico con IA** (RF-09 a RF-13): `security-diagnose` reutiliza la misma cadena de proveedores del [[Módulos/Agente de noticias|Agente de noticias]] (no una cadena aparte), con su propio prompt. Corre semanal (lunes) + botón manual. Feedback 👍/👎 solo se registra, nunca actúa solo (RNF-11).
4. **EASM + incidente→kata** (RF-14 a RF-20): inventario mensual (buckets públicos vía RPC `list_storage_buckets`, env vars esperadas, endpoints públicos — este último es un allowlist mantenido a mano, no introspección en vivo). Conversión de incidente en kata: `borrador → en_revision → publicado`, cada paso una acción humana explícita; publicar crea una fila real en `questions` (`source_type='incident_kata'`).

## Tablas

`security_events`, `security_rate_limit_hits`, `security_alert_config`, `security_config_audit`, `security_diagnosis_feedback`, `security_diagnoses`, `security_easm_findings`, `security_kata_drafts` — todas bloqueadas a `service_role` (sin acceso `anon`/`authenticated`).

## Limitación conocida

El inventario de "endpoints públicos" no es introspección real (Supabase no expone una API para listar funciones desplegadas desde una edge function) — es una lista (`EXPECTED_PUBLIC_ENDPOINTS`) que hay que actualizar a mano junto con `supabase/config.toml` cada vez que se agregue una función con `verify_jwt = false`.
