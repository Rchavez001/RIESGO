// Real implementation of the "ciber-dojo-news-agent" that agent_configs /
// agent_provider_assignments already had rows for (see migrations 007, 011,
// 024) but that never had an edge function behind it — the admin UI's
// "Ejecutar ahora" only ever rewrote local template strings.
//
// Two ways content gets generated:
//   - Manual (Puter.js, client-side, "user pays"): "prepare" fetches the
//     configured news sources server-side (arbitrary third-party sites don't
//     send CORS headers, so this can't happen from the admin's browser),
//     strips them to plain text, and opens an agent_runs log row; "complete"
//     takes the raw text puter.ai.chat() returned in the browser and parses
//     it. No server-side LLM API key needed for this path.
//   - Scheduled (pg_cron, Phase 3/4): "scheduled" does fetch + the
//     Vault-backed provider fallback chain (see _shared/news-agent-core.ts)
//     + persist in one shot, since there's no browser to hand off to for an
//     unattended run.
//
// Generated content is always inserted as audit_status='pending',
// active=false (same safety gate the incident investigator already uses) —
// nothing reaches learners without a human approving it first. dry_run
// (the admin's "Probar" button) skips every database write except the run
// log itself.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  corsHeaders,
  supabase,
  RESPONSE_FORMAT_SPEC,
  ProviderAttempt,
  ProviderChainError,
  runProviderChain,
  insertGeneratedContent,
  GeneratedQuestion,
  GeneratedKata,
  parseJsonResponse,
  fetchSource,
  requireAdminOrScheduler,
  HttpError,
  getStatus,
  jsonResponse,
} from '../_shared/news-agent-core.ts'

const AGENT_CODE = 'ciber-dojo-news-agent'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const requester = await requireAdminOrScheduler(req)
    const body = await req.json().catch(() => ({}))
    const action = body.action === 'complete' ? 'complete' : body.action === 'scheduled' ? 'scheduled' : 'prepare'

    if (action === 'scheduled') {
      return await handleScheduled(requester)
    }
    if (action === 'prepare') {
      return await handlePrepare(body, requester)
    }
    return await handleComplete(body)
  } catch (error) {
    const message = (error as Error).message
    console.error('Error in run-news-agent:', error)
    return jsonResponse({ error: message }, getStatus(error))
  }
})

async function handlePrepare(body: Record<string, unknown>, requester: string) {
  const dryRun = Boolean(body.dry_run)

  // AI generation runs client-side via Puter.js (see module comment) — an
  // unattended cron dispatch has no browser to run it in, and would
  // otherwise leave this run stuck at status='running' forever with no
  // "complete" call ever coming. Fail fast and visibly instead.
  if (requester === 'scheduler') {
    throw new HttpError(
      'El agente de noticias solo puede ejecutarse desde el panel admin (usa Puter.js en el navegador para generar contenido; no hay una clave de IA de servidor configurada para ejecuciones automaticas sin navegador). Usa "Probar" o "Ejecutar ahora".',
      409,
    )
  }

  const { data: config } = await supabase
    .from('agent_configs')
    .select('*')
    .eq('agent_code', AGENT_CODE)
    .single()

  if (!config || !config.enabled) {
    throw new HttpError('El agente de noticias esta deshabilitado o no existe su configuracion.', 409)
  }

  const { data: sourceRows } = await supabase
    .from('cyber_news_sources')
    .select('id, name, url')
    .eq('enabled', true)
    .order('priority', { ascending: true })

  const sources = sourceRows ?? []
  if (sources.length === 0) {
    throw new HttpError('No hay fuentes activas configuradas en cyber_news_sources.', 422)
  }

  const { data: dojos } = await supabase
    .from('cyber_dojos')
    .select('id, name, theme, display_order')
    .eq('status', 'active')
    .order('display_order', { ascending: true })

  const { data: runRecord, error: runInsertError } = await supabase
    .from('agent_runs')
    .insert({
      agent_config_id: config.id,
      input_payload: { sources: sources.map((s) => s.url), dry_run: dryRun },
      triggered_by: body.triggered_by ?? requester,
    })
    .select()
    .single()

  if (runInsertError) throw runInsertError
  const runId = runRecord?.id ?? null

  const fetched = await Promise.all(sources.map((source) => fetchSource(source)))
  const okSources = fetched.filter((s) => s.ok && s.text)

  if (okSources.length === 0) {
    const message = `No se pudo obtener contenido de ninguna fuente. Errores: ${fetched.map((s) => `${s.name}: ${s.error}`).join(' | ')}`
    await failRun(runId, message)
    throw new HttpError(message, 502)
  }

  return jsonResponse({
    run_id: runId,
    dry_run: dryRun,
    prompt_template: config.prompt_template,
    sources_checked: sources.length,
    sources_ok: okSources.length,
    source_errors: fetched.filter((s) => !s.ok).map((s) => ({ name: s.name, url: s.url, error: s.error })),
    ai_payload: {
      sources: okSources.map((s) => ({ url: s.url, name: s.name, content: s.text })),
      dojos: (dojos ?? []).map((d) => ({ id: d.id, name: d.name, theme: d.theme })),
      instructions: {
        max_questions_per_run: (config.extra_settings as Record<string, unknown> | null)?.max_questions_per_run ?? 10,
        max_katas_per_run: (config.extra_settings as Record<string, unknown> | null)?.max_katas_per_run ?? 5,
        response_format: RESPONSE_FORMAT_SPEC,
      },
    },
    fetched_sources: fetched.map((s) => ({ url: s.url, name: s.name, ok: s.ok, error: s.error ?? null })),
  })
}

