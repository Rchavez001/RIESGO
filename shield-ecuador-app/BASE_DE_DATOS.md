# Base de Datos - Ciber Dojo

Documento generado a partir de la lectura completa y verificada de las 21 migraciones en `supabase/migrations/001_initial_schema.sql` a `021_campaign_impressions_sector.sql`. Cada tabla, columna, política RLS, vista y función aquí listada existe literalmente en esas migraciones (se cita el número de migración de origen entre corchetes). No se incluye nada no verificado en el código fuente.

Motor: PostgreSQL (Supabase). Extensiones usadas: `uuid-ossp`, `pgcrypto` [001].

## Índice

1. Tablas de usuarios y evaluación
2. Tablas de entrenamiento (katas, dojos, preguntas)
3. Tablas de alertas y patrocinadores
4. Tablas de IA / agentes
5. Tablas de administración central (campañas, sectores)
6. Tablas de integración T-Pot (honeypot)
7. Tablas de seguridad/auditoría
8. Vistas
9. Funciones
10. Hallazgos sobre RLS (tablas sin política de escritura o sin RLS)
11. Diagrama entidad-relación
12. Módulo de Consentimiento Informado (LOPDP)

---

## 1. Tablas de usuarios y evaluación

### `users` [001, alterada en 004, 012, 014, 020]

Columnas:
- `id UUID PK DEFAULT gen_random_uuid()`
- `email TEXT UNIQUE NOT NULL`
- `phone TEXT`
- `full_name TEXT`
- `business_type TEXT` — el CHECK original de 001 (`pescador, agricultor, comerciante, restaurante, ferreteria, farmacia, otro`) fue eliminado en la migración 016 al introducir el catálogo `business_sectors`; ahora se valida a nivel de aplicación (Edge Function `secure-register-user`) contra `business_sectors`.
- `belt TEXT DEFAULT 'white'` — CHECK evolucionó en 3 pasos: 001 = `white,yellow,orange,green,brown,black`; 015 lo reemplazó por `white,yellow,orange,green,blue,purple,red,black`; 017 lo corrigió a la versión final vigente: `white,yellow,orange,green,blue,brown,black` (fusionó `purple`/`red` en `brown`).
- `total_points INT DEFAULT 0` — puntos de gamificación únicamente; comentario agregado en 015 aclarando que el puntaje de riesgo vive en `evaluations.total_score`, no aquí.
- `current_risk_level TEXT` CHECK (`bajo,medio,alto,critico`)
- `location_city TEXT`, `location_province TEXT`
- `created_at`, `updated_at TIMESTAMPTZ DEFAULT NOW()` (trigger `update_users_updated_at` [001])
- `last_evaluation_at TIMESTAMPTZ`
- `onboarding_completed BOOLEAN DEFAULT FALSE`
- `role TEXT NOT NULL DEFAULT 'user'` CHECK (`user,admin,analyst`) [004]
- `email_encrypted JSONB`, `full_name_encrypted JSONB`, `phone_encrypted JSONB`, `location_city_encrypted JSONB`, `location_province_encrypted JSONB` [012] — cifrado AES-256-GCM, ver `SECURITY_PRIVACY.md`
- `email_lookup_hmac TEXT` [012] (indexado, búsqueda exacta por HMAC-SHA-256)
- `pii_key_version INTEGER DEFAULT 1` [012]
- `pii_encrypted_at TIMESTAMPTZ` [012]
- `pii_migration_status TEXT NOT NULL DEFAULT 'pending'` [012] (indexado)
- `data_processing_authorized BOOLEAN NOT NULL DEFAULT false` [012]
- `data_processing_authorized_at TIMESTAMPTZ` [012]
- `privacy_notice_version TEXT NOT NULL DEFAULT '2026-06-22'` [012]
- `privacy_updated_at TIMESTAMPTZ` [012]
- `email_domain TEXT` [014] (indexado; usado para excluir proveedores públicos del ranking)
- `sector TEXT` [020] — snapshot de `business_sectors.industry` al momento del registro; `NULL` significa "coincide con todos los sectores" (usado deliberadamente para cuentas legado/prueba)

Triggers: `update_users_updated_at` [001]; `prevent_user_security_field_tampering_trigger` [005] — bloquea que un usuario autenticado (no admin, no service_role) cambie `role`, `belt`, `current_risk_level` o `last_evaluation_at` vía UPDATE directo, y fuerza `role='user'` en cualquier INSERT hecho por el propio cliente.

RLS: habilitado [002]. Políticas: usuario ve/edita/inserta su propio perfil (`auth.uid() = id`) [002]; admin puede ver todos los usuarios y actualizar usuarios (`is_admin()`) [004].

### `evaluations` [001]

Historial de evaluaciones de riesgo.

- `id UUID PK`
- `user_id UUID FK -> users(id) ON DELETE CASCADE`
- `evaluation_date TIMESTAMPTZ DEFAULT NOW()`
- `total_score INT NOT NULL` — puntaje de riesgo (no confundir con `users.total_points`)
- `risk_level TEXT NOT NULL`
- `belt_awarded TEXT`
- `vector_scores JSONB`
- `responses JSONB NOT NULL`
- `prompt_version TEXT`, `ai_used TEXT`, `ai_response_time_ms INT`
- `completed BOOLEAN DEFAULT TRUE`

Índices: `idx_evaluations_user(user_id)`, `idx_evaluations_date(evaluation_date DESC)`.

RLS: habilitado [002]. Usuario ve/inserta sus propias evaluaciones [002]; admin ve todas [004].

### `questions` [001, alterada en 004, 007, 011, actualizada en 013]

Banco de preguntas del cuestionario adaptativo y de los dojos.

