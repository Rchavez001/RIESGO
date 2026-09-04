-- Cyber Dojo - Consultas de verificacion Supabase
-- Fecha: 2026-08-27
-- Uso: ejecutar en Supabase SQL Editor. Son consultas de solo lectura.
-- Objetivo: confirmar que la base viva coincide con el repositorio.

-- 1. Tablas esperadas en public
select
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
  and table_name in (
    'users',
    'evaluations',
    'questions',
    'katas',
    'kata_completions',
    'email_analysis',
    'domains_whitelist',
    'alerts',
    'alert_deliveries',
    'sponsors',
    'ai_configs',
    'recommendations_cache',
    'business_sectors',
    'ai_providers',
    'agent_configs',
    'agent_provider_assignments',
    'incident_investigations',
    'agent_runs',
    'cyber_dojos',
    'cyber_dojo_wisdom_quotes',
    'cyber_news_sources',
    'cyber_dojo_generated_katas',
    'central_admin_campaigns',
    'sensei_consultations',
    'security_audit_events',
    'tpot_integration_settings',
    'tpot_query_audit',
    'tpot_ai_analysis_jobs',
    'tpot_iocs_cache'
  )
order by table_name;

-- 2. Vistas esperadas
select
  table_name as view_name
from information_schema.views
where table_schema = 'public'
  and table_name in (
    'central_admin_question_bank',
    'sensei_consultation_stats',
    'ai_audit_corrections_report'
  )
order by table_name;

-- 3. Columnas clave por tabla
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'users',
    'evaluations',
    'questions',
    'katas',
    'kata_completions',
    'sensei_consultations',
    'security_audit_events',
    'business_sectors',
    'tpot_ai_analysis_jobs'
  )
order by table_name, ordinal_position;

-- 4. RLS habilitado
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'users',
    'evaluations',
    'questions',
    'katas',
    'kata_completions',
    'email_analysis',
    'alert_deliveries',
    'business_sectors',
    'sensei_consultations',
    'security_audit_events',
    'tpot_integration_settings',
    'tpot_query_audit',
    'tpot_ai_analysis_jobs',
    'tpot_iocs_cache'
  )
order by tablename;

-- 5. Politicas RLS
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 6. Funciones publicas relevantes
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin',
    'update_updated_at_column',
    'touch_updated_at',
    'publish_generated_kata',
    'save_business_sector'
  )
order by p.proname;

-- 7. Triggers relevantes
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;

-- 8. Conteos de datos principales
select 'users' as table_name, count(*) as rows from public.users
union all select 'evaluations', count(*) from public.evaluations
union all select 'questions', count(*) from public.questions
union all select 'katas', count(*) from public.katas
union all select 'kata_completions', count(*) from public.kata_completions
union all select 'alerts', count(*) from public.alerts
union all select 'business_sectors', count(*) from public.business_sectors
union all select 'sensei_consultations', count(*) from public.sensei_consultations
union all select 'agent_configs', count(*) from public.agent_configs
union all select 'ai_providers', count(*) from public.ai_providers
union all select 'incident_investigations', count(*) from public.incident_investigations;

-- 9. Usuarios admin/analyst sin exponer PII completa
select
  id,
  email,
  role,
  belt,
  current_risk_level,
  created_at,
  last_evaluation_at
from public.users
where role in ('admin', 'analyst')
order by created_at desc;

-- 10. Estado PII en users
select
  count(*) as total_users,
  count(*) filter (where email_encrypted is not null) as users_with_email_encrypted,
  count(*) filter (where full_name_encrypted is not null) as users_with_name_encrypted,
  count(*) filter (where email_lookup_hmac is not null) as users_with_email_hmac,
  count(*) filter (where pii_migration_status = 'encrypted') as users_encrypted_status,
  count(*) filter (where email like '%@private.local') as users_with_masked_email
from public.users;

-- 11. Distribucion de cinturones y riesgo
select
  belt,
  current_risk_level,
  count(*) as users_count
from public.users
group by belt, current_risk_level
order by belt, current_risk_level;

-- 12. Preguntas por rama/dojo/fuente/auditoria
select
  coalesce(dojo_id, '(sin dojo)') as dojo_id,
  branch,
  source_type,
  audit_status,
  active,
  count(*) as questions_count
from public.questions
group by coalesce(dojo_id, '(sin dojo)'), branch, source_type, audit_status, active
order by dojo_id, branch, source_type, audit_status, active;

-- 13. Validar pregunta inicial y rutas FIN del cuestionario adaptativo
select
  id,
  branch,
  order_num,
  question_text,
  options
