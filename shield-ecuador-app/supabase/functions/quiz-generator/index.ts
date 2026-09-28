// Phase 5: on-demand quiz generation, decoupled from run-news-agent's
// per-cycle fetch+generate. Takes an already-extracted sources payload (the
// admin UI supplies it — e.g. content fetched earlier via run-news-agent's
// "prepare" action, or pasted/curated by hand) and only does the AI
// generation step, through the same Vault-backed provider fallback chain.
//
// Per the plan: the LLM's output is validated against a schema before
// anything touches the database. A provider can return malformed or
// incomplete JSON even on a 200 — when that happens this does NOT crash and
// does NOT silently drop the run; it persists agent_runs.status='partial'
// with the raw output and the specific validation errors, so a human can see
// exactly what the AI produced and why it wasn't accepted.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from 'https://esm.sh/zod@3.23.8'
import {
  corsHeaders,
  supabase,
  RESPONSE_FORMAT_SPEC,
  ProviderAttempt,
  ProviderChainError,
  ImageAttachment,
  runProviderChain,
  insertGeneratedContent,
  parseJsonResponse,
  requireAdminOrScheduler,
  HttpError,
  getStatus,
  jsonResponse,
  fetchSource,
  extractTextFromFile,
  isImageFile,
} from '../_shared/news-agent-core.ts'

const UPLOADS_BUCKET = 'news-agent-uploads'

const DEFAULT_AGENT_CODE = 'ciber-dojo-news-agent'

const GeneratedQuestionSchema = z.object({
  dojo_id: z.string().optional(),
  question_text: z.string().min(1),
  answer_text: z.string().min(1),
  wrong_answers: z.array(z.string()).optional(),
  explanation: z.string().min(1),
  difficulty: z.union([z.number(), z.string()]).optional(),
  source_url: z.string().min(1),
  source_title: z.string().optional(),
})

const GeneratedKataCaseSchema = z.object({
  question_text: z.string().min(1),
  answer_text: z.string().min(1),
  wrong_answers: z.array(z.string()).optional(),
  explanation: z.string().min(1),
  difficulty: z.union([z.number(), z.string()]).optional(),
})

const GeneratedKataSchema = z.object({
  dojo_id: z.string().optional(),
  title: z.string().min(1),
  source_url: z.string().min(1),
  source_title: z.string().optional(),
  cases: z.array(GeneratedKataCaseSchema).min(1),
})

const AiResponseSchema = z.object({
  generated_questions: z.array(GeneratedQuestionSchema).default([]),
  generated_katas: z.array(GeneratedKataSchema).default([]),
})

interface ExtractedSource {
  url: string
  name: string
  content: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requireAdminOrScheduler(req)
    const body = await req.json().catch(() => ({}))
    return await handleGenerate(body)
  } catch (error) {
    const message = (error as Error).message
    console.error('Error in quiz-generator:', error)
    return jsonResponse({ error: message }, getStatus(error))
  }
})

