// RF-14 to RF-17: monthly External Attack Surface Management inventory.
// Three checks, each backed by something this function can actually verify
// at runtime (no invented data):
//   - public storage buckets that aren't on the known-intentional allowlist
//     (RF-15) — queried live from storage.buckets;
//   - expected security-critical env vars that are missing (RF-16) — checks
//     PRESENCE only via Deno.env.get, never logs or stores a value;
//   - the public (no-JWT) edge function inventory (RF-14) — Supabase has no
//     client-callable API to list a project's deployed functions or their
//     verify_jwt setting, so this is a maintained allowlist matching
//     supabase/config.toml's `[functions.X] verify_jwt = false` entries,
//     recorded each run as a low-severity, already-resolved finding for
//     audit visibility rather than a live drift check. Update
//     EXPECTED_PUBLIC_ENDPOINTS here whenever config.toml changes.
//
// Any new (non-resolved) finding above 'baja' also triggers the same
// Resend alert email as check-security-alerts, reusing 'resend_api_key'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  corsHeaders,
  supabase,
  requireAdminOrScheduler,
  getStatus,
  jsonResponse,
} from '../_shared/news-agent-core.ts'

const EXPECTED_PUBLIC_BUCKETS = new Set(['campaign-ads'])
const EXPECTED_ENV_VARS = [
  'PII_ENCRYPTION_KEY_B64',
  'SECURITY_EVENTS_HMAC_KEY',
  'CRON_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
]
const EXPECTED_PUBLIC_ENDPOINTS = ['run-news-agent', 'check-security-alerts', 'security-diagnose', 'security-easm-scan']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    await requireAdminOrScheduler(req)
    return await runScan()
  } catch (error) {
    console.error('Error in security-easm-scan:', error)
    return jsonResponse({ error: (error as Error).message }, getStatus(error))
  }
})

async function runScan() {
  const scanMonth = new Date()
  scanMonth.setUTCDate(1)
  const scanMonthStr = scanMonth.toISOString().slice(0, 10)

  const findings: Array<Record<string, unknown>> = []

  const { data: buckets, error: bucketsError } = await supabase.rpc('list_storage_buckets')
  if (bucketsError) throw bucketsError
  for (const bucket of buckets ?? []) {
    if (bucket.public && !EXPECTED_PUBLIC_BUCKETS.has(bucket.id)) {
      findings.push({ finding_type: 'public_bucket', target: bucket.id, severity: 'alta', details: { public: true }, resolved: false })
    }
  }

  for (const name of EXPECTED_ENV_VARS) {
    if (!Deno.env.get(name)) {
      findings.push({ finding_type: 'missing_env_var', target: name, severity: 'alta', details: {}, resolved: false })
    }
  }

  for (const name of EXPECTED_PUBLIC_ENDPOINTS) {
    findings.push({ finding_type: 'public_endpoint', target: name, severity: 'baja', details: { note: 'Inventario esperado, ver config.toml' }, resolved: true, resolved_at: new Date().toISOString() })
  }

  const rows = findings.map((finding) => ({ ...finding, scan_month: scanMonthStr }))
  const { data: saved, error: insertError } = await supabase.from('security_easm_findings').insert(rows).select()
  if (insertError) throw insertError

  const unresolvedSerious = (saved ?? []).filter((row) => !row.resolved && row.severity !== 'baja')
  let alertSent = false
  if (unresolvedSerious.length > 0) {
    try {
      await sendFindingsAlert(unresolvedSerious)
      alertSent = true
    } catch (error) {
      console.error('security-easm-scan: no se pudo enviar alerta:', error)
    }
  }

  return jsonResponse({ scan_month: scanMonthStr, findings_count: saved?.length ?? 0, unresolved_serious: unresolvedSerious.length, alert_sent: alertSent, findings: saved })
}

async function sendFindingsAlert(findings: Array<Record<string, unknown>>) {
  const { data: secretRow } = await supabase.from('app_secrets').select('secret_id').eq('name', 'resend_api_key').maybeSingle()
  if (!secretRow) throw new Error('No hay una clave de Resend guardada.')
  const { data: apiKey, error: secretError } = await supabase.rpc('get_decrypted_secret', { secret_id: secretRow.secret_id })
  if (secretError || !apiKey) throw new Error('No se pudo leer la clave de Resend desde Vault.')

  const { data: configs } = await supabase.from('security_alert_config').select('notify_email').eq('active', true).not('notify_email', 'is', null)
  const recipients = [...new Set((configs ?? []).map((c) => c.notify_email).filter(Boolean))] as string[]
  if (recipients.length === 0) return

  const listHtml = findings.map((f) => `<li><strong>${escapeHtml(String(f.finding_type))}</strong>: ${escapeHtml(String(f.target))} (${escapeHtml(String(f.severity))})</li>`).join('')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: Deno.env.get('CHAMPIONSHIP_EMAIL_FROM') || 'CiberDojo <onboarding@resend.dev>',
      to: recipients,
      subject: `[CiberDojo] Inventario EASM: ${findings.length} hallazgo(s) sin resolver`,
      html: `<h2>Inventario mensual de superficie de ataque</h2><ul>${listHtml}</ul><p>Revisa el Centro de Seguridad en el panel administrativo.</p>`,
    }),
  })
  if (!response.ok) throw new Error(`Resend respondio ${response.status}: ${await response.text()}`)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string))
}