- `id TEXT PK`
- `branch TEXT NOT NULL` — identificador de rama/dojo
- `order_num INT`
- `iso_control TEXT`
- `question_text TEXT NOT NULL`
- `question_type TEXT` CHECK (`unica_opcion, multiple_opcion, escenario`)
- `options JSONB NOT NULL`
- `conditional_logic JSONB`
- `active BOOLEAN DEFAULT TRUE`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `source_type TEXT NOT NULL DEFAULT 'manual'` CHECK (`manual, incident_investigation, audited_generated`) [004]
- `generated_from_incident_id UUID` [004]
- `generation_prompt_version TEXT` [004]
- `audit_status TEXT NOT NULL DEFAULT 'approved'` CHECK (`pending, approved, rejected`) [004]
- `audit_notes TEXT`, `reviewed_at TIMESTAMPTZ` [004]
- `dojo_id TEXT FK -> cyber_dojos(id) ON DELETE SET NULL` [007]
- `difficulty INT` CHECK (1-5) [007]
- `kata_label TEXT` [007]
- `answer_text TEXT`, `explanation TEXT` [007]
- `editable BOOLEAN NOT NULL DEFAULT TRUE` [007]
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` [007] (trigger `touch_questions_updated_at`)
- `audit_provider TEXT`, `audit_model TEXT` [011]
- `audit_replaced_content BOOLEAN DEFAULT false` [011]
- `audit_original_payload JSONB`, `audit_corrected_payload JSONB` [011]
- `audit_reviewed_at TIMESTAMPTZ` [011]

Nota de contenido: la migración 013 (`010_plain_language_portal_text.sql` según el nombre de archivo, pero versionada como aplicada antes de 011 en el repo) reescribió en texto plano términos técnicos (MFA→"verificación en dos pasos", phishing→"mensaje falso para robar datos", etc.) en `question_text`, `answer_text`, `explanation` y `options` para simplificar el lenguaje a usuarios no técnicos.

Índices: `idx_questions_branch(branch)` [001]; `idx_questions_dojo_order(dojo_id, source_type, order_num)`, `idx_questions_audit_status(audit_status)` [007].

RLS: habilitado [002]. Público ve preguntas activas [002]; admin ve todas, inserta y actualiza [004].

### `katas` [001, sembrada en 003 y 009, renombrada en 017]

Simulaciones prácticas y exámenes de cinturón (mismo modelo de datos para ambos).

- `id UUID PK`
- `kata_code TEXT UNIQUE NOT NULL`
- `name TEXT NOT NULL`
- `description TEXT`, `teaching TEXT`
- `estimated_minutes INT`
- `required_belt TEXT` — CHECK alineado al mismo path de `users.belt` (ver 015/017 arriba)
- `points_reward INT DEFAULT 100`
- `steps JSONB` — para exámenes de cinturón (sembrados en 009) contiene un arreglo de preguntas de opción múltiple con `question, term, term_explanation, options, correct, explanation`
- `verification_type TEXT` CHECK (`manual, automatic, self_report`)
- `active BOOLEAN DEFAULT TRUE`

La migración 017 fusionó los exámenes `EXAM_MORADO_ROJO` y `EXAM_ROJO_NEGRO` (creados en 009 bajo el path de 8 cinturones) en un único `EXAM_MARRON_NEGRO`, concatenando el contenido de ambos (`steps`) para no perder preguntas ya redactadas, y renombró `EXAM_AZUL_MORADO` a `EXAM_AZUL_MARRON`. El registro `EXAM_MORADO_ROJO` original quedó con `active = FALSE` en vez de borrarse.

RLS: habilitado [002]. Único policy encontrado: público ve katas activas (`active = TRUE`) [002]. **No se encontró una política de administración (INSERT/UPDATE/DELETE) para `katas` en ninguna de las 21 migraciones** — ver sección 10.

### `kata_completions` [001]

- `id UUID PK`
- `user_id UUID FK -> users(id) ON DELETE CASCADE`
- `kata_id UUID FK -> katas(id) ON DELETE CASCADE`
- `completed_at TIMESTAMPTZ DEFAULT NOW()`
- `verification_data JSONB`
- `points_earned INT`
- `UNIQUE(user_id, kata_id)` — un usuario completa cada kata una sola vez

Índice: `idx_kata_completions_user(user_id)`.

RLS: habilitado [002]. Usuario ve/inserta sus propias completaciones [002]; admin ve todas [004].

---

## 2. Tablas de alertas y patrocinadores

### `email_analysis` [001]

- `id UUID PK`
- `user_id UUID FK -> users(id) ON DELETE CASCADE`
- `analyzed_at TIMESTAMPTZ DEFAULT NOW()`
- `sender_domain TEXT`, `sender_display_name TEXT`
- `spf_pass BOOLEAN`, `dkim_pass BOOLEAN`, `dmarc_pass BOOLEAN`
- `typosquatting_detected BOOLEAN DEFAULT FALSE`
- `urls_count INT DEFAULT 0`, `malicious_urls_count INT DEFAULT 0`
- `verdict TEXT` CHECK (`seguro, sospechoso, peligroso`)
- `threat_type TEXT`
- `confidence_score DECIMAL(3,2)`

Índices: `idx_email_analysis_user`, `idx_email_analysis_verdict`.

RLS: habilitado [002]. Usuario ve/inserta sus propios análisis [002]. **No se encontró política admin explícita para esta tabla.**

### `domains_whitelist` [001]

- `id UUID PK`, `entity_name TEXT NOT NULL`, `domains TEXT[] NOT NULL`
- `entity_type TEXT` CHECK (`banco, gobierno, proveedor, otro`)
- `active BOOLEAN DEFAULT TRUE`, `added_at TIMESTAMPTZ DEFAULT NOW()`

Sembrada en 003 con 6 bancos ecuatorianos y 5 entidades de gobierno (SRI, EcuCERT, Superintendencia de Bancos, Registro Civil, Ministerio de Telecomunicaciones).

RLS: habilitado [002]. Único policy: público ve dominios activos [002]. **No se encontró política de escritura (admin) en ninguna migración.**

### `alerts` [001, alterada en 004]

- `id UUID PK`
- `title TEXT NOT NULL`, `description TEXT NOT NULL`
- `threat_type TEXT NOT NULL`
- `severity TEXT` CHECK (`baja, media, alta, critica`)
- `source TEXT`, `source_url TEXT`
- `target_business_types TEXT[]`, `target_banks TEXT[]`
- `published_at TIMESTAMPTZ DEFAULT NOW()`, `expires_at TIMESTAMPTZ`
- `approved_by UUID FK -> users(id)`
- `active BOOLEAN DEFAULT TRUE`
- `related_question_ids TEXT[] DEFAULT '{}'`, `related_incident_id UUID`, `source_agent TEXT` [004]

Índices: `idx_alerts_active`, `idx_alerts_severity`.

Sembrada en 003 con 2 alertas de ejemplo (phishing bancario, fraude WhatsApp).

RLS: habilitado [002]. Público ve alertas activas [002]; admin gestiona todas (`FOR ALL`) [004].

### `alert_deliveries` [001]

- `id UUID PK`
- `alert_id UUID FK -> alerts(id) ON DELETE CASCADE`
- `user_id UUID FK -> users(id) ON DELETE CASCADE`
- `delivered_at TIMESTAMPTZ DEFAULT NOW()`, `opened_at TIMESTAMPTZ`
- `action_taken TEXT`
- `UNIQUE(alert_id, user_id)`

RLS: habilitado [002]. Usuario ve/inserta sus propias entregas [002]. Según `DOCUMENTO_FUNCIONALIDADES.md` (revisado en este mismo trabajo de auditoría), esta tabla existe en el esquema pero no se encontraron pantallas del frontend que la usen activamente — confirmar contra el inventario de pantallas antes de darlo por definitivo.

### `sponsors` [001]

- `id UUID PK`, `business_name TEXT NOT NULL`
- `sponsor_type TEXT` CHECK (`banco, antivirus, tecnico, aseguradora, otro`)
- `coverage_provinces TEXT[]`, `services JSONB`
- `subscription_tier TEXT`, `monthly_fee DECIMAL(10,2)`
- `matching_rules JSONB`, `active BOOLEAN DEFAULT TRUE`
- `contact_email TEXT`, `contact_phone TEXT`

**RLS no aparece habilitado para esta tabla en ninguna de las 21 migraciones** (no está en la lista de `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` de 002 ni se habilita después). Ver sección 10.

---

## 3. Tablas de IA / agentes

### `ai_configs` [001]

- `id UUID PK`, `config_name TEXT UNIQUE NOT NULL`
- `primary_ai TEXT NOT NULL`, `primary_timeout_ms INT DEFAULT 8000`
- `fallback_ai TEXT`, `fallback_timeout_ms INT DEFAULT 5000`
- `tertiary_ai TEXT`
- `temperature DECIMAL(3,2) DEFAULT 0.10`, `max_tokens INT DEFAULT 500`
- `prompt_version TEXT`, `active BOOLEAN DEFAULT TRUE`, `updated_at TIMESTAMPTZ DEFAULT NOW()` (trigger `update_ai_configs_updated_at`)

Sembrada en 003 con una única fila `default`: primaria DeepSeek (8000ms), fallback Kimi (5000ms), terciaria Claude.

**RLS no aparece habilitado para esta tabla.** Ver sección 10.

### `recommendations_cache` [001]

- `id UUID PK`, `query_hash TEXT UNIQUE NOT NULL`
- `risk_profile JSONB NOT NULL`, `recommendation_text TEXT NOT NULL`
- `ai_used TEXT`, `created_at TIMESTAMPTZ DEFAULT NOW()`
- `hit_count INT DEFAULT 0`, `last_hit_at TIMESTAMPTZ`

Índice: `idx_recommendations_hash`.

**RLS no aparece habilitado para esta tabla.** Ver sección 10.

### `ai_providers` [004]

- `provider_key TEXT PK`, `label TEXT NOT NULL`
- `provider_type TEXT NOT NULL`, `model_name TEXT NOT NULL`
- `purpose TEXT`, `active BOOLEAN DEFAULT TRUE`, `created_at TIMESTAMPTZ DEFAULT NOW()`

Sembrada en 004 con 3 proveedores: `deepseek` (deepseek-chat), `kimi` (moonshot-v1-8k), `claude` (claude-haiku-4-5-20251001).

RLS: habilitado [004]. Admin gestiona todo (`FOR ALL`) [004].

### `agent_configs` [004, CHECK extendido en 007 y 011]

- `id UUID PK`
- `agent_code TEXT UNIQUE NOT NULL` — CHECK evolucionó: 004 solo permitía `incident-investigator, question-auditor`; 007 agregó `ciber-dojo-news-agent`; 011 agregó `sensei-question-auditor` (valor final: los 4 códigos)
- `name TEXT NOT NULL`, `description TEXT`
- `enabled BOOLEAN DEFAULT TRUE`
- `trigger_time TIME NOT NULL DEFAULT '07:00:00'`, `timezone TEXT NOT NULL DEFAULT 'America/Guayaquil'`
- `prompt_template TEXT NOT NULL`
- `investigation_window_days INT DEFAULT 1`
- `last_run_at TIMESTAMPTZ`
- `extra_settings JSONB DEFAULT '{}'`
- `created_at`, `updated_at TIMESTAMPTZ` (trigger `update_agent_configs_updated_at`)

Los 4 agentes configurados por seed:
1. `incident-investigator` [004, prompt actualizado en 006] — investiga incidentes del día anterior, genera hasta 10 preguntas.
2. `question-auditor` [004, prompt actualizado en 006] — audita preguntas generadas.
3. `ciber-dojo-news-agent` [007] — busca noticias en `cyber_news_sources`, genera hasta 10 preguntas y 5 katas por ejecución, requiere revisión admin.
4. `sensei-question-auditor` [011] — valida/corrige en tiempo real las respuestas del Sensei antes de mostrarlas al usuario, timeout 12000ms, temperatura 0.1, max 1200 tokens.

RLS: habilitado [004]. Admin gestiona todo [004].

### `agent_provider_assignments` [004]

- `id UUID PK`
- `agent_config_id UUID FK -> agent_configs(id) ON DELETE CASCADE`
- `provider_key TEXT FK -> ai_providers(provider_key) ON DELETE CASCADE`
- `priority INT DEFAULT 1`, `active BOOLEAN DEFAULT TRUE`
- `UNIQUE(agent_config_id, provider_key)`

Define, por agente, el orden de fallback entre proveedores de IA (ej. `incident-investigator`: deepseek→kimi→claude; `question-auditor`: claude→deepseek; `sensei-question-auditor`: claude→deepseek→kimi).

RLS: habilitado [004]. Admin gestiona todo [004].

### `incident_investigations` [004]

- `id UUID PK`, `incident_date DATE NOT NULL`
- `title TEXT NOT NULL`, `summary TEXT NOT NULL`
- `severity TEXT NOT NULL` CHECK (`baja, media, alta, critica`)
- `source_name TEXT`, `source_url TEXT`
- `ai_provider_key TEXT FK -> ai_providers(provider_key)`
- `raw_payload JSONB`
- `generated_question_ids TEXT[] DEFAULT '{}'`
- `status TEXT NOT NULL DEFAULT 'detectado'` CHECK (`detectado, preguntas_generadas, auditado, descartado`)
- `created_at TIMESTAMPTZ DEFAULT NOW()`

Índices: `idx_incident_investigations_date`, `idx_incident_investigations_severity`.

RLS: habilitado [004]. Admin gestiona todo [004].

### `agent_runs` [004]

- `id UUID PK`
- `agent_config_id UUID FK -> agent_configs(id) ON DELETE CASCADE`
- `run_date DATE NOT NULL DEFAULT CURRENT_DATE`
- `started_at TIMESTAMPTZ DEFAULT NOW()`, `finished_at TIMESTAMPTZ`
- `status TEXT NOT NULL DEFAULT 'running'` CHECK (`running, completed, failed`)
- `summary TEXT`, `input_payload JSONB`, `output_payload JSONB`
- `triggered_by TEXT DEFAULT 'system'`, `error_message TEXT`

Índice: `idx_agent_runs_agent_date`.

RLS: habilitado [004]. Admin gestiona todo [004].

---

## 4. Tablas de administración central: dojos, campañas, sectores

### `cyber_dojos` [007]

- `id TEXT PK`, `name TEXT NOT NULL`, `theme TEXT NOT NULL`
- `iso_control TEXT`
- `status TEXT NOT NULL DEFAULT 'draft'` CHECK (`active, draft, paused, archived`)
- `manual_question_target INT NOT NULL DEFAULT 20`, `ai_question_target INT NOT NULL DEFAULT 30`
- `display_order INT NOT NULL DEFAULT 100`
- `metadata JSONB DEFAULT '{}'`
- `created_at`, `updated_at TIMESTAMPTZ` (trigger `touch_cyber_dojos_updated_at`)

Índice: `idx_cyber_dojos_status_order`.

Sembrados 3 dojos en 007: `dojo-phishing` (activo), `dojo-passwords` (activo), `dojo-backups` (borrador) — cada uno con objetivo de 20 preguntas manuales + 30 IA.

RLS: habilitado [007]. Público ve dojos activos (`status='active'`); admin gestiona todo.

### `cyber_dojo_wisdom_quotes` [007]

- `id UUID PK`, `source_title TEXT NOT NULL`, `source_file TEXT`
- `quote_text TEXT NOT NULL`, `cyber_application TEXT NOT NULL`
- `tags TEXT[] DEFAULT '{}'`
- `active BOOLEAN DEFAULT TRUE`, `display_weight INT DEFAULT 1`
- `created_at`, `updated_at TIMESTAMPTZ`

Sembradas 5 frases (3 de "El arte de la guerra" - Sun Tzu, 2 de "Bushido - El Código del Samurái") con su aplicación a ciberseguridad, referenciando archivos reales en `frases/`.

RLS: habilitado [007]. Público ve frases activas; admin gestiona todo.

### `cyber_news_sources` [007]

- `id UUID PK`, `name TEXT NOT NULL`, `url TEXT NOT NULL UNIQUE`
- `source_type TEXT DEFAULT 'web'` CHECK (`web, rss, api`)
- `enabled BOOLEAN DEFAULT TRUE`, `priority INT DEFAULT 100`, `notes TEXT`

Sembradas 4 fuentes: CISA Cybersecurity Advisories, BleepingComputer, The Hacker News, EcuCERT.

RLS: habilitado [007]. **Solo tiene política de administración** (`Admins can manage cyber news sources`, `FOR ALL`) — no hay política pública de lectura, coherente con ser una tabla de configuración interna del agente de noticias.

### `cyber_dojo_generated_katas` [007]

- `id UUID PK`
- `dojo_id TEXT FK -> cyber_dojos(id) ON DELETE SET NULL`
- `incident_investigation_id UUID FK -> incident_investigations(id) ON DELETE SET NULL`
- `source_url TEXT`, `title TEXT NOT NULL`, `scenario TEXT NOT NULL`, `task TEXT NOT NULL`
- `difficulty INT NOT NULL DEFAULT 1` CHECK (1-5)
- `status TEXT NOT NULL DEFAULT 'draft'` CHECK (`draft, approved, rejected, published`)
- `published_kata_id UUID FK -> katas(id) ON DELETE SET NULL`
- `created_by_agent_run_id UUID FK -> agent_runs(id) ON DELETE SET NULL`
- `audit_notes TEXT`, `metadata JSONB DEFAULT '{}'`
- `created_at`, `updated_at TIMESTAMPTZ`

Katas propuestas por el agente de noticias, pendientes de revisión admin antes de publicarse como fila real en `katas` (vía función `publish_generated_kata`, sección 9).

RLS: habilitado [007]. Público ve solo las publicadas (`status='published'`); admin gestiona todo.

### `central_admin_campaigns` [007, alterada en 018 y 020]

Popups publicitarios/informativos mostrados a los usuarios.

- `id UUID PK`, `name TEXT NOT NULL`
- `moment TEXT NOT NULL DEFAULT 'inicio'` CHECK (`inicio, sesion, salida`) [007]
- `duration_seconds INT NOT NULL DEFAULT 10` [007]
- `validity_type TEXT NOT NULL DEFAULT 'indefinido'` CHECK (`sesiones, meses, indefinido`) [007]
- `validity_value INT` [007]
- `message TEXT NOT NULL` [007]
- `active BOOLEAN NOT NULL DEFAULT TRUE` [007] — mantenido sincronizado automáticamente por trigger tras 018 (ver abajo)
- `starts_at TIMESTAMPTZ`, `ends_at TIMESTAMPTZ` [007]
- `created_at`, `updated_at TIMESTAMPTZ` [007]
- `image_url TEXT`, `link_url TEXT` [018]
- `status TEXT NOT NULL DEFAULT 'activa'` CHECK (`activa, suspendida, eliminada`) [018] — reemplaza a `active` como fuente de verdad; el trigger `sync_campaign_active_from_status` [018] mantiene `active = (status = 'activa')` para lectores legado
- `target_all BOOLEAN NOT NULL DEFAULT TRUE` [020]
- `target_sectors TEXT[] NOT NULL DEFAULT '{}'` [020]

Las 2 campañas de ejemplo sembradas en 007 (`Plan de soporte MFA`, `Curso anti-phishing`) fueron eliminadas explícitamente por la migración 018 (`DELETE ... WHERE name IN (...)`), por lo que **no hay campañas de ejemplo/demo activas en el esquema actual** — cualquier campaña presente en producción fue creada desde el panel admin.

RLS: habilitado [007]. Política de lectura evolucionó dos veces: 007 (activa + vigencia por fecha) → 018 (mismo criterio, ahora sobre `status='activa'`) → 020, versión final: `status='activa'` + vigencia por fecha + coincidencia de sector (`target_all=TRUE` O el sector del usuario está en `target_sectors`, con `sector IS NULL` del usuario tratado como comodín). Admin gestiona todo (`FOR ALL`) [007].

### `central_admin_campaign_settings` [018]

Tabla de una sola fila (`id SMALLINT PK DEFAULT 1 CHECK (id=1)`) con la política de validación de imágenes:
- `max_image_kb INT NOT NULL DEFAULT 500`
- `max_image_width INT NOT NULL DEFAULT 1920`, `max_image_height INT NOT NULL DEFAULT 1920`
- `updated_by TEXT`, `updated_at TIMESTAMPTZ DEFAULT now()`

RLS: habilitado [018]. Solo admin (`FOR ALL`).

### `central_admin_campaign_audit` [018]

Bitácora de quién/cuándo creó o cambió una campaña.

- `id UUID PK`
- `campaign_id UUID FK -> central_admin_campaigns(id) ON DELETE SET NULL`
- `actor TEXT NOT NULL`
- `action TEXT NOT NULL` CHECK (`creada, actualizada, estado_cambiado`)
- `details JSONB DEFAULT '{}'`, `created_at TIMESTAMPTZ DEFAULT now()`

Índice: `idx_central_admin_campaign_audit_campaign`.

RLS: habilitado [018]. Admin puede leer (`FOR SELECT`); solo `service_role` puede insertar.

Storage: bucket público `campaign-ads` creado en 018 (`storage.buckets`) para alojar las imágenes subidas.

### `business_sectors` [016, alterada en 019]

Catálogo administrable de sectores/ocupaciones usado en el registro de usuarios.

- `code TEXT PK` CHECK (regex `^[a-z0-9_]{2,40}$`)
- `label TEXT NOT NULL` CHECK (`length(trim(label)) >= 2`)
- `active BOOLEAN NOT NULL DEFAULT TRUE`
- `display_order INT NOT NULL DEFAULT 100`
- `created_at`, `updated_at TIMESTAMPTZ` (trigger `touch_business_sectors_updated_at`)
- `industry TEXT` [019] — agrupador de industria (ej. "Tecnologia de la Informacion", "Salud")

Historia de contenido: 016 sembró 7 categorías genéricas (comerciante, restaurante, ferreteria, farmacia, agricultor, pescador, otro). La migración 019 las reemplazó por un catálogo real de ~79 ocupaciones ecuatorianas agrupadas en 14 industrias (Administración/Finanzas, Agropecuario y Pesca, Comercio y Ventas, Comunicación/Marketing/Artes, Construcción, Educación, Hogar/Cuidados, Hostelería/Turismo, Ingeniería/Manufactura, Legal, Salud, Seguridad/Defensa, Tecnología de la Información, Transporte/Logística), desactivando (`active=FALSE`, no borrando) las 3 categorías genéricas que no mapean 1:1 a una ocupación real (`restaurante`, `ferreteria`, `farmacia`; `comerciante`, `agricultor`, `pescador` y `otro` se mantuvieron activas y ahora también existen como ocupaciones específicas con el mismo código).

RLS: habilitado [016]. Público ve sectores activos; admin gestiona todo.

### `campaign_impressions` [020, alterada en 021]

Registro de qué campaña se le mostró a qué usuario (control de rotación "una por vez" y base de los reportes de impresiones).

- `id UUID PK`
- `campaign_id UUID FK -> central_admin_campaigns(id) ON DELETE CASCADE`
- `user_id UUID FK -> users(id) ON DELETE CASCADE`
- `shown_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `sector TEXT` [021] — snapshot del sector del usuario al momento de la impresión (`NULL` = usuario comodín), usado para el reporte de desglose por sector

