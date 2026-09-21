// Admin-triggered: randomly pairs up every registered, eligible participant
// for round 1, assigns each match a random 5-question set drawn from the
// black-belt ("negro") pool in learning_items, and emails each participant
// their scheduled date/time via Resend. An odd number of participants
// produces one "bye" match (no opponent, auto-win) rather than leaving
// someone unpaired.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptPiiString } from '../_shared/pii.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    return await handleDraw(body)
  } catch (error) {
    console.error('Error in championship-draw-round1:', error)
    return jsonResponse({ error: (error as Error).message }, getStatus(error))
  }
})

async function handleDraw(body: Record<string, unknown>) {
  const championshipId = typeof body.championship_id === 'string' ? body.championship_id : null
  const scheduledAtRaw = typeof body.scheduled_at === 'string' ? body.scheduled_at : null
  const windowHours = Number.isFinite(body.window_hours) ? Number(body.window_hours) : 24
  if (!championshipId) throw new HttpError('Falta "championship_id".', 400)
  if (!scheduledAtRaw) throw new HttpError('Falta "scheduled_at" (fecha/hora del combate).', 400)
  // The draw cannot be undone and it emails every participant, so its inputs are checked before anything is written:
  // a past date or a negative/huge window used to be accepted and mailed out.
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 168) throw new HttpError('"window_hours" debe ser un número entero entre 1 y 168.', 400)

  const scheduledAt = new Date(scheduledAtRaw)
  if (Number.isNaN(scheduledAt.getTime())) throw new HttpError('"scheduled_at" no es una fecha valida.', 400)
  if (scheduledAt.getTime() < Date.now() + 5 * 60_000) throw new HttpError('La fecha y hora del combate debe estar en el futuro (al menos 5 minutos).', 400)
  if (scheduledAt.getTime() > Date.now() + 366 * 86_400_000) throw new HttpError('La fecha del combate no puede estar a más de un año.', 400)
  const windowClosesAt = new Date(scheduledAt.getTime() + windowHours * 3600_000)

  const { data: champ, error: champError } = await supabase
    .from('championships')
    .select('*')
    .eq('id', championshipId)
    .single()
  if (champError || !champ) throw new HttpError('Campeonato no encontrado.', 404)

  // Only a championship whose registrations are closed can be drawn (drawing while people can still sign up leaves
  // them out). The status is claimed atomically below, so two concurrent draws cannot both proceed.
  if (champ.status !== 'registration_closed') {
    throw new HttpError('Para sortear, primero cierra las inscripciones (estado "Inscripciones cerradas"). Estado actual: ' + champ.status + '.', 409)
  }

  const { data: existingRound1 } = await supabase
    .from('championship_matches')
    .select('id')
    .eq('championship_id', championshipId)
    .eq('round', 1)
    .limit(1)
  if (existingRound1 && existingRound1.length > 0) {
    throw new HttpError('La ronda 1 de este campeonato ya fue sorteada.', 409)
  }

  const { data: claimed } = await supabase
    .from('championships')
    .update({ status: 'in_progress' })
    .eq('id', championshipId)
    .eq('status', 'registration_closed')
    .select('id')
  if (!claimed || claimed.length === 0) throw new HttpError('Otro sorteo de este campeonato está en curso o ya terminó.', 409)
  try {
    return await runDraw(champ, championshipId, scheduledAt, windowClosesAt)
  } catch (error) {
    // Nothing was drawn (or it failed half way): give the championship back so the draw can be retried.
    await supabase.from('championships').update({ status: 'registration_closed' }).eq('id', championshipId).eq('status', 'in_progress')
    throw error
  }
}

