// RF-09/RF-10/RF-11: takes a batch of recent security_events and asks the
// same Vault-backed provider chain the news agent uses (reusing its
// provider assignments — this function supplies its own diagnosis prompt,
// not the news agent's) for a Spanish, plain-language read: severity,
// summary, and actionable recommendations. Triggered on-demand from the
// admin panel or weekly by pg_cron (055_security_center_jobs.sql).
//
// Same discipline as quiz-generator: the AI's JSON is validated before
// anything is treated as a real diagnosis. A malformed or incomplete
// response is persisted as validation_status='partial' with the raw text,
// never silently dropped and never presented as a real diagnosis.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from 'https://esm.sh/zod@3.23.8'
import {
  corsHeaders,
  supabase,
  ProviderAttempt,
  ProviderChainError,
  runProviderChain,
  requireAdminOrScheduler,
  parseJsonResponse,
  HttpError,
  getStatus,
  jsonResponse,
} from '../_shared/news-agent-core.ts'

const DEFAULT_AGENT_CODE = 'ciber-dojo-news-agent'
const MAX_EVENTS = 500

const DiagnosisSchema = z.object({
  severity: z.enum(['baja', 'media', 'alta', 'critica']),
  summary_es: z.string().min(1),
  recommendations: z.array(z.string().min(1)).min(1),
})

const DIAGNOSIS_PROMPT = `Eres un analista de seguridad que explica eventos tecnicos a duenos de pequenos negocios en Ecuador sin conocimiento tecnico.
Recibiras una lista de eventos de seguridad (endpoint, tipo de evento, severidad, fecha, metadata) del backend de una plataforma educativa.
Responde UNICAMENTE con un objeto JSON con esta forma exacta, sin texto adicional ni bloques de codigo:
{
  "severity": "baja" | "media" | "alta" | "critica",  // la severidad global de este periodo, no la de un solo evento
  "summary_es": "string",  // 2-4 oraciones en espanol simple, sin jerga, explicando que paso
  "recommendations": ["string", "string"]  // 2-5 acciones concretas y accionables para el equipo del club
}`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const actor = await requireAdminOrScheduler(req)
    const body = await req.json().catch(() => ({}))
    return await handleDiagnose(body, actor)
  } catch (error) {
    console.error('Error in security-diagnose:', error)
    return jsonResponse({ error: (error as Error).message }, getStatus(error))
  }
})

async function handleDiagnose(body: Record<string, unknown>, actor: string) {
  const periodStart = typeof body.period_start === 'string'
    ? body.period_start
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const periodEnd = typeof body.period_end === 'string' ? body.period_end : new Date().toISOString()

  const { data: events, error: eventsError } = await supabase
    .from('security_events')
    .select('created_at, endpoint, event_type, severity, metadata')
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd)
    .order('created_at', { ascending: false })
    .limit(MAX_EVENTS)
  if (eventsError) throw eventsError

  const eventCount = events?.length ?? 0
  if (eventCount === 0) {
    return jsonResponse({ skipped: true, reason: 'No hay eventos de seguridad en el periodo indicado.', period_start: periodStart, period_end: periodEnd })
  }

  const agentConfigId = typeof body.agent_config_id === 'string' ? body.agent_config_id : null
  const configQuery = supabase.from('agent_configs').select('id')
  const { data: config } = agentConfigId
    ? await configQuery.eq('id', agentConfigId).single()
    : await configQuery.eq('agent_code', DEFAULT_AGENT_CODE).single()
  if (!config) throw new HttpError('No se encontro la configuracion del agente de IA.', 404)

  const aiPayload = { events, period_start: periodStart, period_end: periodEnd }

  let chainResult: { content: string; providerKey: string; attempts: ProviderAttempt[] }
  try {
    chainResult = await runProviderChain(config.id, DIAGNOSIS_PROMPT, aiPayload)
  } catch (error) {
    const chainError = error instanceof ProviderChainError ? error : null
    const attempts = chainError?.attempts ?? []
    const message = attempts.length > 0
      ? `Todos los proveedores de IA fallaron: ${attempts.map((a) => `${a.provider_key}(${a.status}: ${a.error ?? 'sin detalle'})`).join(' || ')}`
      : (error as Error).message
    return jsonResponse({ error: message, attempts }, 502)
  }

  let rawParsed: unknown
  try {
    rawParsed = parseJsonResponse(chainResult.content)
  } catch {
    return await persistPartial({ periodStart, periodEnd, eventCount, chainResult, actor, validationErrors: ['La respuesta del proveedor de IA no es JSON valido.'] })
  }

  const validation = DiagnosisSchema.safeParse(rawParsed)
  if (!validation.success) {
    return await persistPartial({
      periodStart, periodEnd, eventCount, chainResult, actor,
      validationErrors: validation.error.issues.map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`),
    })
  }

  const { data: saved, error: insertError } = await supabase.from('security_diagnoses').insert({
    period_start: periodStart,
    period_end: periodEnd,
    event_count: eventCount,
    severity: validation.data.severity,
    summary_es: validation.data.summary_es,
    recommendations: validation.data.recommendations,
    provider_key: chainResult.providerKey,
    validation_status: 'valid',
    raw_output: chainResult.content,
    triggered_by: actor,
  }).select().single()
  if (insertError) throw insertError

  return jsonResponse({ diagnosis: saved })
}

async function persistPartial(params: {
  periodStart: string
  periodEnd: string
  eventCount: number
  chainResult: { content: string; providerKey: string }
  actor: string
  validationErrors: string[]
}) {
  const { data: saved, error } = await supabase.from('security_diagnoses').insert({
    period_start: params.periodStart,
    period_end: params.periodEnd,
    event_count: params.eventCount,
    severity: 'media',
    summary_es: `No se pudo generar un diagnostico valido: ${params.validationErrors.join('; ')}`,
    recommendations: [],
    provider_key: params.chainResult.providerKey,
    validation_status: 'partial',
    raw_output: params.chainResult.content,
    triggered_by: params.actor,
  }).select().single()
  if (error) throw error
  return jsonResponse({ diagnosis: saved, validation_errors: params.validationErrors })
}
