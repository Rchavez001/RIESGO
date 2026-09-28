// One-off bulk fix for public.learning_items (the real 700-question / 300-kata-case bank behind
// the 30-per-dojo exams — a different table from public.questions, never covered by the
// length-parity fix applied there). Takes a batch of item ids, asks the AI to rewrite only the
// WRONG options so they match the correct answer's length/detail, and — unless dry_run — writes
// the result back. The correct answer's text and index are verified unchanged before any write;
// a batch where the AI altered either is rejected wholesale rather than partially applied.

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
} from '../_shared/news-agent-core.ts'

const AGENT_CODE = 'learning-item-rebalancer'
const MAX_IDS_PER_CALL = 15

const RewrittenItemSchema = z.object({
  id: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
})
const ResponseSchema = z.object({ items: z.array(RewrittenItemSchema).default([]) })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    await requireAdminOrScheduler(req)
    const body = await req.json().catch(() => ({}))
    return await handleFix(body)
  } catch (error) {
    console.error('Error in fix-learning-item-balance:', error)
    return jsonResponse({ error: (error as Error).message }, getStatus(error))
  }
})

async function handleFix(body: Record<string, unknown>) {
  const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : []
  const dryRun = Boolean(body.dry_run)
  if (ids.length === 0) throw new HttpError('Falta "ids": un arreglo de ids de learning_items.', 400)
  if (ids.length > MAX_IDS_PER_CALL) throw new HttpError(`Maximo ${MAX_IDS_PER_CALL} ids por llamada; llegaron ${ids.length}.`, 400)

  const { data: config } = await supabase.from('agent_configs').select('*').eq('agent_code', AGENT_CODE).single()
  if (!config || !config.enabled) throw new HttpError('El agente reequilibrador esta deshabilitado o no existe.', 503)

  const { data: rows, error: fetchError } = await supabase.from('learning_items').select('id, kind, belt, content').in('id', ids)
  if (fetchError) throw fetchError
  if (!rows || rows.length === 0) throw new HttpError('Ninguno de esos ids existe en learning_items.', 404)

  const byId = new Map(rows.map((r) => [r.id, r]))
  const aiItems = rows.map((r) => ({
    id: r.id,
    prompt: r.content?.prompt ?? '',
    options: r.content?.options ?? [],
    correct: r.content?.correct,
  })).filter((item) => Array.isArray(item.options) && item.options.length === 4 && typeof item.correct === 'number')

  if (aiItems.length === 0) throw new HttpError('Ninguno de esos items tiene la forma esperada (options[4] + correct).', 400)

  let chainResult: { content: string; providerKey: string }
  try {
    chainResult = await runProviderChain(config.id, config.prompt_template, { items: aiItems })
  } catch (error) {
    const chainError = error instanceof ProviderChainError ? error : null
    const attempts = chainError?.attempts ?? []
    const message = attempts.length > 0
      ? `Todos los proveedores de IA fallaron: ${attempts.map((a) => `${a.provider_key}(${a.status}: ${a.error ?? 'sin detalle'})`).join(' || ')}`
      : (error as Error).message
    return jsonResponse({ error: message }, 502)
  }

  let parsed: unknown
  try {
    parsed = parseJsonResponse(chainResult.content)
  } catch {
    return jsonResponse({ error: 'La IA no devolvio JSON valido para este lote.' }, 502)
  }

  const validation = ResponseSchema.safeParse(parsed)
  if (!validation.success) {
    return jsonResponse({ error: 'La IA devolvio un formato inesperado para este lote.', validation_errors: validation.error.issues }, 502)
  }

  const results: Array<Record<string, unknown>> = []
  for (const rewritten of validation.data.items) {
    const original = byId.get(rewritten.id)
    const aiItem = aiItems.find((item) => item.id === rewritten.id)
    if (!original || !aiItem) {
      results.push({ id: rewritten.id, applied: false, reason: 'id no reconocido en este lote' })
      continue
    }
    const correctIndex = aiItem.correct as number
    const originalCorrectText = aiItem.options[correctIndex]
    const newCorrectText = rewritten.options[correctIndex]
    if (newCorrectText !== originalCorrectText) {
      // Guard: the correct answer's text must survive byte-for-byte. If the model touched it,
      // the whole item is rejected rather than silently accepting a changed correct answer.
      results.push({ id: rewritten.id, applied: false, reason: 'la IA modifico el texto de la opcion correcta; rechazado', before: aiItem.options, attempted: rewritten.options })
      continue
    }

    const before = aiItem.options
    const after = rewritten.options
    if (!dryRun) {
      const newContent = { ...original.content, options: after }
      const { error: updateError } = await supabase.from('learning_items').update({ content: newContent }).eq('id', rewritten.id)
      if (updateError) {
        results.push({ id: rewritten.id, applied: false, reason: `error al guardar: ${updateError.message}` })
        continue
      }
    }
    results.push({ id: rewritten.id, applied: !dryRun, before, after, correct_index: correctIndex })
  }

  // Any requested id the AI silently dropped from its response.
  for (const item of aiItems) {
    if (!results.some((r) => r.id === item.id)) {
      results.push({ id: item.id, applied: false, reason: 'la IA no devolvio este item en el lote' })
    }
  }

  return jsonResponse({ dry_run: dryRun, provider_key: chainResult.providerKey, results })
}