from public.questions
where id = 'A01';

select
  id,
  branch,
  jsonb_path_query_array(options, '$[*] ? (@.siguiente_pregunta == "FIN")') as fin_options
from public.questions
where options @? '$[*] ? (@.siguiente_pregunta == "FIN")'
order by id;

-- 14. Katas activas y estructura de pasos
select
  kata_code,
  name,
  required_belt,
  points_reward,
  verification_type,
  active,
  jsonb_array_length(coalesce(steps, '[]'::jsonb)) as steps_count
from public.katas
order by active desc, required_belt, kata_code;

-- 15. Agent configs y proveedores
select
  ac.agent_code,
  ac.name,
  ac.enabled,
  ac.trigger_time,
  ac.timezone,
  ac.last_run_at,
  array_agg(apa.provider_key order by apa.priority) filter (where apa.active) as active_providers
from public.agent_configs ac
left join public.agent_provider_assignments apa on apa.agent_config_id = ac.id
group by ac.agent_code, ac.name, ac.enabled, ac.trigger_time, ac.timezone, ac.last_run_at
order by ac.agent_code;

select
  provider_key,
  label,
  provider_type,
  model_name,
  purpose,
  active
from public.ai_providers
order by provider_key;

-- 16. Sensei: ultimos registros minimizados
select
  id,
  user_id,
  normalized_topic,
  is_cybersecurity,
  used_bank,
  used_web,
  auditor_provider,
  auditor_replaced_answer,
  status,
  feedback_helpful,
  sentiment_label,
  created_at
from public.sensei_consultations
order by created_at desc
limit 20;

-- 17. T-Pot: confirmar si hay persistencia real
select 'tpot_query_audit' as table_name, count(*) as rows from public.tpot_query_audit
union all select 'tpot_ai_analysis_jobs', count(*) from public.tpot_ai_analysis_jobs
union all select 'tpot_iocs_cache', count(*) from public.tpot_iocs_cache
union all select 'tpot_integration_settings', count(*) from public.tpot_integration_settings;

-- 18. Recomendaciones cacheadas
select
  ai_used,
  count(*) as cache_entries,
  sum(hit_count) as total_hits,
  max(last_hit_at) as last_hit_at
from public.recommendations_cache
group by ai_used
order by cache_entries desc;

-- 19. Alertas activas por severidad
select
  severity,
  active,
  count(*) as alerts_count,
  max(published_at) as latest_published_at
from public.alerts
group by severity, active
order by active desc, severity;

-- 20. Posibles problemas de consistencia: users.total_points vs completaciones
select
  u.id,
  u.email,
  u.total_points as users_total_points,
  coalesce(sum(kc.points_earned), 0) as kata_points_sum,
  max(e.total_score) as latest_or_max_risk_score
from public.users u
left join public.kata_completions kc on kc.user_id = u.id
left join public.evaluations e on e.user_id = u.id
group by u.id, u.email, u.total_points
order by u.created_at desc
limit 50;

-- 21. Validar que el CHECK de users.belt permite toda la ruta gamificada
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.users'::regclass
  and conname = 'users_belt_check';

-- 22. Validar que katas.required_belt solo use cinturones soportados
select
  required_belt,
  count(*) as katas_count
from public.katas
group by required_belt
order by required_belt;

-- 23. Backfill seguro si users.total_points queda desincronizado
-- Ejecutar solo si la consulta 20 muestra diferencias.
/*
update public.users u
set total_points = coalesce(k.points, 0)
from (
  select
    user_id,
    sum(coalesce(points_earned, 0))::int as points
  from public.kata_completions
  group by user_id
) k
where u.id = k.user_id;
*/

-- 24. Sectores activos disponibles para nuevos registros
select
  code,
  label,
  active,
  display_order,
  updated_at
from public.business_sectors
where active = true
order by display_order, label;

-- 25. Usuarios con sector fuera del catalogo actual
select
  u.business_type,
  count(*) as users_count
from public.users u
left join public.business_sectors bs on bs.code = u.business_type
where u.business_type is not null
  and bs.code is null
group by u.business_type
order by users_count desc;

-- 26. Alertas que apuntan a sectores fuera del catalogo actual
select
  a.id,
  a.title,
  a.target_business_types
from public.alerts a
where a.target_business_types is not null
  and exists (
    select 1
    from unnest(a.target_business_types) as sector_code
    left join public.business_sectors bs on bs.code = sector_code
    where bs.code is null
  )
order by a.published_at desc;
