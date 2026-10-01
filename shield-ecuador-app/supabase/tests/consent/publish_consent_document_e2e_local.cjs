// T14 fix (080) — punta a punta SOLO contra Supabase local: supabase-js real -> Supabase Auth local (TOTP
// real, RFC 6238) -> admin-consent servida en local (supabase functions serve) -> Postgres real. Prueba
// justo lo que el bug de 077/080 rompía: publicar con una versión ya vigente (no el caso vacío).
// Fuera de gates.sh (igual que admin_login_local.cjs / e2e_local.cjs): necesita el stack local en marcha.
//
//   supabase start
//   supabase functions serve admin-consent --env-file <env-con-LOOKUP_HMAC_KEY_B64> --no-verify-jwt
//   ANON_KEY=… SERVICE_ROLE_KEY=… node supabase/tests/consent/publish_consent_document_e2e_local.cjs
//   (las claves: supabase status -o env)
const path = require('path')
const crypto = require('crypto')
const { createClient } = require(path.resolve(__dirname, '../../../frontend/node_modules/@supabase/supabase-js'))

const URL = 'http://127.0.0.1:54321'
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SERVICE_ROLE_KEY
if (!URL.startsWith('http://127.0.0.1') || !ANON || !SERVICE) throw new Error('faltan ANON_KEY/SERVICE_ROLE_KEY locales (ver supabase status -o env)')

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
let failures = 0
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }

function totp(base32, t = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of base32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)))
  const h = crypto.createHmac('sha1', key).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

async function newAdmin(label, role) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`
  const password = `Local-${crypto.randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`createUser: ${error.message}`)
  const { error: uErr } = await admin.from('users').insert({ id: data.user.id, email })
  if (uErr) throw new Error(`users insert: ${uErr.message}`)
  if (role) {
    const { error: rErr } = await admin.from('admin_roles').insert({ user_id: data.user.id, role })
    if (rErr) throw new Error(`admin_roles insert: ${rErr.message}`)
  }
  return { id: data.user.id, email, password }
}

/** Contraseña (aal1) → alta TOTP → verificación con el código real → sesión aal2. supabase-js MFA real. */
async function loginWithTotp(creds) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data: pw, error: pwErr } = await client.auth.signInWithPassword({ email: creds.email, password: creds.password })
  if (pwErr) throw new Error(`signInWithPassword: ${pwErr.message}`)
  const { data: enroll, error: enrollErr } = await client.auth.mfa.enroll({ factorType: 'totp' })
  if (enrollErr) throw new Error(`mfa.enroll: ${enrollErr.message}`)
  if (Date.now() / 1000 % 30 > 26) await new Promise((r) => setTimeout(r, 5000)) // no verificar pegado al cambio de ventana de 30s
  const { data: challenge, error: chErr } = await client.auth.mfa.challenge({ factorId: enroll.id })
  if (chErr) throw new Error(`mfa.challenge: ${chErr.message}`)
  const { data: verify, error: vErr } = await client.auth.mfa.verify({ factorId: enroll.id, challengeId: challenge.id, code: totp(enroll.totp.secret) })
  if (vErr) throw new Error(`mfa.verify: ${vErr.message}`)
  return { client, aal1Token: pw.session.access_token, aal2Token: verify.access_token }
}

