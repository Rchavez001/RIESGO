// RF-18/RF-19: turns a real incident (a security_event or security_diagnosis)
// into training material, gated behind borrador -> en_revision -> publicado,
// each transition its own explicit admin action — nothing here ever
// auto-advances a draft, satisfying "requiere aprobacion humana".
//
// Publishing writes a real row into the existing `questions` table (the
// same one the news agent and manual question editor write to) instead of
// inventing a second, parallel place kata content can live — a published
// security kata is indistinguishable from any other kata question to the
// rest of the app.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  corsHeaders,
  supabase,
  requireAdminOrScheduler,
  HttpError,
  getStatus,
  jsonResponse,
} from '../_shared/news-agent-core.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const actor = await requireAdminOrScheduler(req)
    const body = await req.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : 'create'

    if (action === 'create') return await handleCreate(body, actor)
    if (action === 'update') return await handleUpdate(body)
    if (action === 'submit_review') return await handleSubmitReview(body)
    if (action === 'reject') return await handleReject(body)
    if (action === 'publish') return await handlePublish(body, actor)
    throw new HttpError(`Accion desconocida: ${action}`, 400)
  } catch (error) {
    console.error('Error in security-kata-convert:', error)
    return jsonResponse({ error: (error as Error).message }, getStatus(error))
  }
})

async function handleCreate(body: Record<string, unknown>, actor: string) {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const bodyMd = typeof body.body_md === 'string' ? body.body_md.trim() : ''
  if (!title) throw new HttpError('Falta "title".', 400)
  if (!bodyMd) throw new HttpError('Falta "body_md".', 400)

  const { data: saved, error } = await supabase.from('security_kata_drafts').insert({
    title,
    body_md: bodyMd,
    source_diagnosis_id: typeof body.source_diagnosis_id === 'string' ? body.source_diagnosis_id : null,
    source_event_id: typeof body.source_event_id === 'string' ? body.source_event_id : null,
    created_by: actor,
    status: 'borrador',
  }).select().single()
  if (error) throw error
  return jsonResponse({ draft: saved })
}

async function handleUpdate(body: Record<string, unknown>) {
  const id = requireId(body)
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const bodyMd = typeof body.body_md === 'string' ? body.body_md.trim() : ''
  if (!title) throw new HttpError('Falta "title".', 400)
  if (!bodyMd) throw new HttpError('Falta "body_md".', 400)

  const { data: draft } = await supabase.from('security_kata_drafts').select('status').eq('id', id).maybeSingle()
  if (!draft) throw new HttpError('No se encontro el borrador.', 404)
  if (draft.status !== 'borrador') throw new HttpError('Solo se puede editar un borrador en estado "borrador".', 400)

  const { data: saved, error } = await supabase.from('security_kata_drafts')
    .update({ title, body_md: bodyMd, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return jsonResponse({ draft: saved })
}

async function handleSubmitReview(body: Record<string, unknown>) {
  const id = requireId(body)
  const { data: draft } = await supabase.from('security_kata_drafts').select('status').eq('id', id).maybeSingle()
  if (!draft) throw new HttpError('No se encontro el borrador.', 404)
  if (draft.status !== 'borrador') throw new HttpError(`No se puede enviar a revision desde el estado "${draft.status}".`, 400)

  const { data: saved, error } = await supabase.from('security_kata_drafts')
    .update({ status: 'en_revision', updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return jsonResponse({ draft: saved })
}

async function handleReject(body: Record<string, unknown>) {
  const id = requireId(body)
  const { data: draft } = await supabase.from('security_kata_drafts').select('status').eq('id', id).maybeSingle()
  if (!draft) throw new HttpError('No se encontro el borrador.', 404)
  if (draft.status !== 'en_revision') throw new HttpError(`No se puede rechazar desde el estado "${draft.status}".`, 400)

  const { data: saved, error } = await supabase.from('security_kata_drafts')
    .update({ status: 'borrador', updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return jsonResponse({ draft: saved })
}

async function handlePublish(body: Record<string, unknown>, actor: string) {
  const id = requireId(body)
  const dojoId = typeof body.dojo_id === 'string' ? body.dojo_id : ''
  const questionText = typeof body.question_text === 'string' ? body.question_text.trim() : ''
  const answerText = typeof body.answer_text === 'string' ? body.answer_text.trim() : ''
  const explanation = typeof body.explanation === 'string' ? body.explanation.trim() : ''
  const kataLabel = typeof body.kata_label === 'string' && body.kata_label.trim() ? body.kata_label.trim() : 'Kata 1'
  const difficulty = Number(body.difficulty) || 1
  if (!dojoId) throw new HttpError('Falta "dojo_id" para publicar.', 400)
  if (!questionText || !answerText || !explanation) throw new HttpError('Faltan question_text, answer_text o explanation para publicar.', 400)

  const { data: draft } = await supabase.from('security_kata_drafts').select('status, title').eq('id', id).maybeSingle()
  if (!draft) throw new HttpError('No se encontro el borrador.', 404)
  if (draft.status !== 'en_revision') throw new HttpError(`Solo se puede publicar desde "en_revision" (estado actual: "${draft.status}").`, 400)

  const wrongAnswers = [
    'Ignorar la alerta y continuar operando igual',
    'Compartir credenciales para resolver mas rapido',
    'Desactivar controles de seguridad temporalmente',
  ]
  const options = [
    { valor: 'A', texto: answerText, correcta: true },
    { valor: 'B', texto: wrongAnswers[0], correcta: false },
    { valor: 'C', texto: wrongAnswers[1], correcta: false },
    { valor: 'D', texto: wrongAnswers[2], correcta: false },
  ]

  const { data: question, error: questionError } = await supabase.from('questions').insert({
    id: crypto.randomUUID(),
    branch: dojoId,
    dojo_id: dojoId,
    question_text: questionText,
    question_type: 'escenario',
    options,
    active: true,
    source_type: 'incident_kata',
    audit_status: 'approved',
    difficulty,
    kata_label: kataLabel,
    answer_text: answerText,
    explanation,
    editable: true,
  }).select().single()
  if (questionError) throw new Error(`No se pudo crear la pregunta: ${questionError.message}`)

  const { data: saved, error } = await supabase.from('security_kata_drafts')
    .update({
      status: 'publicado',
      reviewed_by: actor,
      published_question_id: question.id,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id).select().single()
  if (error) throw error
  return jsonResponse({ draft: saved, question })
}

function requireId(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) throw new HttpError('Falta "id".', 400)
  return id
}
