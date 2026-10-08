// Run: deno test --allow-env supabase/functions/admin-consent/handler_test.ts
// T05.a (SEC-03, H08): `POST /admin-consent/session` atribuye la sesión al admin individual del JWT verificado.
// T14 (REQ-01, REQ-13 a–d, SEC-02): acciones de `consent_documents` (crear/editar borrador, diff, preview,
// publicar — con "cuatro ojos" — y retirar un borrador), todas atribuidas y con bitácora before/after.
// T12.d.1 (REQ-21, D-15): `get_email_transport`/`update_email_transport`, solo `privacy_admin`, contraseña
// SMTP nunca en la respuesta ni en la bitácora.
import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'https://deno.land/x/jose@v5.9.6/index.ts'
import {
  ApiError,
  handle,
  type AdminConsentDeps,
  type AuditEntry,
  type ConsentDocumentRow,
  type ConsentDocumentStatus,
  type CurrentPrivacySettings,
  type DocumentsDeps,
  type EmailDeps,
  type EmailOutboxDeps,
  type EmailOutboxRow,
  type EmailTransportDeps,
  type EmailTransportRow,
  type NewConsentDocumentInput,
  type NewEmailTransportInput,
  type NewPrivacySettingsInput,
  type RateLimitCheck,
  type SettingsDeps,
} from './handler.ts'
import type { EmailMessage, EmailSendResult } from '../_shared/email/types.ts'

const KID = 'k1'
const ADMIN_ID = '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4'
const EDITOR_ID = '1a2b3c4d-5e6f-4789-a0b1-c2d3e4f50617'
const SESSION_ID = '5e4d3c2b-1a09-4f8e-9d7c-6b5a49382716'
const keys = await generateKeyPair('ES256')
const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(keys.publicKey)), kid: KID, alg: 'ES256' }] })

const claims = (over: JWTPayload = {}): JWTPayload => ({
  sub: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: 'Admin.Uno@Example.test',
  aal: 'aal2', session_id: SESSION_ID, is_anonymous: false, ...over,
})
const sign = (c: JWTPayload) =>
  new SignJWT(c).setProtectedHeader({ alg: 'ES256', kid: KID }).setIssuedAt().setExpirationTime('10m').sign(keys.privateKey)

// ── Fakes de `documents`/`settings`: un store en memoria que reproduce la semántica real (concurrencia
// optimista de `updateIfStatus`, choque de `version` única en `insert`) sin tocar Postgres. ──────────────
function makeDocsStore(
  initial: ConsentDocumentRow[] = [],
  opts: { audit?: AuditEntry[]; failPublish?: boolean } = {},
): { documents: DocumentsDeps; rows: ConsentDocumentRow[] } {
  const rows = [...initial]
  let seq = rows.length
  const documents: DocumentsDeps = {
    getPublished: () => Promise.resolve(rows.find((r) => r.status === 'published') ?? null),
    getById: (id) => Promise.resolve(rows.find((r) => r.id === id) ?? null),
    insert: (row: NewConsentDocumentInput) => {
      if (rows.some((r) => r.version === row.version)) return Promise.reject(new ApiError(409, 'version_exists'))
      seq += 1
      const created: ConsentDocumentRow = {
        id: `doc-${seq}`,
        status: 'draft',
        created_at: '2026-10-01T00:00:00Z',
        updated_by: null,
        updated_at: null,
        published_by: null,
        published_at: null,
        retired_by: null,
        retired_at: null,
        ...row,
      }
      rows.push(created)
      return Promise.resolve(created)
    },
    updateIfStatus: (id: string, expectedStatus: ConsentDocumentStatus, patch: Partial<ConsentDocumentRow>) => {
      const idx = rows.findIndex((r) => r.id === id && r.status === expectedStatus)
      if (idx === -1) return Promise.resolve(null)
      rows[idx] = { ...rows[idx], ...patch }
      return Promise.resolve(rows[idx])
    },
    // Reproduce la semántica atómica de publish_consent_document (080): retira la vigente (si hay) +
    // publica el borrador + deja bitácora, sin mutar NADA si `failPublish` simula que la transacción
    // real falló (ni retiro ni publicación quedan a medias — igual que un ROLLBACK de Postgres, sin
    // necesidad de ningún UPDATE compensatorio en el fake tampoco).
    publish: (input) => {
      if (opts.failPublish) return Promise.reject(new ApiError(503, 'audit_failed'))
      const draftIdx = rows.findIndex((r) => r.id === input.draftId && r.status === 'draft')
      if (draftIdx === -1) return Promise.reject(new ApiError(409, 'not_draft'))
      const now = '2026-10-01T00:00:00Z'
      const pubIdx = rows.findIndex((r) => r.status === 'published')
      let before: ConsentDocumentRow | null = null
      if (pubIdx !== -1) {
        rows[pubIdx] = { ...rows[pubIdx], status: 'retired', retired_by: input.actorId, retired_at: now }
        before = rows[pubIdx]
      }
      rows[draftIdx] = { ...rows[draftIdx], status: 'published', published_by: input.actorId, published_at: now }
      const after = rows[draftIdx]
      opts.audit?.push({
        actor_id: input.actorId,
        actor_email_hmac: input.actorEmailHmac,
        actor_role: input.actorRole,
        action: 'consent_document.publish',
        entity: 'consent_documents',
        entity_id: input.draftId,
        before,
        after,
        reason: input.reason,
      })
      return Promise.resolve(after)
    },
  }
  return { documents, rows }
}

// Fake de `emailTransport`: cifrado simulado (nunca real) que SÍ reproduce la semántica que importa
// probar aquí — una contraseña cifrada bajo la versión N solo se puede descifrar con la versión N (si
// `decryptPassword` se llamara con la AAD de otra fila, igual que `crypto.ts` real, debe fallar).
type TestRow = { transport_version: number; success: boolean; error_code: string | null; tested_by: string }

function makeEmailTransportStore(
  initial: EmailTransportRow[] = [],
): { emailTransport: EmailTransportDeps; rows: EmailTransportRow[]; tests: TestRow[] } {
  const rows = [...initial]
  const tests: TestRow[] = []
  const emailTransport: EmailTransportDeps = {
    getCurrent: () => Promise.resolve(rows.length ? rows[rows.length - 1] : null),
    insert: (row: NewEmailTransportInput) => {
      const created: EmailTransportRow = { created_at: '2026-10-05T00:00:00Z', ...row }
      rows.push(created)
      return Promise.resolve(created)
    },
    encryptPassword: (password, transportVersion) => Promise.resolve(`enc:v${transportVersion}:${password}`),
    decryptPassword: (row) => {
      const match = /^enc:v(\d+):(.*)$/.exec(String(row.smtp_password_ciphertext))
      if (!match || Number(match[1]) !== row.transport_version) throw new Error('aad_mismatch')
      return Promise.resolve(match[2])
    },
    recordTest: (input) => {
      tests.push({ transport_version: input.transportVersion, success: input.success, error_code: input.errorCode, tested_by: input.testedBy })
      return Promise.resolve()
    },
  }
  return { emailTransport, rows, tests }
}

