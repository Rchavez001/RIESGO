// RF-08/RF-20: create, update, or delete a security_alert_config row, and
// write the before/after to security_config_audit on every change — the
// only writer of that table this module has (kata status transitions are
// tracked on their own row via updated_at/reviewed_by instead).

import { publicHttpUrlProblem } from '../_shared/url-guard.ts'
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

    if (body.action === 'delete') {
      const id = typeof body.id === 'string' ? body.id : ''
      if (!id) throw new HttpError('Falta "id".', 400)
      return await handleDelete(id, actor)
    }

    return await handleUpsert(body, actor)
  } catch (error) {
    console.error('Error in save-security-alert-config:', error)
    return jsonResponse({ error: (error as Error).message }, getStatus(error))
  }
})

async function handleUpsert(body: Record<string, unknown>, actor: string) {
  const id = typeof body.id === 'string' ? body.id : null
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const severityThreshold = typeof body.severity_threshold === 'string' ? body.severity_threshold : ''
  const eventCountThreshold = Number(body.event_count_threshold)
  const windowMinutes = Number(body.window_minutes)
  const notifyEmail = typeof body.notify_email === 'string' && body.notify_email.trim() ? body.notify_email.trim() : null
  const notifyWebhookUrl = typeof body.notify_webhook_url === 'string' && body.notify_webhook_url.trim() ? body.notify_webhook_url.trim() : null
  const active = body.active !== false

  if (!name) throw new HttpError('Falta "name".', 400)
  if (name.length > 100) throw new HttpError('El nombre puede tener como máximo 100 caracteres.', 400)
  if (!['baja', 'media', 'alta', 'critica'].includes(severityThreshold)) throw new HttpError('severity_threshold invalido.', 400)
  if (!Number.isInteger(eventCountThreshold) || eventCountThreshold < 1 || eventCountThreshold > 100000) throw new HttpError('event_count_threshold debe ser un entero entre 1 y 100000.', 400)
  if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > 10080) throw new HttpError('window_minutes debe ser un entero entre 1 y 10080 (una semana).', 400)
  if (notifyEmail && (notifyEmail.length > 254 || !/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(notifyEmail))) throw new HttpError('El correo de aviso no es válido.', 400)
  // The alert job POSTs to this address from the server: only public https endpoints (no internal hosts / cloud metadata).
  if (notifyWebhookUrl) {
    const problem = publicHttpUrlProblem(notifyWebhookUrl, { httpsOnly: true })
    if (problem) throw new HttpError('Webhook no permitido: ' + problem, 400)
  }
  if (!notifyEmail && !notifyWebhookUrl) throw new HttpError('Configura al menos un correo o webhook de aviso.', 400)

  let before: Record<string, unknown> | null = null
  if (id) {
    const { data } = await supabase.from('security_alert_config').select('*').eq('id', id).maybeSingle()
    before = data ?? null
    if (!before) throw new HttpError('No se encontro la configuracion de alerta indicada.', 404)
  }

  const row = {
    name,
    severity_threshold: severityThreshold,
    event_count_threshold: eventCountThreshold,
    window_minutes: windowMinutes,
    notify_email: notifyEmail,
    notify_webhook_url: notifyWebhookUrl,
    active,
    updated_at: new Date().toISOString(),
  }

  const { data: saved, error } = id
    ? await supabase.from('security_alert_config').update(row).eq('id', id).select().single()
    : await supabase.from('security_alert_config').insert(row).select().single()

  if (error) throw new Error(`No se pudo guardar la configuracion: ${error.message}`)

  await supabase.from('security_config_audit').insert({
    changed_by: actor,
    table_name: 'security_alert_config',
    record_id: saved.id,
    action: id ? 'update' : 'insert',
    before_value: before,
    after_value: saved,
  })

  return jsonResponse({ config: saved })
}

async function handleDelete(id: string, actor: string) {
  const { data: before } = await supabase.from('security_alert_config').select('*').eq('id', id).maybeSingle()
  if (!before) throw new HttpError('No se encontro la configuracion de alerta indicada.', 404)

  const { error } = await supabase.from('security_alert_config').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar la configuracion: ${error.message}`)

  await supabase.from('security_config_audit').insert({
    changed_by: actor,
    table_name: 'security_alert_config',
    record_id: id,
    action: 'delete',
    before_value: before,
    after_value: null,
  })

  return jsonResponse({ deleted: true, id })
}
