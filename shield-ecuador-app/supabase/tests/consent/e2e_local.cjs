// Prueba de punta a punta SOLO contra Supabase local: supabase-js real (el del frontend) -> funciones reales -> Postgres real.
// Requiere el stack local levantado (supabase start), `supabase functions serve --env-file <env>` y un aviso publicado + privacy_settings vigente.
//   ANON_KEY=… SERVICE_ROLE_KEY=… OUT=salida.json node supabase/tests/consent/e2e_local.cjs   (las claves: supabase status -o env)
// Deja el resultado en OUT para e2e_decrypt.ts (descifra con el lector real).
const path = require('path')
const crypto = require('crypto')
const { createClient } = require(path.resolve(__dirname, '../../../frontend/node_modules/@supabase/supabase-js'))

const URL = 'http://127.0.0.1:54321'
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SERVICE_ROLE_KEY
if (!URL.startsWith('http://127.0.0.1') || !ANON || !SERVICE) throw new Error('faltan claves locales')

const anon = createClient(URL, ANON, { auth: { persistSession: false } })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${extra ? ' — ' + extra : ''}`) }

async function errorBody(error) { try { return await error.context.json() } catch { return {} } }

async function main() {
  // 1) GET real con supabase-js
  const { data: notice, error: noticeErr } = await anon.functions.invoke('get-consent-notice', { method: 'GET' })
  check('get-consent-notice (GET, supabase-js) responde', !noticeErr && !!notice?.document_id, noticeErr?.message)
  const independentSha = crypto.createHash('sha256').update(notice.rendered_md, 'utf8').digest('hex')
  check('rendered_sha256 == SHA-256 calculado aparte sobre rendered_md', independentSha === notice.rendered_sha256, notice.rendered_sha256.slice(0, 16) + '…')
  check('los marcadores {{…}} quedaron resueltos', !/\{\{/.test(notice.rendered_md))
  check('devuelve privacy_email (lo usa la pantalla de menores)', typeof notice.privacy_email === 'string' && notice.privacy_email.length > 0, String(notice.privacy_email))

  const submission = (over = {}) => ({
    document_id: notice.document_id, rendered_sha256: notice.rendered_sha256, settings_version: notice.settings_version,
    decisions: [
      { purpose_code: 'registro_aprendizaje', decision: 'granted' },
      { purpose_code: 'novedades', decision: 'granted' },
      { purpose_code: 'publicidad_personalizada', decision: 'denied' },
    ], ...over,
  })
  const email = `ana.${Date.now()}@prueba.local`
  const register = (body) => anon.functions.invoke('secure-register-user', { body: { email, password: 'MiClaveSegura1', full_name: 'Ana Pérez', business_type: 'comerciante', age_gate: true, consent_notice: submission(), ...body } })

  // 2) Rechazos: no crean nada
  const countUsers = async () => (await admin.from('users').select('id', { count: 'exact', head: true }).eq('email_domain', 'prueba.local')).count ?? 0
  const usersBefore = await countUsers()
  let r = await register({ consent_notice: submission({ rendered_sha256: 'huella-vieja' }) })
  let body = await errorBody(r.error)
  check('huella distinta -> 409 notice_changed', body.error === 'notice_changed', JSON.stringify(body))
  r = await register({ age_gate: false })
  body = await errorBody(r.error)
  check('sin 15 años -> 403 age_gate_failed con el correo de privacidad', body.error === 'age_gate_failed' && String(body.message).includes(notice.privacy_email), body.message)
  r = await register({ consent_notice: submission({ decisions: [{ purpose_code: 'novedades', decision: 'granted' }] }) })
  check('sin la finalidad obligatoria -> rechazado', !!r.error)
  const usersAfterRejections = await countUsers()
  check('los rechazos no crearon ningún usuario', usersAfterRejections === usersBefore, `antes: ${usersBefore}, después: ${usersAfterRejections}`)

  // 3) Registro correcto (con una IP inventada por el cliente que debe ignorarse)
  r = await register({ ip: '1.2.3.4' })
  check('registro correcto -> user_id', !r.error && !!r.data?.user_id, r.error ? JSON.stringify(await errorBody(r.error)) : r.data.user_id)
  const userId = r.data?.user_id

  r = await register({})
  body = await errorBody(r.error)
  check('mismo correo otra vez -> 409 "Ya existe una cuenta"', /ya existe una cuenta/i.test(String(body.error)))

  // 4) Lo que quedó en Postgres
  const { data: rows } = await admin.from('consent_records').select('*').eq('user_id', userId).order('id')
  check('una fila de evidencia por finalidad (3)', rows?.length === 3, rows?.map((x) => `${x.purpose_code}:${x.decision}`).join(', '))
  check('decisiones correctas (obligatoria y novedades granted, publicidad denied)',
    JSON.stringify(rows?.map((x) => x.decision)) === JSON.stringify(['granted', 'granted', 'denied']))
  check('todas guardan la MISMA huella que devolvió get-consent-notice', rows?.every((x) => x.rendered_sha256 === notice.rendered_sha256))
  check('IP y user-agent cifrados con AAD (aad:true), sin texto en claro', rows?.every((x) => x.ip_ciphertext?.aad === true && x.ua_ciphertext?.aad === true && !JSON.stringify(x).includes('127.0.0.1')))
  check('user_ref_hmac presente en todas (NOT NULL)', rows?.every((x) => typeof x.user_ref_hmac === 'string' && x.user_ref_hmac.length > 10))
  check('canal registro, versión 1.0, settings_version 1', rows?.every((x) => x.channel === 'registro' && x.document_version === '1.0' && x.settings_version === 1))
  const { data: chain } = await admin.rpc('verify_consent_chain')
  check('verify_consent_chain() íntegra tras el registro', Array.isArray(chain) && chain.length === 0, JSON.stringify(chain))
  const { data: u } = await admin.from('users').select('privacy_notice_version,data_processing_authorized,email_encrypted').eq('id', userId).single()
  check('perfil: privacy_notice_version = 1.0 (ya no la constante hardcodeada)', u?.privacy_notice_version === '1.0' && u?.data_processing_authorized === true)
  const { data: ev } = await admin.from('security_events').select('event_type').eq('event_type', 'consent_ip_spoof_attempt')
  check('la IP enviada por el cliente se ignoró y quedó el evento de spoof', (ev?.length ?? 0) >= 1)

  // 5) Lo que ve el propio usuario: nunca IP/UA
  const { data: session } = await anon.auth.signInWithPassword({ email, password: 'MiClaveSegura1' })
  const own = createClient(URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.session.access_token}` } } })
  const { data: mine } = await own.from('my_consent_state').select('*')
  check('my_consent_state: el usuario ve el último estado por finalidad', mine?.length === 3, mine?.map((x) => x.purpose_code).join(', '))
  const { error: leak } = await own.from('consent_records').select('ip_ciphertext')
  check('el usuario NO puede leer ip_ciphertext ni de su propia fila', !!leak, leak?.message)

  require('fs').writeFileSync(process.env.OUT, JSON.stringify({ userId, rows }, null, 2))
  const failed = results.filter((x) => !x).length
  console.log(`\n${results.length - failed}/${results.length} comprobaciones OK`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error('ERROR', e); process.exit(2) })
