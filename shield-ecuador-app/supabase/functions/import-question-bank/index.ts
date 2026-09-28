// Admin uploads a file that supposedly already contains multiple-choice
// cybersecurity questions (a curated bank, a document, a spreadsheet). This
// function does NOT generate new quiz content the way quiz-generator does —
// it extracts what the file already says and has the AI validate each item
// before anything can ever reach a learner: is it really about
// cybersecurity, is the language accessible to a non-technical reader, and
// which option is actually correct (checked independently, not just trusted
// from the file). Everything lands as audit_status='pending', active=false
// — nothing here activates a question. The admin panel shows the per-item
// flags this returns so a human can fix or pause each one; only the
// existing approve flow (audit-generated-questions, or a manual "Aprobar")
// ever sets active=true.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from 'https://esm.sh/zod@3.23.8'
import {
  corsHeaders,
  supabase,
  runProviderChain,
  ProviderChainError,
  parseJsonResponse,
  requireAdminOrScheduler,
  HttpError,
  getStatus,
  jsonResponse,
  extractTextFromFile,
  isImageFile,
  shuffleOptions,
} from '../_shared/news-agent-core.ts'

const UPLOADS_BUCKET = 'news-agent-uploads'
const AGENT_CODE = 'question-bank-importer'
const MAX_FILE_BYTES = 5 * 1024 * 1024

const ImportedOptionSchema = z.object({
  texto: z.string().min(1),
  correcta: z.boolean(),
})

const ImportedQuestionSchema = z.object({
  dojo_id: z.string().optional(),
  question_text: z.string().min(1),
  options: z.array(ImportedOptionSchema).min(4).max(4),
  explanation: z.string().optional().default(''),
  topic_ok: z.boolean(),
  language_ok: z.boolean(),
  answer_confident: z.boolean(),
  issues: z.array(z.string()).default([]),
})

const ImportResponseSchema = z.object({
  questions: z.array(ImportedQuestionSchema).default([]),
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requireAdminOrScheduler(req)
    const body = await req.json().catch(() => ({}))
    return await handleImport(body)
  } catch (error) {
    const message = (error as Error).message
    console.error('Error in import-question-bank:', error)
    return jsonResponse({ error: message }, getStatus(error))
  }
})