async function callAdminConsent(path, token, body) {
  const res = await fetch(`${URL}/functions/v1/admin-consent${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

;(async () => {
  // Fixture: privacy_settings v1 (si no hay ninguna todavía) y una versión YA publicada — el caso que
  // 077/080 rompían no es "publicar la primera vez", es "publicar habiendo ya una vigente".
  const { data: existingSettings } = await admin.from('privacy_settings_current').select('settings_version').maybeSingle()
  const creator = await newAdmin('creator', null)
  if (!existingSettings) {
    const { error } = await admin.from('privacy_settings').insert({
      settings_version: 1, controller_name: 'CiberDojo (e2e local)', privacy_email: 'privacidad@example.test',
      dpo_contact: 'dpo@example.test', created_by: creator.id,
    })
    if (error) throw new Error(`privacy_settings seed: ${error.message}`)
  }

  const publishedVersion = `e2e-pcd-pub-${Date.now()}`
  const draftVersion = `e2e-pcd-draft-${Date.now()}`
  const { data: publishedDoc, error: pubErr } = await admin.from('consent_documents').insert({
    version: publishedVersion, title: 'Vigente (e2e)', content_md: 'contenido vigente', content_sha256: 'sha-vigente',
    purposes: [{ code: 'registro_aprendizaje', label: 'Registro', required: true }], status: 'published',
    created_by: creator.id, published_by: creator.id, published_at: new Date().toISOString(),
  }).select('id').single()
  if (pubErr) throw new Error(`consent_documents (vigente) seed: ${pubErr.message}`)
  const { data: draftDoc, error: draftErr } = await admin.from('consent_documents').insert({
    version: draftVersion, title: 'Borrador (e2e)', content_md: 'contenido borrador', content_sha256: 'sha-borrador',
    purposes: [{ code: 'registro_aprendizaje', label: 'Registro', required: true }], status: 'draft', created_by: creator.id,
  }).select('id').single()
  if (draftErr) throw new Error(`consent_documents (borrador) seed: ${draftErr.message}`)

  const publisher = await newAdmin('publisher', 'privacy_admin')
  const { client, aal1Token, aal2Token } = await loginWithTotp(publisher)

  // 1) aal1 (sin TOTP verificado) → 403 mfa_required, nada cambia.
  const noMfa = await callAdminConsent(`/documents/${draftDoc.id}/publish`, aal1Token, { reason: 'intento sin TOTP' })
  check(noMfa.status === 403 && noMfa.json?.error === 'mfa_required', 'publicar con aal1 → 403 mfa_required', JSON.stringify(noMfa))

  // 2) aal2 real: ESTE es el caso que publishDraft rompía siempre contra Postgres real (ya hay una vigente).
  const ok = await callAdminConsent(`/documents/${draftDoc.id}/publish`, aal2Token, { reason: 'publicación e2e con vigente existente' })
  check(ok.status === 200 && ok.json?.status === 'published', 'publicar con aal2 y una vigente existente → 200 published', JSON.stringify(ok))

  const { data: afterPublished } = await admin.from('consent_documents').select('id,status,retired_by').eq('id', publishedDoc.id).single()
  check(afterPublished?.status === 'retired' && afterPublished?.retired_by === publisher.id, 'la vigente anterior quedó retirada, con el actor correcto', JSON.stringify(afterPublished))

  const { data: oneCount } = await admin.from('consent_documents').select('id', { count: 'exact', head: true }).eq('status', 'published')
  check(true, 'conteo de publicadas solicitado (ver aserción siguiente)')
  const { count: publishedCount } = await admin.from('consent_documents').select('*', { count: 'exact', head: true }).eq('status', 'published')
  check(publishedCount === 1, 'sigue habiendo exactamente una versión publicada', String(publishedCount))

  const { data: auditRow } = await admin.from('admin_audit_log').select('actor_id,action,reason').eq('entity_id', draftDoc.id).eq('action', 'consent_document.publish').maybeSingle()
  check(auditRow?.actor_id === publisher.id && auditRow?.reason === 'publicación e2e con vigente existente', 'bitácora real: actor y motivo correctos', JSON.stringify(auditRow))

  // 3) Repetir sobre el mismo borrador (ya publicado) → 409 not_draft, defensa en profundidad de la función real.
  const again = await callAdminConsent(`/documents/${draftDoc.id}/publish`, aal2Token, { reason: 'segundo intento' })
  check(again.status === 409 && again.json?.error === 'not_draft', 'publicar de nuevo el mismo documento → 409 not_draft', JSON.stringify(again))

  console.log(failures ? `\n${failures} FALLO(S)` : '\nTodo OK')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error('ERROR', e.stack || e.message); process.exit(2) })