// Phase 4: the unattended path. Only pg_cron (via the shared x-cron-secret)
// may reach this — it fetches sources, runs the configurable per-agent
// provider fallback chain (Vault-backed keys, not Puter.js), and persists
// the result in one shot, since there's no browser to hand off to.
async function handleScheduled(requester: string) {
  if (requester !== 'scheduler') {
    throw new HttpError('La ejecucion "scheduled" solo puede ser invocada por el dispatcher de pg_cron.', 403)
  }

  const { data: config } = await supabase
    .from('agent_configs')
    .select('*')
    .eq('agent_code', AGENT_CODE)
    .single()

  if (!config || !config.enabled) {
    throw new HttpError('El agente de noticias esta deshabilitado.', 409)
  }

  const { data: sourceRows } = await supabase
    .from('cyber_news_sources')
    .select('id, name, url')
    .eq('enabled', true)
    .order('priority', { ascending: true })

  const sources = sourceRows ?? []
  if (sources.length === 0) {
    throw new HttpError('No hay fuentes activas configuradas.', 422)
  }

  const { data: dojos } = await supabase
    .from('cyber_dojos')
    .select('id, name, theme, display_order')
    .eq('status', 'active')
    .order('display_order', { ascending: true })

  const { data: runRecord, error: runInsertError } = await supabase
    .from('agent_runs')
    .insert({
      agent_config_id: config.id,
      input_payload: { sources: sources.map((s) => s.url), dry_run: false, trigger: 'scheduled' },
      triggered_by: 'pg_cron',
    })
    .select()
    .single()

  if (runInsertError) throw runInsertError
  const runId = runRecord?.id ?? null

  const fetched = await Promise.all(sources.map((source) => fetchSource(source)))
  const okSources = fetched.filter((s) => s.ok && s.text)
  const fetchedSources = fetched.map((s) => ({ url: s.url, name: s.name, ok: s.ok, error: s.error ?? null }))

  if (okSources.length === 0) {
    const message = `No se pudo obtener contenido de ninguna fuente. Errores: ${fetched.map((s) => `${s.name}: ${s.error}`).join(' | ')}`
    await failRun(runId, message)
    return jsonResponse({ run_id: runId, error: message }, 502)
  }

  const aiPayload = {
    sources: okSources.map((s) => ({ url: s.url, name: s.name, content: s.text })),
    dojos: (dojos ?? []).map((d) => ({ id: d.id, name: d.name, theme: d.theme })),
    instructions: {
      max_questions_per_run: (config.extra_settings as Record<string, unknown> | null)?.max_questions_per_run ?? 10,
      max_katas_per_run: (config.extra_settings as Record<string, unknown> | null)?.max_katas_per_run ?? 5,
      response_format: RESPONSE_FORMAT_SPEC,
    },
  }

  let chainResult: { content: string; providerKey: string; attempts: ProviderAttempt[] }
  try {
    chainResult = await runProviderChain(config.id, config.prompt_template, aiPayload)
  } catch (error) {
    const chainError = error instanceof ProviderChainError ? error : null
    const attempts = chainError?.attempts ?? []
    const message = attempts.length > 0
      ? `Todos los proveedores de IA fallaron: ${attempts.map((a) => `${a.provider_key}(${a.status}: ${a.error ?? 'sin detalle'})`).join(' || ')}`
      : (error as Error).message
    await supabase.from('agent_runs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: message,
      summary: `Error: ${message}`,
      output_payload: { sources: fetchedSources, attempts },
    }).eq('id', runId)
    return jsonResponse({ run_id: runId, error: message, attempts }, 502)
  }

  return await persistAndComplete({
    runId,
    dryRun: false,
    aiContent: chainResult.content,
    providerKey: chainResult.providerKey,
    fetchedSources,
    attempts: chainResult.attempts,
  })
}