async function handleImport(body: Record<string, unknown>) {
  const filePath = typeof body.file_path === 'string' ? body.file_path.trim() : ''
  if (!filePath) {
    throw new HttpError('Falta "file_path": la ruta del archivo ya subido al bucket de uploads.', 400)
  }
  if (isImageFile(filePath)) {
    throw new HttpError('Sube un documento de texto (.txt, .md, .csv, .json, .pdf o .docx); las preguntas no se leen desde imágenes.', 400)
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from(UPLOADS_BUCKET).download(filePath)
  if (downloadError || !fileBlob) {
    throw new HttpError(`No se pudo leer el archivo subido "${filePath}": ${downloadError?.message ?? 'no encontrado'}`, 400)
  }
  if (fileBlob.size > MAX_FILE_BYTES) {
    throw new HttpError(`El archivo pesa ${(fileBlob.size / 1048576).toFixed(1)} MB; el máximo es ${MAX_FILE_BYTES / 1048576} MB.`, 400)
  }

  const bytes = new Uint8Array(await fileBlob.arrayBuffer())
  let content: string
  try {
    content = await extractTextFromFile(bytes, filePath)
  } catch (error) {
    throw new HttpError((error as Error).message, 400)
  }
  if (!content.trim()) {
    throw new HttpError(`El archivo "${filePath}" no tiene texto extraíble.`, 400)
  }

  const { data: config } = await supabase.from('agent_configs').select('*').eq('agent_code', AGENT_CODE).single()
  if (!config || !config.enabled) {
    throw new HttpError('El agente importador de preguntas está deshabilitado o no existe.', 503)
  }

  const { data: dojoRows } = await supabase
    .from('cyber_dojos')
    .select('id, name, theme')
    .eq('status', 'active')
    .order('display_order', { ascending: true })
  const dojos = (dojoRows ?? []).map((d) => ({ id: d.id, name: d.name, theme: d.theme }))

  const { data: runRecord, error: runInsertError } = await supabase
    .from('agent_runs')
    .insert({
      agent_config_id: config.id,
      input_payload: { file_path: filePath, trigger: 'manual_question_import' },
      triggered_by: 'question_bank_importer',
    })
    .select()
    .single()
  if (runInsertError) throw runInsertError
  const runId = runRecord?.id ?? null

  const aiPayload = { content, dojos }

  let chainResult: { content: string; providerKey: string }
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
    }).eq('id', runId)
    return jsonResponse({ run_id: runId, error: message }, 502)
  }

  let rawParsed: unknown
  try {
    rawParsed = parseJsonResponse(chainResult.content)
  } catch {
    await supabase.from('agent_runs').update({
      status: 'partial',
      finished_at: new Date().toISOString(),
      summary: 'La respuesta del proveedor de IA no es JSON válido.',
      output_payload: { raw_output: chainResult.content },
    }).eq('id', runId)
    return jsonResponse({ run_id: runId, error: 'La IA no devolvió un resultado que se pueda leer. Intenta de nuevo o revisa el archivo.' }, 502)
  }

  const validation = ImportResponseSchema.safeParse(rawParsed)
  if (!validation.success) {
    const errors = validation.error.issues.map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    await supabase.from('agent_runs').update({
      status: 'partial',
      finished_at: new Date().toISOString(),
      summary: `Formato inválido (${errors.length} error(es)).`,
      output_payload: { raw_output: chainResult.content, validation_errors: errors },
    }).eq('id', runId)
    return jsonResponse({ run_id: runId, error: 'La IA devolvió un formato inesperado. Intenta de nuevo.', validation_errors: errors }, 502)
  }

  const { questions } = validation.data
  const now = new Date().toISOString()
  const imported: Array<Record<string, unknown>> = []
  let orderCounter = Date.now() % 100000

  for (const item of questions) {
    const correctCount = item.options.filter((o) => o.correcta).length
    let options = item.options
    let answerConfident = item.answer_confident
    const issues = [...item.issues]

    if (correctCount !== 1) {
      // The model didn't settle on exactly one correct option — never guess silently:
      // keep the first as a placeholder correct answer but flag it so a human decides.
      options = options.map((o, index) => ({ ...o, correcta: index === 0 }))
      answerConfident = false
      issues.push(correctCount === 0
        ? 'La IA no marcó ninguna opción como correcta; revisa cuál lo es.'
        : 'La IA marcó más de una opción como correcta; revisa cuál es la real.')
    }

    const letters = ['A', 'B', 'C', 'D']
    // Uploaded files (and the model extracting them) both tend to list the correct option first —
    // shuffle before assigning A/B/C/D so the published question doesn't inherit that pattern.
    const optionsPayload = shuffleOptions(options).map((o, index) => ({ valor: letters[index], texto: o.texto, correcta: o.correcta }))
    const correctOption = optionsPayload.find((o) => o.correcta)

    const notesParts = [
      `Tema de ciberseguridad: ${item.topic_ok ? 'OK' : 'REVISAR'}.`,
      `Lenguaje accesible: ${item.language_ok ? 'OK' : 'REVISAR'}.`,
      `Respuesta correcta: ${answerConfident ? 'identificada por la IA' : 'incierta, revisar'}.`,
    ]
    if (issues.length) notesParts.push(`Problemas: ${issues.join(' · ')}`)

    const id = `upload-${orderCounter}-${Math.random().toString(36).slice(2, 6)}`
    orderCounter += 1

    const row = {
      id,
      branch: item.dojo_id ?? null,
      dojo_id: item.dojo_id ?? null,
      order_num: orderCounter,
      question_text: item.question_text,
      question_type: 'escenario',
      options: optionsPayload,
      active: false,
      source_type: 'manual_upload',
      audit_status: 'pending',
      answer_text: correctOption?.texto ?? '',
      explanation: item.explanation || '',
      audit_notes: notesParts.join(' '),
      extracted_at: now,
      editable: true,
    }

    const { error } = await supabase.from('questions').insert(row)
    if (error) {
      console.error('No se pudo insertar pregunta importada:', error)
      continue
    }

    imported.push({
      id,
      dojo_id: row.dojo_id,
      question_text: row.question_text,
      options: optionsPayload,
      explanation: row.explanation,
      topic_ok: item.topic_ok,
      language_ok: item.language_ok,
      answer_confident: answerConfident,
      issues,
    })
  }

  const summary = `${imported.length} pregunta(s) extraídas de "${filePath}" y guardadas como pendientes de revisión.`
  await supabase.from('agent_runs').update({
    status: 'completed',
    finished_at: new Date().toISOString(),
    summary,
    output_payload: {
      provider_key: chainResult.providerKey,
      file_path: filePath,
      imported_count: imported.length,
      question_ids: imported.map((q) => q.id),
    },
  }).eq('id', runId)

  return jsonResponse({ run_id: runId, provider_key: chainResult.providerKey, imported, summary })
}
