// TEST-INT.a (3er criterio): compensación real cuando el INSERT de la evidencia falla en Postgres DE VERDAD
// (no un 500 simulado por el fake de index_test.ts). El llamador (gates.sh, dentro de e2e_local()) revoca
// INSERT en consent_records de service_role ANTES de invocar este script y lo restaura después: aquí solo
// se hace la llamada HTTP real y se comprueba que secure-register-user compensó (perfil y usuario de auth
// borrados), nunca que quede una cuenta sin evidencia (REQ-07).
//   ANON_KEY=… SERVICE_ROLE_KEY=… node supabase/tests/consent/e2e_local_compensation.cjs
const path = require('path')
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
  const { data: notice, error: noticeErr } = await anon.functions.invoke('get-consent-notice', { method: 'GET' })
  check('get-consent-notice (GET) responde', !noticeErr && !!notice?.document_id, noticeErr?.message)

  const email = `comp.${Date.now()}@compensacion.local`
  const password = 'MiClaveSegura1'
  const body = {
    email, password, full_name: 'Compensacion Prueba', business_type: 'comerciante', age_gate: true,
    consent_notice: {
      document_id: notice.document_id, rendered_sha256: notice.rendered_sha256, settings_version: notice.settings_version,
      decisions: [
        { purpose_code: 'registro_aprendizaje', decision: 'granted' },
        { purpose_code: 'novedades', decision: 'granted' },
        { purpose_code: 'publicidad_personalizada', decision: 'denied' },
      ],
    },
  }

  // Con el INSERT de consent_records ya revocado por el llamador: esta llamada crea el usuario de auth
  // y el perfil, falla de verdad al insertar la evidencia (restricción de privilegios real de Postgres,
  // no una respuesta simulada) y debe compensar borrando ambos antes de responder.
  const r = await anon.functions.invoke('secure-register-user', { body })
  const body2 = await errorBody(r.error)
  check('inserción de evidencia bloqueada de verdad en Postgres -> 400 genérico (no crea cuenta huérfana)',
    !!r.error && body2.error === 'No se pudo completar el registro.', JSON.stringify(body2))

  const { count: profileCount } = await admin
    .from('users').select('id', { count: 'exact', head: true }).eq('email_domain', 'compensacion.local')
  check('compensación: no quedó fila de perfil (users)', profileCount === 0, String(profileCount))

  const { error: signInError } = await anon.auth.signInWithPassword({ email, password })
  check('compensación: no quedó usuario de auth (login con esas credenciales falla)', !!signInError, signInError?.message)

  const failed = results.filter((x) => !x).length
  console.log(`\n${results.length - failed}/${results.length} comprobaciones OK`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error('ERROR', e); process.exit(2) })