async function runDraw(champ: Record<string, any>, championshipId: string, scheduledAt: Date, windowClosesAt: Date) {
  const { data: registrations, error: regError } = await supabase
    .from('championship_registrations')
    .select('user_id, users(id, email, email_encrypted)')
    .eq('championship_id', championshipId)
  if (regError) throw regError
  if (!registrations || registrations.length < 2) {
    throw new HttpError('Se necesitan al menos 2 inscritos para sortear la ronda 1.', 400)
  }

  // learning_items.belt uses the Spanish vocabulary (blanco/.../negro) while
  // championships.min_belt uses the same English one as users.belt (white/
  // .../black) — look up the matching Spanish value via learning_dojos
  // instead of hardcoding it, so this stays correct if min_belt is ever
  // configured to something other than the black-belt default.
  const { data: dojoRow, error: dojoError } = await supabase
    .from('learning_dojos')
    .select('belt')
    .eq('db_belt', champ.min_belt)
    .single()
  if (dojoError || !dojoRow) throw new HttpError(`No se encontro el cinturon "${champ.min_belt}" en learning_dojos.`, 500)
  const questionBelt = dojoRow.belt

  const { data: questionPool, error: poolError } = await supabase
    .from('learning_items')
    .select('id')
    .eq('belt', questionBelt)
    .eq('kind', 'question')
  if (poolError) throw poolError
  const questionsPerMatch = champ.questions_per_match ?? 5
  if (!questionPool || questionPool.length < questionsPerMatch) {
    throw new HttpError(`No hay suficientes preguntas de cinturon ${questionBelt} (hay ${questionPool?.length ?? 0}, se necesitan ${questionsPerMatch}).`, 400)
  }
  const questionPoolIds = questionPool.map((q) => q.id)

  const players = shuffle(registrations.map((r) => r.user_id))
  const matchesToInsert: Record<string, unknown>[] = []
  for (let i = 0; i < players.length; i += 2) {
    const player1 = players[i]
    const player2 = players[i + 1] ?? null
    matchesToInsert.push({
      championship_id: championshipId,
      round: 1,
      player1_id: player1,
      player2_id: player2,
      question_ids: pickRandom(questionPoolIds, questionsPerMatch),
      scheduled_at: scheduledAt.toISOString(),
      window_closes_at: windowClosesAt.toISOString(),
      status: player2 ? 'scheduled' : 'bye',
      winner_id: player2 ? null : player1,
    })
  }

  const { data: insertedMatches, error: insertError } = await supabase
    .from('championship_matches')
    .insert(matchesToInsert)
    .select()
  if (insertError) throw insertError

  const registrationByUserId = new Map(registrations.map((r) => [r.user_id, r.users as { id: string; email: string; email_encrypted: unknown }]))
  const emailResults: Array<{ user_id: string; ok: boolean; error?: string }> = []

  for (const match of insertedMatches ?? []) {
    if (!match.player2_id) continue // no email for a bye — nothing to schedule
    for (const userId of [match.player1_id, match.player2_id]) {
      const user = registrationByUserId.get(userId)
      const email = await resolveRealEmail(user)
      if (!email) {
        emailResults.push({ user_id: userId, ok: false, error: 'No se pudo obtener un correo real para este usuario.' })
        continue
      }
      try {
        await sendMatchEmail(email, champ.name, scheduledAt, windowClosesAt, champ.questions_per_match ?? 5)
        emailResults.push({ user_id: userId, ok: true })
      } catch (error) {
        emailResults.push({ user_id: userId, ok: false, error: (error as Error).message })
      }
    }
  }

  return jsonResponse({
    matches_created: insertedMatches?.length ?? 0,
    byes: matchesToInsert.filter((m) => m.status === 'bye').length,
    emails: emailResults,
  })
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickRandom<T>(arr: T[], count: number): T[] {
  return shuffle(arr).slice(0, count)
}

async function resolveRealEmail(user: { email?: string; email_encrypted?: unknown } | undefined): Promise<string | null> {
  if (!user) return null
  if (user.email_encrypted) {
    const decrypted = await decryptPiiString(user.email_encrypted as never)
    if (decrypted) return decrypted
  }
  // Fallback for any legacy row that still has a real plaintext email
  // (pre-encryption-migration) rather than the "<uuid>@private.local" mask.
  if (user.email && !user.email.endsWith('@private.local')) return user.email
  return null
}

async function sendMatchEmail(to: string, championshipName: string, scheduledAt: Date, windowClosesAt: Date, questionCount: number) {
  const { data: secretRow } = await supabase.from('app_secrets').select('secret_id').eq('name', 'resend_api_key').maybeSingle()
  if (!secretRow) throw new Error('No hay una clave de Resend guardada. Configurala en el panel admin primero.')

  const { data: apiKey, error: secretError } = await supabase.rpc('get_decrypted_secret', { secret_id: secretRow.secret_id })
  if (secretError || !apiKey) throw new Error('No se pudo leer la clave de Resend desde Vault.')

  const fecha = scheduledAt.toLocaleString('es-EC', { dateStyle: 'full', timeStyle: 'short' })
  const cierre = windowClosesAt.toLocaleString('es-EC', { dateStyle: 'full', timeStyle: 'short' })

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: Deno.env.get('CHAMPIONSHIP_EMAIL_FROM') || 'CiberDojo <onboarding@resend.dev>',
      to: [to],
      subject: `${championshipName}: tu combate de ronda 1`,
      html: `
        <h2>${escapeHtml(championshipName)} — Ronda 1</h2>
        <p>Tu combate esta programado para:</p>
        <p><strong>${escapeHtml(fecha)}</strong></p>
        <p>Tienes hasta el <strong>${escapeHtml(cierre)}</strong> para completar tus ${Number(questionCount) || 5} preguntas dentro de esa ventana. Entra a Ciber Dojo y ve a "Campeonato" cuando llegue la hora.</p>
      `,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend respondio ${response.status}: ${await response.text()}`)
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError('Missing authorization header', 401)

  if (decodeJwtRole(token) === 'service_role') {
    return 'central-admin'
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) throw new HttpError('Invalid session', 401)

  const { data: profile } = await supabase
    .from('users')
    .select('role, email')
    .eq('id', authData.user.id)
    .single()

  if (profile?.role !== 'admin') throw new HttpError('Admin role required', 403)
  return profile.email ?? authData.user.id
}

function decodeJwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(payload.length + (4 - payload.length % 4) % 4, '=')
    const decoded = JSON.parse(atob(padded))
    return typeof decoded.role === 'string' ? decoded.role : null
  } catch {
    return null
  }
}

class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function getStatus(error: unknown) {
  return error instanceof HttpError ? error.status : 500
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