async function handleGenerate(body: Record<string, unknown>) {
  const { textSources: sources, images } = await resolveSources(body.sources)
  const dryRun = Boolean(body.dry_run)

  const agentConfigId = typeof body.agent_config_id === 'string' ? body.agent_config_id : null
  const configQuery = supabase.from('agent_configs').select('*')
  const { data: config } = agentConfigId
    ? await configQuery.eq('id', agentConfigId).single()
    : await configQuery.eq('agent_code', DEFAULT_AGENT_CODE).single()

  if (!config) {
    throw new HttpError('No se encontro la configuracion del agente indicado.', 404)
  }

  let dojos = Array.isArray(body.dojos) ? body.dojos as Array<{ id: string; name: string; theme?: string }> : null
  if (!dojos) {
    const { data: dojoRows } = await supabase
      .from('cyber_dojos')
      .select('id, name, theme, display_order')
      .eq('status', 'active')
      .order('display_order', { ascending: true })
    dojos = (dojoRows ?? []).map((d) => ({ id: d.id, name: d.name, theme: d.theme }))
  }

  const extraSettings = config.extra_settings as Record<string, unknown> | null
  const maxQuestions = typeof body.max_questions_per_run === 'number' ? body.max_questions_per_run : extraSettings?.max_questions_per_run ?? 10
  const maxKatas = typeof body.max_katas_per_run === 'number' ? body.max_katas_per_run : extraSettings?.max_katas_per_run ?? 5

  const { data: runRecord, error: runInsertError } = await supabase
    .from('agent_runs')
    .insert({
      agent_config_id: config.id,
      input_payload: { sources: sources.map((s) => s.url), dry_run: dryRun, trigger: 'manual_quiz_generator' },
      triggered_by: 'quiz_generator',
    })
    .select()
    .single()

  if (runInsertError) throw runInsertError
  const runId = runRecord?.id ?? null

  const aiPayload = {
    sources: sources.map((s) => ({ url: s.url, name: s.name, content: s.content })),
    dojos,
    instructions: {
      max_questions_per_run: maxQuestions,
      max_katas_per_run: maxKatas,
      response_format: RESPONSE_FORMAT_SPEC,
    },
  }

  let chainResult: { content: string; providerKey: string; attempts: ProviderAttempt[] }
  try {
    chainResult = await runProviderChain(config.id, config.prompt_template, aiPayload, images)
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
      output_payload: { sources: sources.map((s) => s.url), attempts },
    }).eq('id', runId)
    return jsonResponse({ run_id: runId, error: message, attempts }, 502)
  }

  return await validateAndPersist({ runId, dryRun, chainResult, sourceUrls: sources.map((s) => s.url) })
}