// Fake de `email` (T12.d.2): registra cada envío intentado y devuelve el resultado/rate-limit que
// indique la prueba, sin tocar ningún proveedor real.
function makeEmailDeps(
  opts: { result?: EmailSendResult; rateLimited?: RateLimitCheck['reason'] } = {},
): { email: EmailDeps; sent: Array<{ transport: EmailTransportRow; message: { to: string; subject: string; html: string } }> } {
  const sent: Array<{ transport: EmailTransportRow; message: { to: string; subject: string; html: string } }> = []
  const email: EmailDeps = {
    send: (transport, message) => {
      sent.push({ transport, message })
      return Promise.resolve(opts.result ?? { ok: true })
    },
    checkTestRateLimit: () => Promise.resolve(opts.rateLimited ? { allowed: false, reason: opts.rateLimited } : { allowed: true }),
  }
  return { email, sent }
}

// Fake de `emailOutbox` (T12.d.3): un store en memoria con `status` interno para reproducir la regla de
// `email_outbox` real (079) — `listPending` solo ve `status = 'pending'`, `markSent` es la única forma
// de tocar una fila existente, y una fila ya enviada no vuelve a aparecer (sin duplicar el envío).
function makeEmailOutboxStore(
  initial: EmailOutboxRow[] = [],
  opts: { rebuild?: (row: EmailOutboxRow) => Promise<EmailMessage | null> } = {},
): { emailOutbox: EmailOutboxDeps; statusOf: (id: string) => 'pending' | 'sent' | undefined } {
  const status = new Map<string, 'pending' | 'sent'>(initial.map((r) => [r.id, 'pending']))
  const rows = new Map<string, EmailOutboxRow>(initial.map((r) => [r.id, r]))
  const emailOutbox: EmailOutboxDeps = {
    listPending: () => Promise.resolve([...rows.values()].filter((r) => status.get(r.id) === 'pending')),
    rebuildMessage: opts.rebuild ?? (() => Promise.resolve(null)),
    markSent: (id) => {
      status.set(id, 'sent')
      return Promise.resolve()
    },
  }
  return { emailOutbox, statusOf: (id) => status.get(id) }
}

// A diferencia de `makeDocsStore`/`makeEmailTransportStore`, `current` es mutable aquí (sin un array de
// filas expuesto): basta con que `insert` reemplace la vigente, igual que haría la vista
// `privacy_settings_current` real tras un INSERT.
function settingsDeps(overrides: Partial<CurrentPrivacySettings> = {}): SettingsDeps {
  let current: CurrentPrivacySettings = {
    settings_version: 1,
    controller_name: 'CiberDojo', controller_address: 'Guayaquil', controller_phone: '000',
    privacy_email: 'privacidad@example.test', dpo_name: 'DPO', dpo_contact: 'dpo@example.test',
    privacy_policy_url: 'https://example.test/privacidad', unsubscribe_subject: 'Baja y eliminación',
    response_days: 15, ip_retention_days: 730, four_eyes_publish: false,
    ...overrides,
  }
  return {
    getCurrent: () => Promise.resolve(current),
    insert: (row: NewPrivacySettingsInput) => {
      current = { ...row }
      return Promise.resolve(current)
    },
  }
}

const publishedDoc = (over: Partial<ConsentDocumentRow> = {}): ConsentDocumentRow => ({
  id: 'doc-pub-1', version: '1.0', title: 'Aviso v1.0',
  content_md: 'Versión {{version}} — {{correo_privacidad}}', content_sha256: 'sha-pub',
  purposes: [{ code: 'registro_aprendizaje', label: 'Registro', required: true }],
  status: 'published', requires_reconsent: false, change_summary: null, based_on_id: null,
  created_by: EDITOR_ID, created_at: '2026-01-01T00:00:00Z',
  updated_by: null, updated_at: null,
  published_by: ADMIN_ID, published_at: '2026-01-01T00:00:00Z',
  retired_by: null, retired_at: null,
  ...over,
})

function fullDeps(opts: {
  roles: string[]
  audit?: AuditEntry[]
  failAudit?: boolean
  documents?: DocumentsDeps
  settings?: SettingsDeps
  emailTransport?: EmailTransportDeps
  email?: EmailDeps
  emailOutbox?: EmailOutboxDeps
}): AdminConsentDeps {
  const audit = opts.audit ?? []
  return {
    guard: { key: jwks, lookupRoles: () => Promise.resolve(opts.roles) },
    emailHmac: (email) => Promise.resolve(`hmac(${email})`),
    audit: (entry) => (opts.failAudit ? Promise.reject(new Error('db')) : (audit.push(entry), Promise.resolve())),
    documents: opts.documents ?? makeDocsStore().documents,
    settings: opts.settings ?? settingsDeps(),
    emailTransport: opts.emailTransport ?? makeEmailTransportStore().emailTransport,
    email: opts.email ?? makeEmailDeps().email,
    emailOutbox: opts.emailOutbox ?? makeEmailOutboxStore().emailOutbox,
  }
}

function deps(roles: string[], audit: AuditEntry[] = [], failAudit = false): AdminConsentDeps {
  return fullDeps({ roles, audit, failAudit })
}

