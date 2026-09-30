// Run: deno test --allow-env --allow-net supabase/functions/get-consent-notice/index_test.ts
// Starts the REAL function against a fake Supabase, so the response the browser actually gets
// (fields, cache header, error codes) is proven against real traffic, not against the shared
// renderer in isolation (that part is covered by consent-render_test.ts).
import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { renderConsent, sha256Hex } from '../_shared/consent-render.ts'

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const DOCUMENT = {
  id: 'doc-1', version: '1.0', title: 'Aviso de privacidad', requires_reconsent: false, published_at: '2026-09-28T15:00:00Z',
  purposes: [{ code: 'registro_aprendizaje', label: 'Registro y aprendizaje', required: true }],
  content_md: 'Responsable: {{responsable_nombre}}. Escribe a {{correo_privacidad}}. Vigente desde {{fecha_vigencia}}.',
}
const SETTINGS = {
  settings_version: 3, controller_name: 'Club de Prueba', controller_address: null, controller_phone: null,
  privacy_email: 'privacidad@prueba.example', dpo_name: null, dpo_contact: null, privacy_policy_url: 'https://example.test/privacidad',
  unsubscribe_subject: 'Baja - Prueba', response_days: 15, ip_retention_days: 730,
}

let documentRow: unknown = DOCUMENT
let settingsRow: unknown = SETTINGS

const fake = Deno.serve({ port: 0, onListen: () => {} }, (req) => {
  const { pathname } = new URL(req.url)
  if (pathname === '/rest/v1/consent_documents') return json(documentRow)
  if (pathname === '/rest/v1/privacy_settings_current') return json(settingsRow)
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
})

Deno.env.set('SUPABASE_URL', `http://127.0.0.1:${(fake.addr as Deno.NetAddr).port}`)
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')

await import('./index.ts')

async function call(init: RequestInit = {}) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await fetch('http://127.0.0.1:8000/', init)
    } catch {
      await new Promise((r) => setTimeout(r, 100)) // la función todavía está arrancando
    }
  }
  throw new Error('la función no arrancó')
}

const reset = () => {
  documentRow = DOCUMENT
  settingsRow = SETTINGS
}
const opts = { sanitizeOps: false, sanitizeResources: false }

Deno.test({
  name: 'camino feliz: huella y campos coinciden con lo que calcula el renderizador compartido',
  ...opts,
  async fn() {
    reset()
    const res = await call()
    assertEquals(res.status, 200)
    assertEquals(res.headers.get('Cache-Control'), 'public, max-age=60')
    const body = await res.json()
    const expected = renderConsent(DOCUMENT.content_md, SETTINGS, DOCUMENT)
    assertEquals(body.rendered_md, expected.text)
    assertEquals(body.rendered_sha256, await sha256Hex(expected.text))
    assertEquals(body.document_id, 'doc-1')
    assertEquals(body.version, '1.0')
    assertEquals(body.settings_version, 3)
    assertEquals(body.purposes, DOCUMENT.purposes)
    assertEquals(body.requires_reconsent, false)
    assertEquals(body.privacy_policy_url, 'https://example.test/privacidad')
    assertEquals(body.privacy_email, 'privacidad@prueba.example')
  },
})

Deno.test({
  name: 'la huella cambia si cambian los settings vigentes, sin tocar el documento',
  ...opts,
  async fn() {
    reset()
    const first = await (await call()).json()
    settingsRow = { ...SETTINGS, settings_version: 4, controller_name: 'Otro Responsable' }
    const second = await (await call()).json()
    assert(first.rendered_sha256 !== second.rendered_sha256)
    assertEquals(second.settings_version, 4)
  },
})

Deno.test({
  name: 'sin documento publicado → 404 sin filtrar detalles internos',
  ...opts,
  async fn() {
    reset()
    documentRow = null
    const res = await call()
    assertEquals(res.status, 404)
    assertEquals((await res.json()).error, 'No hay un aviso de privacidad publicado todavía.')
  },
})

Deno.test({
  name: 'marcador desconocido o sin valor en el aviso publicado → 500 NOTICE_INVALID, nunca el texto crudo',
  ...opts,
  async fn() {
    reset()
    for (const broken of ['Hola {{marcador_que_no_existe}}', 'Hola {{responsable_telefono}}']) { // desconocido | conocido pero sin valor
      documentRow = { ...DOCUMENT, content_md: broken }
      const res = await call()
      const body = await res.json()
      assertEquals(res.status, 500)
      assertEquals(body.error, 'NOTICE_INVALID')
      assert(!JSON.stringify(body).includes(broken))
    }
  },
})

Deno.test({
  name: 'método no permitido → 405',
  ...opts,
  async fn() {
    reset()
    const res = await call({ method: 'POST' })
    await res.body?.cancel()
    assertEquals(res.status, 405)
  },
})

Deno.test({
  name: 'preflight CORS: OPTIONS responde 200 con las cabeceras del navegador',
  ...opts,
  async fn() {
    reset()
    const res = await call({ method: 'OPTIONS' })
    await res.body?.cancel()
    assertEquals(res.status, 200)
    assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*')
  },
})