Índices: `idx_campaign_impressions_user`, `idx_campaign_impressions_campaign_time`, `idx_campaign_impressions_sector_time` [021].

RLS: habilitado [020]. Usuario inserta/ve sus propias impresiones; admin ve todas.

### `app_entry_log` [020]

Registro de entradas/sesiones de la app, por sector (tráfico de entrada para reportes).

- `id UUID PK`
- `user_id UUID FK -> users(id) ON DELETE CASCADE`
- `sector TEXT`
- `entered_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Índices: `idx_app_entry_log_time`, `idx_app_entry_log_sector_time`.

RLS: habilitado [020]. Usuario inserta/ve sus propias entradas; admin ve todas.

---

## 5. Tablas de integración T-Pot (honeypot)

Todas creadas en la migración 013, con RLS habilitado y **acceso restringido a administradores** en todos los casos.

### `tpot_integration_settings`
- `id UUID PK`, `enabled BOOLEAN NOT NULL DEFAULT false`
- `base_url TEXT`, `elastic_url_encrypted_or_reference TEXT`
- `verify_tls BOOLEAN NOT NULL DEFAULT true`
- `allowed_indexes TEXT[] DEFAULT ARRAY['logstash-*','tpot-*','cowrie-*','suricata-*','dionaea-*']`
- `created_at`, `updated_at TIMESTAMPTZ`

Política: solo admin (`FOR ALL`).

### `tpot_query_audit`
- `id UUID PK`, `user_id TEXT`, `action TEXT NOT NULL`
- `filters_json JSONB DEFAULT '{}'`, `records_count INTEGER DEFAULT 0`
- `status TEXT NOT NULL DEFAULT 'success'`, `created_at TIMESTAMPTZ DEFAULT now()`

Políticas: admin ve (`FOR SELECT`); solo `service_role` inserta.

### `tpot_ai_analysis_jobs`
- `id UUID PK`, `requested_by TEXT`
- `status TEXT NOT NULL` CHECK (`pending, running, audited, approved, rejected, failed`)
- `filters_json JSONB DEFAULT '{}'`, `sanitized_input_ref TEXT`
- `input_summary_json JSONB DEFAULT '{}'`
- `raw_ai_output JSONB`, `audited_output JSONB`
- `audit_status TEXT`, `audit_notes TEXT`, `approved_output JSONB`
- `model TEXT`, `audit_model TEXT`
- `created_at`, `updated_at TIMESTAMPTZ`
- `approved_by TEXT`, `approved_at TIMESTAMPTZ`

Política: solo admin (`FOR ALL`).

### `tpot_iocs_cache`
- `id UUID PK`, `indicator_type TEXT NOT NULL`
- `indicator_value_hash TEXT NOT NULL`, `indicator_value_masked TEXT NOT NULL`
- `frequency INTEGER DEFAULT 1`
- `first_seen TIMESTAMPTZ`, `last_seen TIMESTAMPTZ`
- `severity TEXT`, `source_honeypot TEXT`, `tags_json JSONB DEFAULT '[]'`
- `created_at`, `updated_at TIMESTAMPTZ`
- `UNIQUE(indicator_type, indicator_value_hash)`

Política: solo admin (`FOR ALL`).

**Nota de alcance:** estas 4 tablas modelan una integración con T-Pot (plataforma de honeypots) y un flujo de análisis con IA auditado antes de aprobación. No se verificó en este trabajo si existe una Edge Function activa que efectivamente llene estas tablas — su presencia en el esquema confirma que la integración fue diseñada e implementada a nivel de base de datos; confirmar el estado operativo real (¿hay un T-Pot desplegado y conectado?) requiere revisión adicional fuera del alcance de este documento.

---

## 6. Tabla de seguridad y auditoría

### `security_audit_events` [012]

- `id UUID PK`
- `actor_user_id UUID`, `event_type TEXT NOT NULL`, `target_user_id UUID`
- `metadata JSONB NOT NULL DEFAULT '{}'`
- `ip_hash TEXT`, `user_agent_hash TEXT`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Sin FK explícitas hacia `users` (los IDs se guardan sueltos, posiblemente para conservar el registro aunque el usuario se elimine). Ver `SECURITY_PRIVACY.md` para el detalle de qué eventos se registran (registro completado, fallo de registro, lectura de perfil privado, denegación de lectura, lote de migración PII).

RLS: habilitado [012]. Admin ve (`FOR SELECT`); autenticados pueden insertar (`GRANT INSERT ... TO authenticated`, sin política restrictiva adicional de INSERT en la migración — cualquier usuario autenticado puede insertar un evento de auditoría, no solo `service_role`).

### `sensei_consultations` [008, alterada en 011]

- `id UUID PK`
- `user_id UUID FK -> users(id) ON DELETE SET NULL`
- `question_text TEXT NOT NULL`, `normalized_topic TEXT`
- `is_cybersecurity BOOLEAN NOT NULL DEFAULT FALSE`, `validation_reason TEXT`
- `answer_text TEXT`, `answer_sources JSONB DEFAULT '[]'`
- `matched_question_ids TEXT[] DEFAULT '{}'`
- `used_bank BOOLEAN DEFAULT FALSE`, `used_web BOOLEAN DEFAULT FALSE`
- `auditor_provider TEXT`, `auditor_replaced_answer BOOLEAN DEFAULT FALSE`
- `status TEXT NOT NULL DEFAULT 'answered'` CHECK (`answered, out_of_scope, failed`)
- `feedback_helpful BOOLEAN`, `feedback_text TEXT`
- `sentiment_label TEXT` CHECK (`positivo, neutral, negativo`), `sentiment_score NUMERIC(4,3)`
- `created_at`, `updated_at TIMESTAMPTZ`
- `draft_answer_text TEXT`, `auditor_notes TEXT`, `auditor_model TEXT` [011]
- `auditor_started_at TIMESTAMPTZ`, `auditor_finished_at TIMESTAMPTZ`, `auditor_timeout_ms INTEGER` [011]

Índices: `idx_sensei_consultations_created`, `idx_sensei_consultations_user`, `idx_sensei_consultations_sentiment`.

RLS: habilitado [008]. Usuario inserta/ve/actualiza sus propias consultas (feedback); admin ve/actualiza todas.

---

## 7. Vistas

### `user_statistics_private` [012]
```sql
SELECT business_type, belt, current_risk_level, COUNT(*) AS user_count
FROM public.users
GROUP BY business_type, belt, current_risk_level;
```
Agregado estadístico sin PII, para reportes. `GRANT SELECT ... TO authenticated`.

### `central_admin_question_bank` [007]
`questions` unida a `cyber_dojos` (LEFT JOIN por `dojo_id`), exponiendo `dojo_name`/`dojo_theme` junto a todos los campos administrables de la pregunta. `GRANT SELECT ... TO anon, authenticated`.

### `sensei_consultation_stats` [008]
Agregación diaria (`date_trunc('day', created_at)`) de `sensei_consultations`: total de consultas, consultas sobre ciberseguridad vs. fuera de alcance, conteo de feedback útil/no útil, y conteo por `sentiment_label`. `GRANT SELECT ... TO authenticated`.

### `ai_audit_corrections_report` [011]
`UNION ALL` de dos fuentes — consultas del Sensei corregidas por su auditor (`sensei_consultations` donde `auditor_replaced_answer=true`) y preguntas del banco corregidas por auditoría de IA (`questions` donde `audit_replaced_content=true`) — filtrado internamente por `WHERE public.is_admin()` dentro de la propia vista (no solo por RLS de la tabla base). `GRANT SELECT ... TO authenticated`.

---

## 8. Funciones

| Función | Migración | Tipo | Propósito |
|---|---|---|---|
| `update_updated_at_column()` | 001 | trigger | Actualiza `updated_at = NOW()` genérico (usado por `users`, `ai_configs`) |
| `is_admin()` | 004 | `SECURITY DEFINER`, callable | `TRUE` si `auth.uid()` corresponde a una fila de `users` con `role='admin'`. Base de casi todas las políticas RLS de administración |
| `prevent_user_security_field_tampering()` | 005 | trigger `SECURITY DEFINER` | Bloquea que un cliente no-admin/no-service_role cambie `role`, `belt`, `current_risk_level` o `last_evaluation_at` en `users`; fuerza `role='user'` en INSERT propio |
| `touch_updated_at()` | 007 | trigger | Igual que `update_updated_at_column()`, usado por las tablas creadas desde 007 en adelante |
| `publish_generated_kata(generated_kata_id UUID)` | 007 | `SECURITY DEFINER`, callable | Solo admin. Convierte una fila `cyber_dojo_generated_katas` en una fila real de `katas` (kata_code `GEN_<uuid>`, cinturón derivado de `difficulty`, puntos `100 + difficulty*50`), y marca el origen como `published` |
| `save_business_sector(...)` | 016, firma reemplazada en 019 (agrega `sector_industry`) | `SECURITY DEFINER`, callable | Solo admin. Crea/edita un sector; si cambia el `code`, propaga el cambio a `users.business_type` y `alerts.target_business_types` |
| `sync_campaign_active_from_status()` | 018 | trigger | Mantiene `central_admin_campaigns.active` sincronizado con `status='activa'` |
| `get_next_campaign_for_user(p_moment TEXT DEFAULT 'inicio')` | 020 | `SECURITY DEFINER`, callable | Devuelve la siguiente campaña elegible que el usuario autenticado no ha visto para ese `moment` (ordenado por `created_at ASC`, filtrado por sector); si ya vio todas, reinicia el ciclo desde la más antigua en vez de no mostrar nada |

---

## 9. Hallazgos sobre RLS (observados, no interpretados)

Estos son hechos verificables leyendo las 21 migraciones — no son fallas necesariamente intencionadas ni bugs confirmados, pero deben quedar documentados para la auditoría tal como están, porque **no aparece ninguna migración posterior que los corrija**:

1. **`sponsors`, `ai_configs`, `recommendations_cache` nunca reciben `ENABLE ROW LEVEL SECURITY`.** Quedan con el comportamiento por defecto de PostgreSQL (accesible según los `GRANT` de rol, sin política de fila). Como no se declaró RLS, tampoco hay `GRANT` explícito documentado en estas migraciones más allá del acceso de `service_role` (implícito) — el acceso real depende de los roles de Supabase (`anon`/`authenticated`) que no se restringieron aquí.
2. **`domains_whitelist` y `katas` tienen RLS habilitado y una política pública de lectura, pero ninguna política de escritura para admin** en las 21 migraciones revisadas. En la práctica esto es coherente con que la edición se hace vía `service_role` (Edge Functions / admin backend con clave de servicio, que ignora RLS), pero no hay una política SQL explícita que documente/limite ese acceso de escritura a nivel de base de datos.
3. **`email_analysis` y `alert_deliveries`** solo tienen políticas para que el propio usuario vea/inserte sus filas; no se encontró una política admin de lectura total, a diferencia de `evaluations` y `kata_completions` que sí la tienen.
4. **`security_audit_events`** permite `INSERT` a cualquier usuario autenticado (`GRANT INSERT ... TO authenticated`) sin una política RLS de `WITH CHECK` que lo restrinja — cualquier cliente autenticado puede escribir un evento de auditoría arbitrario (no solo el backend). La lectura sí está restringida a admin.

Recomendación para el auditor: estos 4 puntos fueron solventados mediante la migración correctiva `supabase/migrations/022_security_hardening_rls.sql`, la cual activó RLS con políticas de administración en `sponsors`, `ai_configs` y `recommendations_cache`, otorgó políticas de administración explícitas en `katas` y `domains_whitelist`, y revocó permisos de inserción directa no controlada en `security_audit_events`.

---

## 10. Diagrama entidad-relación

Incluye únicamente relaciones declaradas con `REFERENCES` en las migraciones (claves foráneas reales), agrupadas por dominio.

```mermaid
erDiagram
    USERS ||--o{ EVALUATIONS : "user_id"
    USERS ||--o{ KATA_COMPLETIONS : "user_id"
    USERS ||--o{ EMAIL_ANALYSIS : "user_id"
    USERS ||--o{ ALERT_DELIVERIES : "user_id"
    USERS ||--o{ ALERTS : "approved_by"
    USERS ||--o{ SENSEI_CONSULTATIONS : "user_id"
    USERS ||--o{ CAMPAIGN_IMPRESSIONS : "user_id"
    USERS ||--o{ APP_ENTRY_LOG : "user_id"

    KATAS ||--o{ KATA_COMPLETIONS : "kata_id"
    KATAS ||--o{ CYBER_DOJO_GENERATED_KATAS : "published_kata_id"

    ALERTS ||--o{ ALERT_DELIVERIES : "alert_id"

    CYBER_DOJOS ||--o{ QUESTIONS : "dojo_id"
    CYBER_DOJOS ||--o{ CYBER_DOJO_GENERATED_KATAS : "dojo_id"

    AGENT_CONFIGS ||--o{ AGENT_PROVIDER_ASSIGNMENTS : "agent_config_id"
    AGENT_CONFIGS ||--o{ AGENT_RUNS : "agent_config_id"
    AI_PROVIDERS ||--o{ AGENT_PROVIDER_ASSIGNMENTS : "provider_key"
    AI_PROVIDERS ||--o{ INCIDENT_INVESTIGATIONS : "ai_provider_key"

    INCIDENT_INVESTIGATIONS ||--o{ CYBER_DOJO_GENERATED_KATAS : "incident_investigation_id"
    AGENT_RUNS ||--o{ CYBER_DOJO_GENERATED_KATAS : "created_by_agent_run_id"

    CENTRAL_ADMIN_CAMPAIGNS ||--o{ CAMPAIGN_IMPRESSIONS : "campaign_id"
    CENTRAL_ADMIN_CAMPAIGNS ||--o{ CENTRAL_ADMIN_CAMPAIGN_AUDIT : "campaign_id"
```

Notas sobre el diagrama:
- `business_sectors` no tiene FK real hacia `users.business_type` ni `users.sector` (son coincidencias por valor de texto, validadas a nivel de aplicación/función, no por `REFERENCES`) — se omite del diagrama por esa razón, aunque la relación lógica existe y está documentada en la sección 4.
- `questions.generated_from_incident_id` no tiene FK declarada hacia `incident_investigations` (es `UUID` suelto) pese a la relación lógica — se omite del diagrama por el mismo criterio de "solo FKs reales".
- Las tablas T-Pot (sección 5) no tienen FKs hacia el resto del esquema y se omiten del diagrama.

---

*Documento generado el 2026-09-08 a partir de la lectura línea por línea de `supabase/migrations/001_initial_schema.sql` a `021_campaign_impressions_sector.sql`. Cualquier cambio de esquema posterior a estas 21 migraciones no está reflejado aquí.*

RLS: habilitado [004]. Admin gestiona todo [004].

---

## 12. Módulo de Consentimiento Informado (LOPDP)

Añadido el 2026-10-23 (T98.c), leyendo línea por línea `supabase/migrations/073_consent_module_foundation.sql` a `084_consent_records_legacy_ip_hmac_nullable.sql`. Mismo criterio que el resto del documento: solo lo verificado en el código, con el número de migración entre corchetes. No incluye la migración `076_learning_guest_limit.sql` (toca `learning_answer`/`learning_start_exam` de la línea base, ajena a este módulo — ver `loop-consentimiento/TASKS.md`, INV-SEC) ni la `081_fix_digest_schema_qualification.sql` (no crea ni altera ninguna tabla: solo recalifica `digest()` dentro de triggers/funciones ya listados abajo).

### `consent_documents` [073, alterada en 077]

El aviso de privacidad versionado (REQ-01/02/03).

- `id UUID PK DEFAULT gen_random_uuid()`
- `version TEXT UNIQUE NOT NULL`
- `title TEXT NOT NULL`
- `content_md TEXT NOT NULL` CHECK (`char_length(content_md) <= 100000`)
- `content_sha256 TEXT NOT NULL`
- `purposes JSONB NOT NULL` — arreglo de finalidades (`code`, `label`, `description`, `required`, `order`)
- `status TEXT NOT NULL` CHECK (`draft, published, retired`)
- `requires_reconsent BOOLEAN NOT NULL DEFAULT false`
- `change_summary TEXT`
- `based_on_id UUID FK -> consent_documents(id)` — de qué versión se clonó el borrador
- `created_by UUID NOT NULL FK -> users(id)`, `created_at TIMESTAMPTZ DEFAULT now()`
- `updated_by UUID FK -> users(id)`, `updated_at TIMESTAMPTZ`
- `published_by UUID FK -> users(id)`, `published_at TIMESTAMPTZ`
- `retired_by UUID FK -> users(id)`, `retired_at TIMESTAMPTZ`

Índice único parcial `consent_documents_one_published` sobre `status` WHERE `status='published'` — solo una versión publicada a la vez [073].

Trigger `consent_documents_immutable` [073] (`BEFORE UPDATE`): una vez que `status` deja de ser `draft`, bloquea cualquier cambio a `content_md`/`purposes`/`version`/`title`/`content_sha256` — hay que clonar un borrador nuevo, nunca editar una versión publicada o retirada.

Trigger de restricción diferible `consent_documents_no_gap_on_retire` [077] (`CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`, solo dispara en la transición `published → retired`): al final de la transacción exige que exista alguna fila `published` — permite retirar y publicar el reemplazo en la misma transacción (en cualquier orden), pero no deja el módulo sin aviso vigente.

RLS: habilitado [073]. Público (incluido `anon`) ve solo las filas `published` [073]; `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated, anon` — toda escritura es vía `service_role`, nunca directo del cliente.

### `consent_records` [073, alterada en 074 y 084]

Evidencia de consentimiento, append-only con cadena de hash (REQ-04).

- `id BIGINT PK GENERATED ALWAYS AS IDENTITY`
- `user_id UUID FK -> users(id) ON DELETE NO ACTION` [la FK original de 073 era `ON DELETE SET NULL`; 074 la cambió a `NO ACTION` porque ese `SET NULL` implícito disparaba el propio trigger append-only y una baja con evidencia no se podía atender — la desvinculación real ahora la hace `unlink_user_consent_evidence()`]. Nulo para evidencia de invitado (083) y legacy (084).
- `user_ref_hmac TEXT NOT NULL` — `HMAC(user_id, LOOKUP_HMAC_KEY_B64)`; referencia estable aunque `user_id` quede `NULL`
- `document_id UUID NOT NULL FK -> consent_documents(id)`, `document_version TEXT NOT NULL`
- `rendered_sha256 TEXT NOT NULL`, `settings_version INT NOT NULL`
- `purpose_code TEXT NOT NULL`
- `decision TEXT NOT NULL` CHECK (`granted, denied, revoked`)
- `channel TEXT NOT NULL` CHECK (`registro, reconsentimiento, mi_privacidad, correo, admin` [073], `+ invitado` [083])
- `ip_ciphertext JSONB`, `ip_hmac TEXT` [nulable desde 073 por tipo de columna, pero con `NOT NULL` real hasta 084] — ver CHECK abajo
- `ua_ciphertext JSONB`, `ua_hmac TEXT`
- `key_version INT NOT NULL`
- `server_ts TIMESTAMPTZ NOT NULL DEFAULT now()`
- `prev_hash TEXT`, `row_hash TEXT NOT NULL` — cadena de hash, ver función `verify_consent_chain()` abajo

CHECK `consent_records_ip_hmac_legacy_check` [084]: `ip_hmac IS NOT NULL OR document_version LIKE 'legacy-%'` — toda fila nueva sigue exigiendo IP; solo el backfill de consentimiento legacy (T25) puede quedar sin ella.

Índices: `consent_records_user_purpose(user_id, purpose_code, server_ts DESC)`, `consent_records_ip_hmac(ip_hmac)`, `consent_records_user_ref_hmac(user_ref_hmac)` [073].

Canonicalización del hash (`consent_record_canonical`) [073, redefinida en 074]: desde 074 excluye `row_hash`, `user_id`, `ip_ciphertext` y `ua_ciphertext` — exactamente las columnas que una baja (`unlink_user_consent_evidence`) o una futura retención (REQ-19, aún sin implementar — ver `loop-consentimiento/TASKS.md`, T17) ponen en `NULL`; si el hash las cubriera, cada baja/retención rompería `verify_consent_chain()`.

Trigger `consent_records_chain` [073] (`BEFORE INSERT`): calcula `prev_hash`/`row_hash` encadenando con la fila anterior (candado consultivo `pg_advisory_xact_lock` para que inserciones concurrentes no generen dos cadenas válidas en paralelo).

Trigger `consent_records_append_only` → función `block_consent_records_mutation` [073, reescrita en 074]: bloquea todo `UPDATE`/`DELETE` salvo con la bandera de sesión `app.allow_evidence_mutation = 'on'`; desde 074, incluso con la bandera activa solo puede cambiar `user_id`, `ip_ciphertext` y `ua_ciphertext`, y únicamente hacia `NULL` (nunca a otro valor, nunca el resto de columnas). Confirmado contra Postgres real (no solo leído en el código): un intento de `DELETE`/`UPDATE` directo, incluso como `service_role`, falla con este mensaje — probado en la sesión que preparó T25 (ver `loop-consentimiento/PROGRESS.md`, Iteración 92).

RLS: habilitado [073]. Usuario ve sus propias filas, pero el `GRANT SELECT` está acotado a columnas (`id, user_id, document_id, document_version, purpose_code, decision, channel, server_ts` — nunca `ip_ciphertext`/`ip_hmac`/`ua_ciphertext`/`ua_hmac`, ni siquiera cifrados) [073]. `REVOKE ALL ... FROM authenticated, anon` de base; toda escritura es `service_role`.

### `admin_audit_log` [073, alterada en 074]

Bitácora administrativa, append-only con cadena de hash (REQ-16).

- `id BIGINT PK GENERATED ALWAYS AS IDENTITY`
- `actor_id UUID FK -> users(id) ON DELETE NO ACTION` [igual que `consent_records.user_id`: 073 tenía `ON DELETE SET NULL`, 074 lo cambió a `NO ACTION` por el mismo motivo — borrar a un admin con historial fallaba por el trigger append-only; un admin con historial se desactiva, no se borra]
- `actor_email_hmac TEXT NOT NULL`, `actor_role TEXT NOT NULL`
- `action TEXT NOT NULL`, `entity TEXT NOT NULL`, `entity_id TEXT`
- `before JSONB`, `after JSONB`, `diff TEXT`, `reason TEXT`
- `ip_ciphertext JSONB`, `ip_hmac TEXT`, `key_version INT`
- `created_at TIMESTAMPTZ DEFAULT now()`
- `prev_hash TEXT`, `row_hash TEXT NOT NULL`

Índices: `admin_audit_log_actor(actor_id, created_at DESC)`, `admin_audit_log_action(action, created_at DESC)` [073].

Misma mecánica que `consent_records`: trigger `admin_audit_log_chain` calcula la cadena de hash [073]; a diferencia de `consent_records`, su trigger append-only (`block_admin_audit_log_mutation`) **no tiene ninguna bandera de excepción** — "no existe ninguna función que pueda modificar una fila existente" [073], ni siquiera para desvincular un actor (coherente con que `actor_id` usa `ON DELETE NO ACTION`, no `SET NULL`).

RLS: habilitado [073]. `REVOKE ALL ... FROM authenticated, anon` — ninguna columna expuesta directo al cliente; se lee solo a través de `admin-consent` (service role, que aplica sus propios candados de rol).

### `data_subject_requests` [073, alterada en 078]

Casos de solicitudes de derechos y bajas (REQ-10/11).

- `id UUID PK DEFAULT gen_random_uuid()`
- `case_number TEXT UNIQUE NOT NULL` — formato `CD-<año>-<6 dígitos>`, numeración reiniciada cada año [073, generador reescrito en 078: antes era una secuencia global que nunca reiniciaba el número al cambiar de año; ahora usa `data_subject_request_counters(year, last_number)`, una fila por año]
- `user_id UUID FK -> users(id) ON DELETE SET NULL`
- `email_ciphertext JSONB`, `email_hmac TEXT NOT NULL`
- `request_type TEXT NOT NULL` CHECK (`baja, acceso, rectificacion, eliminacion, oposicion, suspension, portabilidad, revocacion, decision_automatizada`) — las 9 finalidades ya estaban completas desde 073, no se amplió después
- `details_ciphertext JSONB`
- `channel TEXT NOT NULL` CHECK (`app, correo`)
- `status TEXT NOT NULL DEFAULT 'recibida'` CHECK (`recibida, requiere_aclaracion, en_proceso, atendida, rechazada_con_motivo`)
- `routed_to_email TEXT NOT NULL`, `settings_version INT NOT NULL`
- `received_at TIMESTAMPTZ DEFAULT now()`, `due_at TIMESTAMPTZ NOT NULL`
- `resolved_at TIMESTAMPTZ`, `resolution_note_ciphertext JSONB`
- `ip_ciphertext JSONB`, `ip_hmac TEXT`, `key_version INT`

Índices: `data_subject_requests_status_due(status, due_at)`, `data_subject_requests_email_hmac(email_hmac)` [073].

Tabla nueva `data_subject_request_counters(year INT PK, last_number INT DEFAULT 0)` [078] — respalda `next_case_number()` (sección de funciones abajo); `REVOKE ALL ... FROM authenticated, anon`.

Trigger `data_subject_requests_restrict_update` → `block_data_subject_request_mutation` [078]: **073 no daba ninguna vía de `UPDATE`** (`REVOKE ALL`, sin ninguna función); 078 la abre, pero solo a través de `update_data_subject_request_status()` con la bandera `app.allow_case_status_update`, y aun así solo puede cambiar `status`, `resolved_at` y `resolution_note_ciphertext`. `DELETE` sigue bloqueado siempre, con o sin la bandera — "no se puede borrar un caso, solo cambiar su estado".

RLS: habilitado [073]. `REVOKE ALL ... FROM authenticated, anon` — "sin políticas para anon/authenticated a propósito: se crea y se lee solo vía las Edge Functions (service role)... nunca directo del cliente" [073, comentario literal de la migración].

### `privacy_settings` [073, alterada en 075] y `privacy_email_verifications` [075]

Configuración del responsable/delegado, versionada (REQ-14/15).

`privacy_settings`:
- `id BIGINT PK GENERATED ALWAYS AS IDENTITY`
- `settings_version INT UNIQUE NOT NULL`
- `controller_name TEXT`, `controller_address TEXT`, `controller_phone TEXT`
- `privacy_email TEXT NOT NULL`
- `dpo_name TEXT`, `dpo_contact TEXT`
- `unsubscribe_subject TEXT DEFAULT 'Solicitud de baja y eliminación de datos - CiberDojo'`
- `response_days INT DEFAULT 15` CHECK (1-90)
- `response_day_type TEXT DEFAULT 'calendario'` CHECK (`calendario, habiles`) — D-03: en uso hoy siempre `calendario`, sin tabla de feriados
- `ip_retention_days INT DEFAULT 730` CHECK (`>= 0`)
- `evidence_retention_days INT DEFAULT 1825` CHECK (`>= 0`) — comentario de 073: "D-02: 5 años tras baja atendida"; **ambos plazos de retención siguen siendo solo valores por defecto configurables: D-02 sigue `ABIERTA` en `loop-consentimiento/DECISIONS.md`, pendiente de asesoría legal**
- `privacy_policy_url TEXT`
- `four_eyes_publish BOOLEAN DEFAULT false`
- `created_by UUID NOT NULL FK -> users(id)`, `created_at TIMESTAMPTZ DEFAULT now()`

Columnas que 073 creó y 075 **eliminó** (nunca tuvieron datos, confirmado con una guarda `DO $$ ... RAISE EXCEPTION` que aborta la migración si llegaran a tenerlos): `is_current`, `privacy_email_pending`, `privacy_email_code_hash`, `privacy_email_code_expires_at`. El motivo (comentario de 075): con `is_current` + un índice único, nunca se podía "bajar" la marca de la versión vieja, así que la versión 2 no cabía — la verificación de correo pendiente se movió a su propia tabla.

Trigger `privacy_settings_append_only` [073]: solo `INSERT`, cualquier `UPDATE`/`DELETE` lanza excepción. Trigger `privacy_settings_next_version` → `enforce_next_privacy_settings_version` [075]: la versión nueva debe ser exactamente `MAX(settings_version) + 1` (candado consultivo para dos inserciones simultáneas).

Vista `privacy_settings_current` [075]: `SELECT * ... ORDER BY settings_version DESC LIMIT 1`, `security_invoker = true`; `GRANT SELECT` solo a `service_role`.

`privacy_email_verifications` [075]:
- `id UUID PK DEFAULT gen_random_uuid()`
- `new_email TEXT NOT NULL` CHECK (formato de correo, ≤254 caracteres)
- `code_hash TEXT NOT NULL`, `expires_at TIMESTAMPTZ NOT NULL` CHECK (`expires_at > created_at`)
- `attempts INT DEFAULT 0` CHECK (0-10)
- `confirmed_at TIMESTAMPTZ`
- `requested_by UUID NOT NULL FK -> users(id)`, `created_at TIMESTAMPTZ DEFAULT now()`

Índice `privacy_email_verifications_requester(requested_by, created_at DESC)`. Dos triggers de guarda [075]: `guard_privacy_email_verification_update` (una vez `confirmed_at` no es nulo, la fila ya no cambia; solo pueden subir `attempts` o confirmarse una vez, nunca con el código ya vencido) y `guard_privacy_email_verification_delete` (una verificación confirmada nunca se borra).

RLS de ambas: habilitado [073/075]. `REVOKE ALL ... FROM anon, authenticated` — solo `admin-consent` (service role) las toca.

### `admin_roles` [073]

Identidad y roles individuales del módulo (D-01, SEC-02, H08).

- `user_id UUID NOT NULL FK -> users(id) ON DELETE CASCADE`
- `role TEXT NOT NULL` CHECK (`privacy_editor, privacy_admin, privacy_auditor`)
- `granted_by UUID FK -> users(id)`, `granted_at TIMESTAMPTZ DEFAULT now()`
- `PRIMARY KEY (user_id, role)` — una persona puede tener varios roles, una fila por rol

**Nace vacía**: a diferencia de `privacy_settings`, esta migración no inserta ninguna fila placeholder — no hay ninguna ruta de auto-alta de administradores; alguien con acceso directo a la base debe decidir quién recibe qué rol (ver `loop-consentimiento/PLAN_RELEASE_COMPLETO.md`, paso 1).

RLS: habilitado [073]. Única política: cada persona ve sus propias filas (`auth.uid() = user_id`). `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated, anon` — otorgar un rol exige una sesión con acceso directo a la base (SQL Editor del panel o `psql`), nunca desde el cliente ni desde ninguna Edge Function.

### `email_transport_settings`, `email_transport_tests`, `email_outbox` [079]

Transporte de correo saliente configurable desde el panel (REQ-21, SEC-09, D-05).

`email_transport_settings` — versionada, solo `INSERT` (mismo patrón que `privacy_settings`):
- `id BIGINT PK GENERATED ALWAYS AS IDENTITY`
- `transport_version INT UNIQUE NOT NULL`
- `mode TEXT NOT NULL` CHECK (`resend, smtp`)
- `from_name TEXT NOT NULL`, `from_email TEXT NOT NULL` CHECK (formato de correo)
- `smtp_host TEXT`, `smtp_port INT` CHECK (`NULL` o `465`/`2525` — mismo tope que el anti-SSRF de T12.c: 587/25 nunca), `smtp_username TEXT`, `smtp_password_ciphertext JSONB`
- `created_by UUID NOT NULL FK -> users(id)`, `created_at TIMESTAMPTZ DEFAULT now()`
- CHECK compuesto: en modo `resend` las 4 columnas `smtp_*` deben ser `NULL`; en modo `smtp`, las 4 son obligatorias — nunca una mezcla a medias

Fila placeholder sembrada en 079: versión 1, modo `resend`, remitente marcado `(placeholder, actualizar)`. Trigger de solo-inserción (`block_email_transport_settings_mutation`) y de versión siguiente (`enforce_next_email_transport_settings_version`), igual mecánica que `privacy_settings`/075. Vista `email_transport_settings_current` (la de mayor `transport_version`), `security_invoker = true`, `GRANT SELECT` solo a `service_role`.

`email_transport_tests` — resultado de cada correo de prueba, append-only, **sin datos sensibles**:
- `id BIGINT PK GENERATED ALWAYS AS IDENTITY`
- `transport_version INT NOT NULL FK -> email_transport_settings(transport_version)`
- `success BOOLEAN NOT NULL`, `error_code TEXT` CHECK (`success OR error_code IS NOT NULL`)
- `tested_by UUID NOT NULL FK -> users(id)`, `created_at TIMESTAMPTZ DEFAULT now()`

Nunca guarda destinatario ni asunto/cuerpo del correo — solo si funcionó y, si no, un código de error estable (comentario de 079: nunca el mensaje crudo del proveedor, que podría filtrar la contraseña SMTP o cabeceras). Índice `email_transport_tests_version(transport_version, created_at DESC)`. Trigger append-only sin ninguna excepción (`block_email_transport_tests_mutation`) — ni siquiera una función puede modificar una fila existente.

`email_outbox` — avisos pendientes cuando el envío falla (REQ-21f):
- `id UUID PK DEFAULT gen_random_uuid()`
- `reference_table TEXT NOT NULL`, `reference_id TEXT NOT NULL` — apunta a la fila de origen (p. ej. `data_subject_requests` + su id); no duplica correo ni datos del titular aquí
- `status TEXT DEFAULT 'pending'` CHECK (`pending, sent`), `created_at TIMESTAMPTZ DEFAULT now()`, `sent_at TIMESTAMPTZ` CHECK (`(status = 'sent') = (sent_at IS NOT NULL)`)

Índice parcial `email_outbox_pending(created_at) WHERE status = 'pending'`. Trigger `email_outbox_restrict_update` → `block_email_outbox_mutation`: nunca se borra ("no se puede borrar un aviso, solo marcarlo enviado"); la única vía de `UPDATE` es `mark_email_outbox_sent()` con la bandera `app.allow_email_outbox_update`, y solo puede cambiar `status`/`sent_at`.

RLS de las tres: habilitado [079]. `REVOKE ALL ... FROM authenticated, anon` — solo `service_role`.

### Vistas del módulo

| Vista | Migración | Expone | Permisos |
|---|---|---|---|
| `my_consent_state` | 073 | Último estado por finalidad del usuario autenticado (`DISTINCT ON purpose_code`), sin `ip`/`ua`, ni cifrados | `security_invoker=true`; `GRANT SELECT TO authenticated` |
| `privacy_settings_current` | 075 | La fila de `privacy_settings` de mayor `settings_version` | `security_invoker=true`; `GRANT SELECT` solo a `service_role` |
| `email_transport_settings_current` | 079 | La fila de `email_transport_settings` de mayor `transport_version` (incluye `smtp_password_ciphertext`, cifrada) | `security_invoker=true`; `GRANT SELECT` solo a `service_role` |

### Funciones del módulo

| Función | Migración | Tipo | Propósito |
|---|---|---|---|
| `has_privacy_role(required_role TEXT)` | 073 | `SECURITY DEFINER`, callable | `TRUE` si `auth.uid()` tiene esa fila en `admin_roles` |
| `consent_record_canonical(rec)` | 073, redefinida en 074 | `IMMUTABLE`, usada por la cadena | Serialización determinista para el hash; desde 074 excluye `row_hash`/`user_id`/`ip_ciphertext`/`ua_ciphertext` |
| `consent_records_chain_trigger()` | 073 | trigger `BEFORE INSERT` | Calcula `prev_hash`/`row_hash` encadenado, con candado consultivo |
| `block_consent_records_mutation()` | 073, reescrita en 074 | trigger `BEFORE UPDATE OR DELETE` | Append-only; desde 074 la bandera de sesión solo permite poner `user_id`/`ip_ciphertext`/`ua_ciphertext` en `NULL` |
| `verify_consent_chain()` | 073 | callable (`SELECT * FROM ...`) | Recorre toda la cadena de `consent_records` y devuelve el primer eslabón roto, si lo hay (REQ-18) |
| `admin_audit_log_chain_trigger()` / `block_admin_audit_log_mutation()` | 073 | triggers | Misma mecánica que arriba, sin ninguna excepción de mutación |
| `verify_audit_chain()` | 073 | callable | Igual que `verify_consent_chain()`, para `admin_audit_log` (REQ-18) |
| `next_case_number()` | 073, reescrita en 078 | callable | `CD-<año>-<6 dígitos>`; desde 078 reinicia el contador cada año (`data_subject_request_counters`); antes usaba una secuencia global que nunca reiniciaba |
| `enforce_next_privacy_settings_version()` | 075 | trigger `BEFORE INSERT` | La versión nueva debe ser `MAX(settings_version)+1`, con candado consultivo |
| `guard_privacy_email_verification_update()` / `guard_privacy_email_verification_delete()` | 075 | triggers | Una verificación confirmada no cambia ni se borra; los intentos no bajan; no se confirma un código vencido |
| `unlink_user_consent_evidence(user_id, actor_id, actor_email_hmac, actor_role, reason)` | 074 | `SECURITY DEFINER`, solo `service_role` | REQ-20: pone `user_id = NULL` en toda la evidencia de esa persona (bandera de sesión), registra la operación en `admin_audit_log` con el seudónimo (`user_ref_hmac`), nunca el id |
| `enforce_consent_document_no_gap_on_retire()` | 077 | constraint trigger diferible | Al COMMIT, exige que siga existiendo una fila `published` tras retirar la vigente |
| `block_data_subject_request_mutation()` / `update_data_subject_request_status(...)` | 078 | trigger + `SECURITY DEFINER` (solo `service_role`) | Única vía de cambiar `status`/`resolved_at`/`resolution_note_ciphertext` de un caso; `DELETE` bloqueado siempre; registra en `admin_audit_log` |
| `publish_consent_document(draft_id, actor_id, actor_role, actor_aal, actor_email_hmac, reason)` | 080 | `SECURITY DEFINER`, solo `service_role` | Retira la versión vigente y publica el borrador en UNA transacción (candado consultivo `pg_advisory_xact_lock`); valida `aal2`, rol `privacy_admin` y la regla de "cuatro ojos" (`four_eyes_publish`) dentro de la propia función, no solo en la Edge Function |
| 4 funciones de cadena recalificadas | 081 | `CREATE OR REPLACE` puro | `consent_records_chain_trigger`/`verify_consent_chain`/`admin_audit_log_chain_trigger`/`verify_audit_chain` pasan a llamar `extensions.digest(...)` calificado — en Supabase real `pgcrypto` vive en `extensions`, no en `public`; sin esto, cualquier función `SECURITY DEFINER ... SET search_path = public` que disparara estos triggers fallaba con `function digest(text, unknown) does not exist` |
| `confirm_privacy_email_change(verification_id, code_hash, actor_id, actor_role, actor_aal, actor_email_hmac)` | 082 | `SECURITY DEFINER`, solo `service_role` | Confirma el código y, en la misma transacción, inserta la siguiente versión de `privacy_settings` con el correo nuevo; vuelve a comprobar el hash del código como defensa en profundidad |
| `block_email_transport_settings_mutation()` / `enforce_next_email_transport_settings_version()` | 079 | triggers | Mismo patrón que `privacy_settings`: solo inserción, versión siguiente exacta |
| `block_email_transport_tests_mutation()` | 079 | trigger | Append-only sin excepción |
| `block_email_outbox_mutation()` / `mark_email_outbox_sent(outbox_id)` | 079 | trigger + `SECURITY DEFINER` (solo `service_role`) | Única vía de marcar un aviso como `sent`; nunca se borra |
| `cleanup_expired_guest_sessions()` | 083 | `SECURITY DEFINER`, solo `service_role` | Borra `auth.users` con `is_anonymous=true` y más de 24h de antigüedad (cascada a `learning_progress`/`learning_attempts`); agendada por hora con `pg_cron` solo si la extensión existe en el proyecto |

### Hallazgos de RLS específicos del módulo

A diferencia de las tablas de la línea base (sección 9), **ninguna tabla del módulo quedó sin `ENABLE ROW LEVEL SECURITY`** — las 10 tablas (`consent_documents`, `consent_records`, `admin_audit_log`, `data_subject_requests`, `data_subject_request_counters`, `privacy_settings`, `privacy_email_verifications`, `admin_roles`, `email_transport_settings`, `email_transport_tests`, `email_outbox`) lo tienen desde su propia migración de creación. La única lectura directa del cliente en todo el módulo es: `consent_documents` (público, solo filas `published`), `consent_records` (el propio usuario, columnas acotadas, vía RLS) y `admin_roles` (la propia persona, vía RLS); todo lo demás se lee y escribe exclusivamente a través de las Edge Functions del módulo (`service_role`), que aplican sus propios candados de rol (`requireRole`, `has_privacy_role`) antes de tocar la base.

### Nota sobre el diagrama entidad-relación (sección 11)

El diagrama de la sección 11 no incluye las tablas de este módulo (se generó antes de 073). No se amplió en este trabajo: las relaciones reales del módulo son extensas (casi todas las tablas referencian `users` para `created_by`/`actor_id`/`user_id`, más las FK internas ya listadas arriba columna por columna) y ampliar el diagrama Mermaid existente queda fuera del alcance de T98.c — las FK están documentadas en prosa en cada tabla de esta sección.

---

*Sección 12 añadida el 2026-10-23 a partir de la lectura línea por línea de `supabase/migrations/073_consent_module_foundation.sql` a `084_consent_records_legacy_ip_hmac_nullable.sql`. Cualquier migración del módulo posterior a la 084 no está reflejada aquí.*
