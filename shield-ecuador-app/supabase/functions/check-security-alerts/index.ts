// RF-08: evaluates every active security_alert_config against real
// security_events counts and sends a Resend email (reusing the same
// 'resend_api_key' app_secret the championship feature already stores) when
// a threshold is breached. Runs both on a 15-minute pg_cron tick and
// on-demand from the admin panel ("Verificar ahora").
//
// Debounced via last_triggered_at: once a config has fired, it won't fire
// again until the breach clears (count drops back under threshold) and
// re-occurs — otherwise a sustained attack would re-send the same email
// every 15 minutes for as long as it lasts.

import { publicHttpUrlProblem } from '../_shared/url-guard.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  corsHeaders,
  supabase,
  requireAdminOrScheduler,
  getStatus,
  jsonResponse,
} from '../_shared/news-agent-core.ts'

const SEVERITY_ORDER = ['baja', 'media', 'alta', 'critica']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    await requireAdminOrScheduler(req)

    const { data: configs, error: configError } = await supabase
      .from('security_alert_config')
      .select('*')
      .eq('active', true)
    if (configError) throw configError

    const results: Array<Record<string, unknown>> = []
    for (const config of configs ?? []) {
      results.push(await evaluateConfig(config))
    }

    return jsonResponse({ checked_at: new Date().toISOString(), results })
  } catch (error) {
    console.error('Error in check-security-alerts:', error)
    return jsonResponse({ error: (error as Error).message }, getStatus(error))
  }
})

async function evaluateConfig(config: Record<string, unknown>) {
  const thresholdIndex = SEVERITY_ORDER.indexOf(config.severity_threshold as string)
  const severities = SEVERITY_ORDER.slice(Math.max(0, thresholdIndex))
  const windowStart = new Date(Date.now() - Number(config.window_minutes) * 60_000).toISOString()

  const { count, error } = await supabase
    .from('security_events')
    .select('id', { count: 'exact', head: true })
    .in('severity', severities)
    .gte('created_at', windowStart)

  if (error) return { config_id: config.id, name: config.name, error: error.message }

  const breached = (count ?? 0) >= Number(config.event_count_threshold)
  if (!breached) {
    if (config.last_triggered_at) {
      await supabase.from('security_alert_config').update({ last_triggered_at: null }).eq('id', config.id)
    }
    return { config_id: config.id, name: config.name, event_count: count ?? 0, breached: false }
  }

  if (config.last_triggered_at) {
    return { config_id: config.id, name: config.name, event_count: count ?? 0, breached: true, notified: false, reason: 'already_notified' }
  }

  await supabase.from('security_alert_config').update({ last_triggered_at: new Date().toISOString() }).eq('id', config.id)

  let notified = false
  let notifyError: string | null = null
  try {
    if (config.notify_email) await sendAlertEmail(config.notify_email as string, config.name as string, count ?? 0, config.window_minutes as number, config.severity_threshold as string)
    if (config.notify_webhook_url) await sendAlertWebhook(config.notify_webhook_url as string, config)
    notified = true
  } catch (error) {
    notifyError = (error as Error).message
  }

  return { config_id: config.id, name: config.name, event_count: count ?? 0, breached: true, notified, notify_error: notifyError }
}

async function sendAlertEmail(to: string, configName: string, eventCount: number, windowMinutes: number, severityThreshold: string) {
  const { data: secretRow } = await supabase.from('app_secrets').select('secret_id').eq('name', 'resend_api_key').maybeSingle()
  if (!secretRow) throw new Error('No hay una clave de Resend guardada.')

  const { data: apiKey, error: secretError } = await supabase.rpc('get_decrypted_secret', { secret_id: secretRow.secret_id })
  if (secretError || !apiKey) throw new Error('No se pudo leer la clave de Resend desde Vault.')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: Deno.env.get('CHAMPIONSHIP_EMAIL_FROM') || 'CiberDojo <onboarding@resend.dev>',
      to: [to],
      subject: `[CiberDojo] Alerta de seguridad: ${configName}`,
      html: `
        <h2>Alerta de seguridad: ${escapeHtml(configName)}</h2>
        <p>Se registraron <strong>${eventCount}</strong> eventos de severidad <strong>${escapeHtml(severityThreshold)}</strong> o superior en los ultimos ${windowMinutes} minutos.</p>
        <p>Revisa el Centro de Seguridad en el panel administrativo para ver el detalle.</p>
      `,
    }),
  })
  if (!response.ok) throw new Error(`Resend respondio ${response.status}: ${await response.text()}`)
}

async function sendAlertWebhook(url: string, config: Record<string, unknown>) {
  // Validated when saved, and again here (rows may predate the check): public https only, no redirects, short timeout.
  const problem = publicHttpUrlProblem(url, { httpsOnly: true })
  if (problem) throw new Error('Webhook no permitido: ' + problem)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `Alerta de seguridad CiberDojo: "${config.name}" supero su umbral.` }),
  }).finally(() => clearTimeout(timer))
  if (!response.ok) throw new Error(`Webhook respondio ${response.status}`)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string))
}