async function validateAndPersist(params: {
  runId: string
  dryRun: boolean
  chainResult: { content: string; providerKey: string; attempts: ProviderAttempt[] }
  sourceUrls: string[]
}) {
  const { runId, dryRun, chainResult, sourceUrls } = params

  let rawParsed: unknown
  try {
    rawParsed = parseJsonResponse(chainResult.content)
  } catch {
    return await persistPartial({
      runId,
      providerKey: chainResult.providerKey,
      attempts: chainResult.attempts,
      sourceUrls,
      rawOutput: chainResult.content,
      validationErrors: ['La respuesta del proveedor de IA no es JSON valido.'],
    })
  }

  const validation = AiResponseSchema.safeParse(rawParsed)
  if (!validation.success) {
    return await persistPartial({
      runId,
      providerKey: chainResult.providerKey,
      attempts: chainResult.attempts,
      sourceUrls,
      rawOutput: chainResult.content,
      validationErrors: validation.error.issues.map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`),
    })
  }

  const { generated_questions: generatedQuestions, generated_katas: generatedKatas } = validation.data
  const extractedAt = new Date().toISOString()
  const insertedQuestionIds = dryRun ? [] : await insertGeneratedContent({ generatedQuestions, generatedKatas, extractedAt })

  const summary = dryRun
    ? `Prueba: ${generatedQuestions.length} preguntas y ${generatedKatas.length} katas generadas desde contenido ya extraido (sin guardar).`
    : `${insertedQuestionIds.length} preguntas/casos guardados como pendientes de revision (generacion on-demand).`

  await supabase
    .from('agent_runs')
    .update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      summary,
      output_payload: {
        dry_run: dryRun,
        provider_key: chainResult.providerKey,
        validation_status: 'valid',
        sources: sourceUrls,
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
        attempts: chainResult.attempts,
      },
    })
    .eq('id', runId)

  return jsonResponse({
    run_id: runId,
    dry_run: dryRun,
    provider_key: chainResult.providerKey,
    validation_status: 'valid',
    generated_questions: generatedQuestions.length,
    generated_katas: generatedKatas.length,
    question_ids: insertedQuestionIds,
    summary,
  })
}

// Validation failed: the AI call itself succeeded (we have a provider_key and
// a 200 from it), but its output doesn't match the required shape. This is a
// content-quality outcome, not an infrastructure failure — persisted as
// 'partial' with the raw text preserved so a human can inspect or retry,
// never silently dropped and never thrown as an unhandled error.
async function persistPartial(params: {
  runId: string
  providerKey: string
  attempts: ProviderAttempt[]
  sourceUrls: string[]
  rawOutput: string
  validationErrors: string[]
}) {
  const { runId, providerKey, attempts, sourceUrls, rawOutput, validationErrors } = params
  const summary = `El proveedor ${providerKey} respondio pero el contenido no paso la validacion de formato (${validationErrors.length} error(es)).`

  await supabase
    .from('agent_runs')
    .update({
      status: 'partial',
      finished_at: new Date().toISOString(),
      summary,
      output_payload: {
        provider_key: providerKey,
        validation_status: 'invalid',
        validation_errors: validationErrors,
        raw_output: rawOutput,
        sources: sourceUrls,
        attempts,
      },
    })
    .eq('id', runId)

  return jsonResponse({
    run_id: runId,
    provider_key: providerKey,
    validation_status: 'invalid',
    validation_errors: validationErrors,
    summary,
  })
}

// Each raw source item supplies content one of three ways (checked in this
// order): already-extracted text (`content`, the original "extracted
// payload" contract), an uploaded file (`file_path`, a path in the
// news-agent-uploads Storage bucket — text formats get extracted server-side,
// image formats are kept as bytes and attached directly to the AI call
// instead of OCR'd), or a bare URL to fetch server-side (reusing the same
// fetch+strip-html logic run-news-agent uses for its configured sources).
async function resolveSources(value: unknown): Promise<{ textSources: ExtractedSource[]; images: ImageAttachment[] }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError('Falta "sources": un arreglo con al menos un elemento ({content} o {file_path} o {url}).', 400)
  }

  const textSources: ExtractedSource[] = []
  const images: ImageAttachment[] = []

  for (const [index, item] of (value as unknown[]).entries()) {
    const record = item as Record<string, unknown>
    const label = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : `Fuente ${index + 1}`
    const url = typeof record.url === 'string' && record.url.trim() ? record.url.trim() : label

    if (typeof record.content === 'string' && record.content.trim()) {
      textSources.push({ url, name: label, content: record.content })
      continue
    }

    if (typeof record.file_path === 'string' && record.file_path.trim()) {
      const filePath = record.file_path.trim()
      const imageMimeType = isImageFile(filePath)

      const { data: fileBlob, error: downloadError } = await supabase.storage.from(UPLOADS_BUCKET).download(filePath)
      if (downloadError || !fileBlob) {
        throw new HttpError(`No se pudo leer el archivo subido "${filePath}": ${downloadError?.message ?? 'no encontrado'}`, 400)
      }
      const bytes = new Uint8Array(await fileBlob.arrayBuffer())

      if (imageMimeType) {
        images.push({ data: encodeBase64(bytes), mimeType: imageMimeType })
        // The LLM still needs a citable url/name for this material even
        // though its actual content arrives as an attached image, not text.
        textSources.push({ url, name: label, content: `[Imagen adjunta: ${label}. Analiza la imagen adjunta a este mensaje para el contenido de esta fuente.]` })
        continue
      }

      let extracted: string
      try {
        extracted = await extractTextFromFile(bytes, filePath)
      } catch (error) {
        throw new HttpError(`No se pudo extraer texto de "${filePath}": ${(error as Error).message}`, 400)
      }
      if (!extracted.trim()) {
        throw new HttpError(`El archivo "${filePath}" no tiene texto extraible.`, 400)
      }
      textSources.push({ url, name: label, content: extracted })
      continue
    }

    if (typeof record.url === 'string' && record.url.trim()) {
      const fetched = await fetchSource({ url: record.url.trim(), name: label })
      if (!fetched.ok || !fetched.text) {
        throw new HttpError(`No se pudo obtener contenido de la URL "${record.url}": ${fetched.error ?? 'sin contenido'}`, 400)
      }
      textSources.push({ url: fetched.url, name: label, content: fetched.text })
      continue
    }

    throw new HttpError(`sources[${index}] necesita "content", "file_path" o "url".`, 400)
  }

  if (textSources.length === 0 && images.length === 0) {
    throw new HttpError('No se pudo obtener contenido de ninguna fuente proporcionada.', 400)
  }

  return { textSources, images }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}