async function handleComplete(body: Record<string, unknown>) {
  const runId = typeof body.run_id === 'string' ? body.run_id : null
  if (!runId) throw new HttpError('Falta run_id', 400)

  const dryRun = Boolean(body.dry_run)
  const aiContent = typeof body.ai_content === 'string' ? body.ai_content : ''
  const providerKey = typeof body.provider_key === 'string' ? body.provider_key : 'puter'
  const fetchedSources = Array.isArray(body.fetched_sources) ? body.fetched_sources as Array<Record<string, unknown>> : []

  if (typeof body.ai_error === 'string' && body.ai_error) {
    await failRun(runId, `Puter.js AI fallo: ${body.ai_error}`)
    return jsonResponse({ run_id: runId, error: body.ai_error }, 502)
  }

  return await persistAndComplete({ runId, dryRun, aiContent, providerKey, fetchedSources })
}

async function persistAndComplete(params: {
  runId: string
  dryRun: boolean
  aiContent: string
  providerKey: string
  fetchedSources: Array<Record<string, unknown>>
  attempts?: ProviderAttempt[]
}) {
  const { runId, dryRun, aiContent, providerKey, fetchedSources, attempts } = params
  const parsed = (() => {
    try {
      return parseJsonResponse(aiContent)
    } catch {
      return { generated_questions: [], generated_katas: [] }
    }
  })()
  const generatedQuestions = Array.isArray(parsed.generated_questions) ? parsed.generated_questions as GeneratedQuestion[] : []
  const generatedKatas = Array.isArray(parsed.generated_katas) ? parsed.generated_katas as GeneratedKata[] : []

  const extractedAt = new Date().toISOString()
  const insertedQuestionIds = dryRun ? [] : await insertGeneratedContent({ generatedQuestions, generatedKatas, extractedAt })

  const sourcesOkCount = fetchedSources.filter((s) => s.ok).length
  const summary = dryRun
    ? `Prueba: ${sourcesOkCount}/${fetchedSources.length} fuentes leidas, ${generatedQuestions.length} preguntas y ${generatedKatas.length} katas generadas (sin guardar).`
    : `${sourcesOkCount}/${fetchedSources.length} fuentes leidas. ${insertedQuestionIds.length} preguntas/casos guardados como pendientes de revision.`

  await supabase
    .from('agent_runs')
    .update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      summary,
      output_payload: {
        dry_run: dryRun,
        provider_key: providerKey,
        sources: fetchedSources,
        generated_questions: generatedQuestions.map((q) => ({
          dojo_id: q.dojo_id ?? null,
          question_text: q.question_text,
          answer_text: q.answer_text,
          source_url: q.source_url,
          source_title: q.source_title ?? null,
        })),
        generated_katas: generatedKatas.map((k) => ({
          dojo_id: k.dojo_id ?? null,
          title: k.title,
          source_url: k.source_url,
          source_title: k.source_title ?? null,
          case_count: k.cases.length,
        })),
        extracted_at: extractedAt,
        question_ids: insertedQuestionIds,
        attempts: attempts ?? null,
      },
    })
    .eq('id', runId)

  if (!dryRun) {
    const { data: runRow } = await supabase.from('agent_runs').select('agent_config_id').eq('id', runId).single()
    if (runRow?.agent_config_id) {
      await supabase.from('agent_configs').update({ last_run_at: new Date().toISOString() }).eq('id', runRow.agent_config_id)
    }
  }

  return jsonResponse({
    run_id: runId,
    dry_run: dryRun,
    provider_key: providerKey,
    generated_questions: generatedQuestions.length,
    generated_katas: generatedKatas.length,
    question_ids: insertedQuestionIds,
    summary,
  })
}

async function failRun(runId: string | null, message: string) {
  if (!runId) return
  await supabase
    .from('agent_runs')
    .update({ status: 'failed', finished_at: new Date().toISOString(), error_message: message, summary: `Error: ${message}` })
    .eq('id', runId)
}