const post = (token?: string, path = '/admin-consent/session', method = 'POST') =>
  new Request(`http://localhost${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} })

function req(token: string | undefined, path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost/admin-consent${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

Deno.test('POST /session con admin aal2 y rol → 200 y bitácora con el actor_id del token verificado', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(await sign(claims())), deps(['privacy_editor', 'privacy_auditor'], audit))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { user_id: ADMIN_ID, roles: ['privacy_editor', 'privacy_auditor'] })
  assertEquals(audit, [{
    actor_id: ADMIN_ID,
    actor_email_hmac: 'hmac(admin.uno@example.test)',
    actor_role: 'privacy_editor,privacy_auditor',
    action: 'admin.session_verified',
    entity: 'admin_session',
    entity_id: SESSION_ID,
  }])
})

Deno.test('sin token → 401 y nada en la bitácora', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(), deps(['privacy_admin'], audit))
  assertEquals([res.status, (await res.json()).error], [401, 'missing_token'])
  assertEquals(audit, [])
})

Deno.test('sesión sin TOTP (aal1) → 403 mfa_required y nada en la bitácora', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(await sign(claims({ aal: 'aal1' }))), deps(['privacy_admin'], audit))
  assertEquals([res.status, (await res.json()).error], [403, 'mfa_required'])
  assertEquals(audit, [])
})

Deno.test('usuario sin rol del módulo → 403 forbidden y nada en la bitácora', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(await sign(claims())), deps([], audit))
  assertEquals([res.status, (await res.json()).error], [403, 'forbidden'])
  assertEquals(audit, [])
})

Deno.test('service_role (el proxy del panel con Basic Auth) → 401 not_user_token', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(await sign(claims({ role: 'service_role' }))), deps(['privacy_admin'], audit))
  assertEquals([res.status, (await res.json()).error], [401, 'not_user_token'])
  assertEquals(audit, [])
})

Deno.test('admin sin correo en el token → 403 forbidden (la bitácora exige actor_email_hmac)', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(await sign(claims({ email: undefined }))), deps(['privacy_admin'], audit))
  assertEquals([res.status, (await res.json()).error], [403, 'forbidden'])
  assertEquals(audit, [])
})

Deno.test('si la bitácora falla, la sesión no se da por verificada → 503 audit_failed', async () => {
  const res = await handle(post(await sign(claims())), deps(['privacy_admin'], [], true))
  assertEquals([res.status, (await res.json()).error], [503, 'audit_failed'])
})

Deno.test('ruta desconocida → 404; método distinto de POST en /session → 405', async () => {
  const token = await sign(claims())
  assertEquals((await handle(post(token, '/admin-consent/otra'), deps(['privacy_admin']))).status, 404)
  assertEquals((await handle(post(token, '/admin-consent/session', 'GET'), deps(['privacy_admin']))).status, 405)
})

Deno.test('las respuestas de error no llevan el token ni detalles internos', async () => {
  const token = await sign(claims({ aal: 'aal1' }))
  const body = await (await handle(post(token), deps(['privacy_admin']))).text()
  assertEquals(body.includes(token.split('.')[1]), false)
  assertEquals(Object.keys(JSON.parse(body)), ['error'])
})

const claimsFor = (sub: string, over: JWTPayload = {}) => claims({ sub, ...over })

// ── POST /documents (T14: crear borrador) ───────────────────────────────────────────────────────────
Deno.test('editor crea un borrador clonado de la vigente (sin tocar la publicada) y queda en bitácora', async () => {
  const published = publishedDoc()
  const { documents, rows } = makeDocsStore([published])
  const audit: AuditEntry[] = []
  const token = await sign(claims())
  const d = fullDeps({ roles: ['privacy_editor'], audit, documents })

  const res = await handle(req(token, '/documents', 'POST', { version: '1.1' }), d)
  assertEquals(res.status, 201)
  const body = await res.json()
  assertEquals(body.status, 'draft')
  assertEquals(body.version, '1.1')
  assertEquals(body.content_md, published.content_md) // clonado, no se dio content_md
  assertEquals(body.based_on_id, published.id)
  assertEquals(body.created_by, ADMIN_ID)
  assertEquals(rows.find((r) => r.id === published.id)?.status, 'published') // la vigente no se tocó
  assertEquals(audit.length, 1)
  assertEquals(audit[0].action, 'consent_document.create')
  assertEquals(audit[0].before, null)
  assertEquals((audit[0].after as ConsentDocumentRow).id, body.id)
})

Deno.test('auditor no puede crear borradores → 403 forbidden', async () => {
  const d = fullDeps({ roles: ['privacy_auditor'] })
  const res = await handle(req(await sign(claims()), '/documents', 'POST', { version: '1.1' }), d)
  assertEquals((await res.json()).error, 'forbidden')
  assertEquals(res.status, 403)
})

Deno.test('crear borrador sin version → 400 invalid_input, nada insertado', async () => {
  const { documents, rows } = makeDocsStore([publishedDoc()])
  const res = await handle(req(await sign(claims()), '/documents', 'POST', {}), fullDeps({ roles: ['privacy_editor'], documents }))
  assertEquals([res.status, (await res.json()).error], [400, 'invalid_input'])
  assertEquals(rows.length, 1)
})

Deno.test('crear borrador con una version que ya existe → 409 version_exists', async () => {
  const { documents } = makeDocsStore([publishedDoc({ version: '1.1' })])
  const res = await handle(req(await sign(claims()), '/documents', 'POST', { version: '1.1' }), fullDeps({ roles: ['privacy_editor'], documents }))
  assertEquals([res.status, (await res.json()).error], [409, 'version_exists'])
})

Deno.test('sin ninguna versión publicada: crear borrador exige title/content_md/purposes (arranque)', async () => {
  const { documents } = makeDocsStore([])
  const dRoles = fullDeps({ roles: ['privacy_editor'], documents })
  const resMissing = await handle(req(await sign(claims()), '/documents', 'POST', { version: '1.0' }), dRoles)
  assertEquals([resMissing.status, (await resMissing.json()).error], [400, 'bootstrap_requires_title_content_purposes'])

  const resOk = await handle(
    req(await sign(claims()), '/documents', 'POST', {
      version: '1.0', title: 'Aviso', content_md: 'Hola', purposes: [{ code: 'registro_aprendizaje', label: 'Registro', required: true }],
    }),
    dRoles,
  )
  assertEquals(resOk.status, 201)
  const body = await resOk.json()
  assertEquals(body.based_on_id, null)
})

// ── PATCH /documents/:id (T14: editar borrador) ─────────────────────────────────────────────────────
Deno.test('editor edita su borrador: recalcula content_sha256 y deja before/after en bitácora', async () => {
  const draft: ConsentDocumentRow = { ...publishedDoc({ id: 'doc-draft-1', version: '1.1', status: 'draft', published_by: null, published_at: null }) }
  const { documents, rows } = makeDocsStore([draft])
  const audit: AuditEntry[] = []
  const res = await handle(
    req(await sign(claims()), '/documents/doc-draft-1', 'PATCH', { content_md: 'Nuevo texto {{version}}' }),
    fullDeps({ roles: ['privacy_editor'], audit, documents }),
  )
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.content_md, 'Nuevo texto {{version}}')
  assertExists(body.content_sha256)
  assertEquals(body.content_sha256 === draft.content_sha256, false)
  assertEquals(body.updated_by, ADMIN_ID)
  assertEquals(rows[0].content_md, 'Nuevo texto {{version}}')
  assertEquals(audit[0].action, 'consent_document.update')
  assertEquals((audit[0].before as ConsentDocumentRow).content_md, draft.content_md)
})

Deno.test('editar una versión publicada (no borrador) → 409 not_draft', async () => {
  const { documents } = makeDocsStore([publishedDoc()])
  const res = await handle(
    req(await sign(claims()), '/documents/doc-pub-1', 'PATCH', { title: 'x' }),
    fullDeps({ roles: ['privacy_editor'], documents }),
  )
  assertEquals([res.status, (await res.json()).error], [409, 'not_draft'])
})

Deno.test('editar un documento inexistente → 404', async () => {
  const res = await handle(req(await sign(claims()), '/documents/no-existe', 'PATCH', { title: 'x' }), fullDeps({ roles: ['privacy_editor'] }))
  assertEquals(res.status, 404)
})

Deno.test('PATCH sin ningún campo → 400 invalid_input', async () => {
  const { documents } = makeDocsStore([publishedDoc({ id: 'doc-draft-1', status: 'draft' })])
  const res = await handle(req(await sign(claims()), '/documents/doc-draft-1', 'PATCH', {}), fullDeps({ roles: ['privacy_editor'], documents }))
  assertEquals([res.status, (await res.json()).error], [400, 'invalid_input'])
})

// ── GET /documents/:id/diff y /preview ──────────────────────────────────────────────────────────────
Deno.test('diff: sin cambios frente a la vigente, changes vacío; con cambios, solo los campos distintos', async () => {
  const published = publishedDoc()
  const draftSame: ConsentDocumentRow = { ...published, id: 'doc-draft-same', version: '1.1', status: 'draft', based_on_id: published.id }
  const { documents } = makeDocsStore([published, draftSame])
  const d = fullDeps({ roles: ['privacy_editor'], documents })

  const resSame = await handle(req(await sign(claims()), '/documents/doc-draft-same/diff', 'GET'), d)
  const bodySame = await resSame.json()
  assertEquals(bodySame.base.id, published.id)
  assertEquals(bodySame.changes, {})

  await handle(req(await sign(claims()), '/documents/doc-draft-same', 'PATCH', { title: 'Título nuevo' }), d)
  const resDiff = await handle(req(await sign(claims()), '/documents/doc-draft-same/diff', 'GET'), d)
  const bodyDiff = await resDiff.json()
  assertEquals(Object.keys(bodyDiff.changes), ['title'])
  assertEquals(bodyDiff.changes.title, { before: published.title, after: 'Título nuevo' })
})

Deno.test('diff de un documento inexistente → 404', async () => {
  const res = await handle(req(await sign(claims()), '/documents/no-existe/diff', 'GET'), fullDeps({ roles: ['privacy_editor'] }))
  assertEquals(res.status, 404)
})

Deno.test('preview: resuelve marcadores con los settings vigentes y señala los que faltan', async () => {
  const draft = publishedDoc({ id: 'doc-draft-1', status: 'draft', published_by: null, published_at: null, content_md: '{{version}} / {{correo_privacidad}} / {{no_existe}}' })
  const { documents } = makeDocsStore([draft])
  const res = await handle(
    req(await sign(claims()), '/documents/doc-draft-1/preview', 'GET'),
    fullDeps({ roles: ['privacy_editor'], documents, settings: settingsDeps({ privacy_email: 'privacidad@example.test' }) }),
  )
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.unknown, ['no_existe'])
  assertEquals(body.rendered_md.includes('privacidad@example.test'), true)
})

// ── POST /documents/:id/publish (T14: publicar, transacción + cuatro ojos) ─────────────────────────
Deno.test('admin publica: retira la vigente, publica la nueva, bitácora con reason y before/after', async () => {
  const published = publishedDoc()
  const draft: ConsentDocumentRow = { ...published, id: 'doc-draft-1', version: '1.1', status: 'draft', published_by: null, published_at: null, based_on_id: published.id, updated_by: EDITOR_ID, updated_at: '2026-02-01T00:00:00Z' }
  const audit: AuditEntry[] = []
  const { documents, rows } = makeDocsStore([published, draft], { audit })
  const res = await handle(
    req(await sign(claims()), '/documents/doc-draft-1/publish', 'POST', { reason: 'nueva versión aprobada' }),
    fullDeps({ roles: ['privacy_admin'], documents }),
  )
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.status, 'published')
  assertEquals(body.published_by, ADMIN_ID)
  assertEquals(rows.find((r) => r.id === published.id)?.status, 'retired')
  assertEquals(rows.find((r) => r.id === published.id)?.retired_by, ADMIN_ID)
  assertEquals(audit[0].action, 'consent_document.publish')
  assertEquals(audit[0].reason, 'nueva versión aprobada')
  assertEquals((audit[0].before as ConsentDocumentRow).id, published.id)
  assertEquals((audit[0].after as ConsentDocumentRow).id, draft.id)
})

Deno.test('editor no puede publicar → 403 forbidden, nada cambia', async () => {
  const published = publishedDoc()
  const draft: ConsentDocumentRow = { ...published, id: 'doc-draft-1', version: '1.1', status: 'draft' }
  const { documents, rows } = makeDocsStore([published, draft])
  const res = await handle(
    req(await sign(claims()), '/documents/doc-draft-1/publish', 'POST', { reason: 'x' }),
    fullDeps({ roles: ['privacy_editor'], documents }),
  )
  assertEquals([res.status, (await res.json()).error], [403, 'forbidden'])
  assertEquals(rows.find((r) => r.id === draft.id)?.status, 'draft')
})

Deno.test('publicar sin reason → 400 reason_required', async () => {
  const { documents } = makeDocsStore([publishedDoc({ id: 'doc-draft-1', status: 'draft' })])
  const res = await handle(req(await sign(claims()), '/documents/doc-draft-1/publish', 'POST', {}), fullDeps({ roles: ['privacy_admin'], documents }))
  assertEquals([res.status, (await res.json()).error], [400, 'reason_required'])
})

Deno.test('cuatro ojos activo: quien editó el borrador no puede publicarlo él mismo', async () => {
  const draft = publishedDoc({ id: 'doc-draft-1', status: 'draft', published_by: null, published_at: null, updated_by: ADMIN_ID })
  const { documents } = makeDocsStore([draft])
  const res = await handle(
    req(await sign(claims()), '/documents/doc-draft-1/publish', 'POST', { reason: 'x' }),
    fullDeps({ roles: ['privacy_admin'], documents, settings: settingsDeps({ four_eyes_publish: true }) }),
  )
  assertEquals([res.status, (await res.json()).error], [403, 'four_eyes_required'])
})

Deno.test('cuatro ojos activo: otro admin SÍ puede publicar el borrador que editó el primero', async () => {
  const draft = publishedDoc({ id: 'doc-draft-1', status: 'draft', published_by: null, published_at: null, created_by: EDITOR_ID, updated_by: EDITOR_ID })
  const { documents } = makeDocsStore([draft])
  const res = await handle(
    req(await sign(claimsFor(ADMIN_ID)), '/documents/doc-draft-1/publish', 'POST', { reason: 'x' }),
    fullDeps({ roles: ['privacy_admin'], documents, settings: settingsDeps({ four_eyes_publish: true }) }),
  )
  assertEquals(res.status, 200)
})

Deno.test('publicar un borrador con marcador desconocido o sin resolver → 422 notice_invalid, nada cambia', async () => {
  const draft = publishedDoc({ id: 'doc-draft-1', status: 'draft', published_by: null, published_at: null, content_md: '{{no_existe}}' })
  const { documents, rows } = makeDocsStore([draft])
  const res = await handle(
    req(await sign(claims()), '/documents/doc-draft-1/publish', 'POST', { reason: 'x' }),
    fullDeps({ roles: ['privacy_admin'], documents }),
  )
  assertEquals([res.status, (await res.json()).error], [422, 'notice_invalid'])
  assertEquals(rows[0].status, 'draft')
})

Deno.test('publicar algo que no es borrador (ya publicado) → 409 not_draft', async () => {
  const { documents } = makeDocsStore([publishedDoc()])
  const res = await handle(
    req(await sign(claims()), '/documents/doc-pub-1/publish', 'POST', { reason: 'x' }),
    fullDeps({ roles: ['privacy_admin'], documents }),
  )
  assertEquals([res.status, (await res.json()).error], [409, 'not_draft'])
})

Deno.test('si la función de publicar falla (p.ej. la bitácora dentro de la transacción), nada cambia → 503 audit_failed', async () => {
  const published = publishedDoc()
  const draft: ConsentDocumentRow = { ...published, id: 'doc-draft-1', version: '1.1', status: 'draft', published_by: null, published_at: null }
  const { documents, rows } = makeDocsStore([published, draft], { failPublish: true })
  const res = await handle(
    req(await sign(claims()), '/documents/doc-draft-1/publish', 'POST', { reason: 'x' }),
    fullDeps({ roles: ['privacy_admin'], documents }),
  )
  assertEquals([res.status, (await res.json()).error], [503, 'audit_failed'])
  assertEquals(rows.find((r) => r.id === published.id)?.status, 'published') // nada cambió (ROLLBACK real, no hay nada que compensar)
  assertEquals(rows.find((r) => r.id === draft.id)?.status, 'draft')
})

// ── POST /documents/:id/retire (T14: descartar un borrador) ────────────────────────────────────────
Deno.test('admin retira (descarta) un borrador y queda en bitácora con reason', async () => {
  const draft = publishedDoc({ id: 'doc-draft-1', status: 'draft', published_by: null, published_at: null })
  const { documents, rows } = makeDocsStore([draft])
  const audit: AuditEntry[] = []
  const res = await handle(
    req(await sign(claims()), '/documents/doc-draft-1/retire', 'POST', { reason: 'borrador descartado' }),
    fullDeps({ roles: ['privacy_admin'], audit, documents }),
  )
  assertEquals(res.status, 200)
  assertEquals((await res.json()).status, 'retired')
  assertEquals(rows[0].status, 'retired')
  assertEquals(audit[0].action, 'consent_document.retire')
  assertEquals(audit[0].reason, 'borrador descartado')
})

Deno.test('editor no puede retirar → 403 forbidden', async () => {
  const { documents } = makeDocsStore([publishedDoc({ id: 'doc-draft-1', status: 'draft' })])
  const res = await handle(
    req(await sign(claims()), '/documents/doc-draft-1/retire', 'POST', { reason: 'x' }),
    fullDeps({ roles: ['privacy_editor'], documents }),
  )
  assertEquals([res.status, (await res.json()).error], [403, 'forbidden'])
})

Deno.test('retirar algo que no es borrador → 409 not_draft; sin reason → 400 reason_required', async () => {
  const { documents } = makeDocsStore([publishedDoc()])
  const d = fullDeps({ roles: ['privacy_admin'], documents })
  const resNotDraft = await handle(req(await sign(claims()), '/documents/doc-pub-1/retire', 'POST', { reason: 'x' }), d)
  assertEquals([resNotDraft.status, (await resNotDraft.json()).error], [409, 'not_draft'])

  const { documents: documents2 } = makeDocsStore([publishedDoc({ id: 'doc-draft-1', status: 'draft' })])
  const resNoReason = await handle(req(await sign(claims()), '/documents/doc-draft-1/retire', 'POST', {}), fullDeps({ roles: ['privacy_admin'], documents: documents2 }))
  assertEquals([resNoReason.status, (await resNoReason.json()).error], [400, 'reason_required'])
})

Deno.test('si falla la bitácora al retirar, se revierte el UPDATE → 503 audit_failed', async () => {
  const { documents, rows } = makeDocsStore([publishedDoc({ id: 'doc-draft-1', status: 'draft' })])
  const res = await handle(
    req(await sign(claims()), '/documents/doc-draft-1/retire', 'POST', { reason: 'x' }),
    fullDeps({ roles: ['privacy_admin'], documents, failAudit: true }),
  )
  assertEquals([res.status, (await res.json()).error], [503, 'audit_failed'])
  assertEquals(rows[0].status, 'draft')
})

// ── T15.b (REQ-14): GET/POST /settings ────────────────────────────────────────────────────────────────

const VALID_SETTINGS_BODY = {
  controller_name: 'CiberDojo — Club de Ciberseguridad ESPOL',
  controller_address: 'Guayaquil, Ecuador',
  controller_phone: '+593-4-000-0000',
  dpo_name: 'Nombre del delegado',
  dpo_contact: 'dpo@example.test',
  privacy_policy_url: 'https://example.test/privacidad',
  unsubscribe_subject: 'Baja y eliminación de datos',
  response_days: 20,
  ip_retention_days: 365,
}

Deno.test('GET /settings: cualquier rol del módulo ve la vigente', async () => {
  for (const role of ['privacy_editor', 'privacy_admin', 'privacy_auditor']) {
    const res = await handle(req(await sign(claims()), '/settings', 'GET'), fullDeps({ roles: [role] }))
    assertEquals(res.status, 200)
    assertEquals((await res.json()).settings_version, 1)
  }
})

Deno.test('admin guarda la configuración: 200 con settings_version+1, bitácora before/after, resto de campos actualizados', async () => {
  const audit: AuditEntry[] = []
  const settings = settingsDeps()
  const res = await handle(req(await sign(claims()), '/settings', 'POST', VALID_SETTINGS_BODY), fullDeps({ roles: ['privacy_admin'], audit, settings }))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.settings_version, 2)
  assertEquals(body.controller_name, VALID_SETTINGS_BODY.controller_name)
  assertEquals(body.response_days, 20)
  assertEquals(body.ip_retention_days, 365)
  // Campos que esta ruta no toca: se conservan de la vigente anterior.
  assertEquals(body.privacy_email, 'privacidad@example.test')
  assertEquals(body.four_eyes_publish, false)
  assertEquals(audit[0].action, 'privacy_settings.update')
  assertEquals(audit[0].entity, 'privacy_settings')
  assertEquals((audit[0].before as CurrentPrivacySettings).settings_version, 1)
  assertEquals((audit[0].after as CurrentPrivacySettings).settings_version, 2)
  // La vigente que ve un GET posterior ya es la nueva.
  const resGet = await handle(req(await sign(claims()), '/settings', 'GET'), fullDeps({ roles: ['privacy_admin'], settings }))
  assertEquals((await resGet.json()).settings_version, 2)
})

Deno.test('editor/auditor no pueden guardar la configuración → 403 forbidden, nada cambia', async () => {
  for (const role of ['privacy_editor', 'privacy_auditor']) {
    const settings = settingsDeps()
    const res = await handle(req(await sign(claims()), '/settings', 'POST', VALID_SETTINGS_BODY), fullDeps({ roles: [role], settings }))
    assertEquals([res.status, (await res.json()).error], [403, 'forbidden'])
    assertEquals((await settings.getCurrent())?.settings_version, 1)
  }
})

Deno.test('response_days fuera de rango (0 y 91) → 400 invalid_input, nada cambia', async () => {
  for (const response_days of [0, 91]) {
    const settings = settingsDeps()
    const res = await handle(
      req(await sign(claims()), '/settings', 'POST', { ...VALID_SETTINGS_BODY, response_days }),
      fullDeps({ roles: ['privacy_admin'], settings }),
    )
    assertEquals([res.status, (await res.json()).error], [400, 'invalid_input'])
    assertEquals((await settings.getCurrent())?.settings_version, 1)
  }
})

Deno.test('ip_retention_days negativo → 400 invalid_input, nada cambia', async () => {
  const settings = settingsDeps()
  const res = await handle(
    req(await sign(claims()), '/settings', 'POST', { ...VALID_SETTINGS_BODY, ip_retention_days: -1 }),
    fullDeps({ roles: ['privacy_admin'], settings }),
  )
  assertEquals([res.status, (await res.json()).error], [400, 'invalid_input'])
  assertEquals((await settings.getCurrent())?.settings_version, 1)
})

Deno.test('intentar enviar privacy_email en el body se ignora: no cambia el correo por esta vía', async () => {
  const settings = settingsDeps()
  const res = await handle(
    req(await sign(claims()), '/settings', 'POST', { ...VALID_SETTINGS_BODY, privacy_email: 'otro@example.test' }),
    fullDeps({ roles: ['privacy_admin'], settings }),
  )
  assertEquals(res.status, 200)
  assertEquals((await res.json()).privacy_email, 'privacidad@example.test')
})

Deno.test('GET /settings sin ninguna configuración → 503 settings_unavailable', async () => {
  const res = await handle(
    req(await sign(claims()), '/settings', 'GET'),
    fullDeps({ roles: ['privacy_admin'], settings: { getCurrent: () => Promise.resolve(null), insert: settingsDeps().insert } }),
  )
  assertEquals([res.status, (await res.json()).error], [503, 'settings_unavailable'])
})

Deno.test('PUT /settings → 405', async () => {
  const res = await handle(req(await sign(claims()), '/settings', 'PUT'), fullDeps({ roles: ['privacy_admin'] }))
  assertEquals(res.status, 405)
})

// ── T12.d.1 (REQ-21, D-15): get_email_transport / update_email_transport ──────────────────────────────

Deno.test('GET /email-transport sin nada configurado → 200 null', async () => {
  const res = await handle(req(await sign(claims()), '/email-transport', 'GET'), fullDeps({ roles: ['privacy_admin'] }))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), null)
})

Deno.test('admin configura smtp con contraseña: 200, password_set true, ciphertext NUNCA en la respuesta ni en la bitácora', async () => {
  const audit: AuditEntry[] = []
  const { emailTransport, rows } = makeEmailTransportStore()
  const res = await handle(
    req(await sign(claims()), '/email-transport', 'POST', {
      mode: 'smtp', from_name: 'CiberDojo', from_email: 'privacidad@example.test',
      smtp_host: 'smtp.example.test', smtp_port: 465, smtp_username: 'notificaciones', smtp_password: 'Secreto1',
    }),
    fullDeps({ roles: ['privacy_admin'], audit, emailTransport }),
  )
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals([body.transport_version, body.mode, body.password_set], [1, 'smtp', true])
  assertEquals('smtp_password_ciphertext' in body, false)
  assertEquals(rows[0].smtp_password_ciphertext, 'enc:v1:Secreto1')
  assertEquals(JSON.stringify(audit).includes('Secreto1'), false)
  assertEquals(JSON.stringify(audit).includes('enc:v1'), false)
  assertEquals(audit[0].action, 'email_transport.update')
  assertEquals(audit[0].entity, 'email_transport_settings')
  assertEquals(audit[0].before, null)
})

Deno.test('editor/auditor no pueden leer ni tocar el transporte → 403 forbidden', async () => {
  for (const role of ['privacy_editor', 'privacy_auditor']) {
    const resGet = await handle(req(await sign(claims()), '/email-transport', 'GET'), fullDeps({ roles: [role] }))
    assertEquals([resGet.status, (await resGet.json()).error], [403, 'forbidden'])
    const resPost = await handle(
      req(await sign(claims()), '/email-transport', 'POST', { mode: 'resend', from_name: 'x', from_email: 'a@example.test' }),
      fullDeps({ roles: [role] }),
    )
    assertEquals([resPost.status, (await resPost.json()).error], [403, 'forbidden'])
  }
})

Deno.test('pasar a smtp sin contraseña y sin una vigente → 400 smtp_password_required', async () => {
  const res = await handle(
    req(await sign(claims()), '/email-transport', 'POST', {
      mode: 'smtp', from_name: 'CiberDojo', from_email: 'privacidad@example.test',
      smtp_host: 'smtp.example.test', smtp_port: 465, smtp_username: 'notificaciones',
    }),
    fullDeps({ roles: ['privacy_admin'] }),
  )
  assertEquals([res.status, (await res.json()).error], [400, 'smtp_password_required'])
})

Deno.test('puerto fuera de 465/2525 → 400 invalid_input', async () => {
  const res = await handle(
    req(await sign(claims()), '/email-transport', 'POST', {
      mode: 'smtp', from_name: 'CiberDojo', from_email: 'privacidad@example.test',
      smtp_host: 'smtp.example.test', smtp_port: 587, smtp_username: 'notificaciones', smtp_password: 'Secreto1',
    }),
    fullDeps({ roles: ['privacy_admin'] }),
  )
  assertEquals([res.status, (await res.json()).error], [400, 'invalid_input'])
})

Deno.test('actualizar otro campo en modo smtp sin reenviar la contraseña: se re-cifra bajo la versión nueva, no se copia el mismo ciphertext', async () => {
  const initial: EmailTransportRow = {
    transport_version: 1, mode: 'smtp', from_name: 'CiberDojo', from_email: 'privacidad@example.test',
    smtp_host: 'smtp.example.test', smtp_port: 465, smtp_username: 'notificaciones',
    smtp_password_ciphertext: 'enc:v1:Secreto1', created_by: ADMIN_ID, created_at: '2026-10-01T00:00:00Z',
  }
  const { emailTransport, rows } = makeEmailTransportStore([initial])
  const res = await handle(
    req(await sign(claims()), '/email-transport', 'POST', {
      mode: 'smtp', from_name: 'CiberDojo (nuevo nombre)', from_email: 'privacidad@example.test',
      smtp_host: 'smtp.example.test', smtp_port: 465, smtp_username: 'notificaciones',
    }),
    fullDeps({ roles: ['privacy_admin'], emailTransport }),
  )
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals([body.transport_version, body.password_set, body.from_name], [2, true, 'CiberDojo (nuevo nombre)'])
  assertEquals(rows[1].smtp_password_ciphertext, 'enc:v2:Secreto1')
  assertEquals(rows[0].smtp_password_ciphertext, 'enc:v1:Secreto1') // la fila vieja no se toca (append-only)
})

Deno.test('cambiar de smtp a resend limpia los campos smtp y password_set pasa a false', async () => {
  const initial: EmailTransportRow = {
    transport_version: 1, mode: 'smtp', from_name: 'CiberDojo', from_email: 'privacidad@example.test',
    smtp_host: 'smtp.example.test', smtp_port: 465, smtp_username: 'notificaciones',
    smtp_password_ciphertext: 'enc:v1:Secreto1', created_by: ADMIN_ID, created_at: '2026-10-01T00:00:00Z',
  }
  const { emailTransport, rows } = makeEmailTransportStore([initial])
  const res = await handle(
    req(await sign(claims()), '/email-transport', 'POST', { mode: 'resend', from_name: 'CiberDojo', from_email: 'privacidad@example.test' }),
    fullDeps({ roles: ['privacy_admin'], emailTransport }),
  )
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals([body.mode, body.password_set, body.smtp_host, body.smtp_port, body.smtp_username], ['resend', false, null, null, null])
  assertEquals(rows[1].smtp_password_ciphertext, null)
})

// ── T12.d.2 (REQ-21, D-15): POST /email-transport/test ───────────────────────────────────────────────

const resendTransport = (over: Partial<EmailTransportRow> = {}): EmailTransportRow => ({
  transport_version: 1, mode: 'resend', from_name: 'CiberDojo', from_email: 'privacidad@example.test',
  smtp_host: null, smtp_port: null, smtp_username: null, smtp_password_ciphertext: null,
  created_by: ADMIN_ID, created_at: '2026-10-05T00:00:00Z', ...over,
})

Deno.test('correo de prueba en modo resend: 200, fila en email_transport_tests y bitácora con el actor correcto', async () => {
  const audit: AuditEntry[] = []
  const { emailTransport, tests } = makeEmailTransportStore([resendTransport()])
  const { email, sent } = makeEmailDeps()
  const res = await handle(
    req(await sign(claims()), '/email-transport/test', 'POST'),
    fullDeps({ roles: ['privacy_admin'], audit, emailTransport, email }),
  )
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { success: true, error_code: null })
  assertEquals(sent.length, 1)
  assertEquals(sent[0].message.to, 'Admin.Uno@Example.test')
  assertEquals(tests, [{ transport_version: 1, success: true, error_code: null, tested_by: ADMIN_ID }])
  assertEquals(audit[0].action, 'email_transport.test')
  assertEquals(audit[0].entity, 'email_transport_settings')
  assertEquals(audit[0].entity_id, '1')
  assertEquals(audit[0].after, { mode: 'resend', success: true, error_code: null, smtp_host: null, resolved_ip: null })
})

Deno.test('correo de prueba en modo smtp que falla: 200 success:false, error_code en email_transport_tests y en bitácora junto con host + IP resuelta', async () => {
  const audit: AuditEntry[] = []
  const smtpTransport = resendTransport({
    transport_version: 3, mode: 'smtp', smtp_host: 'smtp.example.test', smtp_port: 465,
    smtp_username: 'notificaciones', smtp_password_ciphertext: 'enc:v3:Secreto1',
  })
  const { emailTransport, tests } = makeEmailTransportStore([smtpTransport])
  const { email } = makeEmailDeps({ result: { ok: false, errorCode: 'smtp_send_failed', resolvedIp: '198.51.100.10' } })
  const res = await handle(
    req(await sign(claims()), '/email-transport/test', 'POST'),
    fullDeps({ roles: ['privacy_admin'], audit, emailTransport, email }),
  )
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { success: false, error_code: 'smtp_send_failed' })
  assertEquals(tests, [{ transport_version: 3, success: false, error_code: 'smtp_send_failed', tested_by: ADMIN_ID }])
  assertEquals(audit[0].after, {
    mode: 'smtp', success: false, error_code: 'smtp_send_failed', smtp_host: 'smtp.example.test', resolved_ip: '198.51.100.10',
  })
  assertEquals(JSON.stringify(audit).includes('Secreto1'), false)
  assertEquals(JSON.stringify(audit).includes('enc:v3'), false)
})

Deno.test('editor/auditor no pueden pedir un correo de prueba → 403 forbidden, nada enviado', async () => {
  for (const role of ['privacy_editor', 'privacy_auditor']) {
    const { emailTransport } = makeEmailTransportStore([resendTransport()])
    const { email, sent } = makeEmailDeps()
    const res = await handle(
      req(await sign(claims()), '/email-transport/test', 'POST'),
      fullDeps({ roles: [role], emailTransport, email }),
    )
    assertEquals([res.status, (await res.json()).error], [403, 'forbidden'])
    assertEquals(sent.length, 0)
  }
})

Deno.test('sin transporte configurado → 400 email_transport_not_configured, nada enviado', async () => {
  const { email, sent } = makeEmailDeps()
  const res = await handle(
    req(await sign(claims()), '/email-transport/test', 'POST'),
    fullDeps({ roles: ['privacy_admin'], email }),
  )
  assertEquals([res.status, (await res.json()).error], [400, 'email_transport_not_configured'])
  assertEquals(sent.length, 0)
})

Deno.test('límite de intentos agotado → 429 rate_limited, nada enviado', async () => {
  const { emailTransport } = makeEmailTransportStore([resendTransport()])
  const { email, sent } = makeEmailDeps({ rateLimited: 'email' })
  const res = await handle(
    req(await sign(claims()), '/email-transport/test', 'POST'),
    fullDeps({ roles: ['privacy_admin'], emailTransport, email }),
  )
  assertEquals([res.status, (await res.json()).error], [429, 'rate_limited'])
  assertEquals(sent.length, 0)
})

Deno.test('límite de intentos no disponible (fail-closed) → 503 rate_limit_unavailable, nada enviado', async () => {
  const { emailTransport } = makeEmailTransportStore([resendTransport()])
  const { email, sent } = makeEmailDeps({ rateLimited: 'unavailable' })
  const res = await handle(
    req(await sign(claims()), '/email-transport/test', 'POST'),
    fullDeps({ roles: ['privacy_admin'], emailTransport, email }),
  )
  assertEquals([res.status, (await res.json()).error], [503, 'rate_limit_unavailable'])
  assertEquals(sent.length, 0)
})

Deno.test('GET /email-transport/test → 405', async () => {
  const res = await handle(req(await sign(claims()), '/email-transport/test', 'GET'), fullDeps({ roles: ['privacy_admin'] }))
  assertEquals(res.status, 405)
})

// ── T12.d.3 (REQ-21f): GET /email-outbox y POST /email-outbox/resend ───────────────────────────────────

const outboxRow = (over: Partial<EmailOutboxRow> = {}): EmailOutboxRow => ({
  id: 'outbox-1', reference_table: 'data_subject_requests', reference_id: 'dsr-1', created_at: '2026-10-05T00:00:00Z', ...over,
})

Deno.test('GET /email-outbox: cuenta solo status=pending (una fila ya enviada no aparece)', async () => {
  const { emailOutbox } = makeEmailOutboxStore([outboxRow(), outboxRow({ id: 'outbox-2' })])
  await emailOutbox.markSent('outbox-2') // simula una fila ya enviada antes de esta petición
  const res = await handle(req(await sign(claims()), '/email-outbox', 'GET'), fullDeps({ roles: ['privacy_admin'], emailOutbox }))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.count, 1)
  assertEquals(body.items, [outboxRow()])
})

Deno.test('con FakeEmailSender, el reenvío marca los pendientes como enviados y deja el resumen en bitácora', async () => {
  const audit: AuditEntry[] = []
  const { emailOutbox, statusOf } = makeEmailOutboxStore([outboxRow(), outboxRow({ id: 'outbox-2', reference_id: 'dsr-2' })], {
    rebuild: (row) => Promise.resolve({ to: 'delegado@example.test', subject: `Caso ${row.reference_id}`, html: '<p>x</p>' }),
  })
  const { emailTransport } = makeEmailTransportStore([resendTransport()])
  const { email, sent } = makeEmailDeps()
  const res = await handle(
    req(await sign(claims()), '/email-outbox/resend', 'POST'),
    fullDeps({ roles: ['privacy_admin'], audit, emailOutbox, emailTransport, email }),
  )
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { attempted: 2, sent: 2, skipped: 0, failed: 0 })
  assertEquals(sent.length, 2)
  assertEquals(statusOf('outbox-1'), 'sent')
  assertEquals(statusOf('outbox-2'), 'sent')
  assertEquals(audit[0].action, 'email_outbox.resend')
  assertEquals(audit[0].entity, 'email_outbox')
  assertEquals(audit[0].entity_id, null)
  assertEquals(audit[0].after, { attempted: 2, sent: 2, skipped: 0, failed: 0 })
})

Deno.test('reintentar un aviso ya enviado no lo duplica: segunda llamada ve 0 pendientes', async () => {
  const { emailOutbox } = makeEmailOutboxStore([outboxRow()], {
    rebuild: (row) => Promise.resolve({ to: 'delegado@example.test', subject: row.reference_id, html: '<p>x</p>' }),
  })
  const { emailTransport } = makeEmailTransportStore([resendTransport()])
  const { email, sent } = makeEmailDeps()
  const d = fullDeps({ roles: ['privacy_admin'], emailOutbox, emailTransport, email })

  const first = await handle(req(await sign(claims()), '/email-outbox/resend', 'POST'), d)
  assertEquals(await first.json(), { attempted: 1, sent: 1, skipped: 0, failed: 0 })

  const second = await handle(req(await sign(claims()), '/email-outbox/resend', 'POST'), d)
  assertEquals(await second.json(), { attempted: 0, sent: 0, skipped: 0, failed: 0 })
  assertEquals(sent.length, 1) // el segundo intento no volvió a llamar a email.send
})

Deno.test('sin plantilla registrada para esa reference_table: la fila queda pendiente (skipped, no sent)', async () => {
  const { emailOutbox, statusOf } = makeEmailOutboxStore([outboxRow()]) // rebuild por defecto siempre devuelve null
  const { emailTransport } = makeEmailTransportStore([resendTransport()])
  const { email, sent } = makeEmailDeps()
  const res = await handle(
    req(await sign(claims()), '/email-outbox/resend', 'POST'),
    fullDeps({ roles: ['privacy_admin'], emailOutbox, emailTransport, email }),
  )
  assertEquals(await res.json(), { attempted: 1, sent: 0, skipped: 1, failed: 0 })
  assertEquals(sent.length, 0)
  assertEquals(statusOf('outbox-1'), 'pending')
})

Deno.test('si el envío real falla, la fila queda pendiente (failed, no sent) para reintentar después', async () => {
  const { emailOutbox, statusOf } = makeEmailOutboxStore([outboxRow()], {
    rebuild: (row) => Promise.resolve({ to: 'delegado@example.test', subject: row.reference_id, html: '<p>x</p>' }),
  })
  const { emailTransport } = makeEmailTransportStore([resendTransport()])
  const { email } = makeEmailDeps({ result: { ok: false, errorCode: 'smtp_send_failed' } })
  const res = await handle(
    req(await sign(claims()), '/email-outbox/resend', 'POST'),
    fullDeps({ roles: ['privacy_admin'], emailOutbox, emailTransport, email }),
  )
  assertEquals(await res.json(), { attempted: 1, sent: 0, skipped: 0, failed: 1 })
  assertEquals(statusOf('outbox-1'), 'pending')
})

Deno.test('sin transporte configurado y con pendientes: 400 email_transport_not_configured, nada enviado', async () => {
  const { emailOutbox, statusOf } = makeEmailOutboxStore([outboxRow()], {
    rebuild: (row) => Promise.resolve({ to: 'delegado@example.test', subject: row.reference_id, html: '<p>x</p>' }),
  })
  const { email, sent } = makeEmailDeps()
  const res = await handle(
    req(await sign(claims()), '/email-outbox/resend', 'POST'),
    fullDeps({ roles: ['privacy_admin'], emailOutbox, email }),
  )
  assertEquals([res.status, (await res.json()).error], [400, 'email_transport_not_configured'])
  assertEquals(sent.length, 0)
  assertEquals(statusOf('outbox-1'), 'pending')
})

Deno.test('sin pendientes: 200 con todo en cero, sin exigir transporte configurado', async () => {
  const { emailOutbox } = makeEmailOutboxStore([])
  const res = await handle(req(await sign(claims()), '/email-outbox/resend', 'POST'), fullDeps({ roles: ['privacy_admin'], emailOutbox }))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { attempted: 0, sent: 0, skipped: 0, failed: 0 })
})

Deno.test('editor/auditor no pueden listar ni reenviar avisos pendientes → 403 forbidden, nada enviado', async () => {
  for (const role of ['privacy_editor', 'privacy_auditor']) {
    const { emailOutbox } = makeEmailOutboxStore([outboxRow()], { rebuild: () => Promise.resolve({ to: 'x@example.test', subject: 'x', html: '<p>x</p>' }) })
    const { emailTransport } = makeEmailTransportStore([resendTransport()])
    const { email, sent } = makeEmailDeps()
    const resGet = await handle(req(await sign(claims()), '/email-outbox', 'GET'), fullDeps({ roles: [role], emailOutbox }))
    assertEquals([resGet.status, (await resGet.json()).error], [403, 'forbidden'])
    const resPost = await handle(
      req(await sign(claims()), '/email-outbox/resend', 'POST'),
      fullDeps({ roles: [role], emailOutbox, emailTransport, email }),
    )
    assertEquals([resPost.status, (await resPost.json()).error], [403, 'forbidden'])
    assertEquals(sent.length, 0)
  }
})

Deno.test('POST /email-outbox → 405; GET /email-outbox/resend → 405', async () => {
  const token = await sign(claims())
  assertEquals((await handle(req(token, '/email-outbox', 'POST'), fullDeps({ roles: ['privacy_admin'] }))).status, 405)
  assertEquals((await handle(req(token, '/email-outbox/resend', 'GET'), fullDeps({ roles: ['privacy_admin'] }))).status, 405)
})
