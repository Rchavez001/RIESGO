// admin-consent: API administrativa del módulo de consentimiento (SEC-02, SEC-03, H08). T05.a añadió
// `POST /admin-consent/session`; T14 añade las acciones de versiones y publicación de `consent_documents`
// (REQ-01, REQ-13 a–d, SEC-02). Configuración y bitácora/evidencia llegan en T15–T16.
//
// Toda ruta pasa por `requireRole` (JWT verificado + TOTP + rol en `admin_roles`) y queda atribuida al `actor_id` del
// token. La bitácora (`admin_audit_log`) no admite escrituras de `authenticated`: el registro lo hace `deps.audit` con la
// service role como mero transporte, siempre con el actor verificado aquí. Si no se puede registrar, la acción no ocurre
// (se revierten los UPDATE ya aplicados: ver `publishDocument`/`retireDocument`).
import { AuthError, PRIVACY_ROLES, requireRole, type AuthGuardOptions, type VerifiedUser } from '../_shared/auth-guard.ts'
import { renderConsent, sha256Hex, type PrivacySettingsForRender } from '../_shared/consent-render.ts'
import { z } from 'https://esm.sh/zod@3.23.8'

export interface AuditEntry {
  actor_id: string
  actor_email_hmac: string
  actor_role: string
  action: string
  entity: string
  entity_id: string | null
  before?: unknown
  after?: unknown
  reason?: string | null
}

export type ConsentDocumentStatus = 'draft' | 'published' | 'retired'

export interface ConsentDocumentRow {
  id: string
  version: string
  title: string
  content_md: string
  content_sha256: string
  purposes: unknown
  status: ConsentDocumentStatus
  requires_reconsent: boolean
  change_summary: string | null
  based_on_id: string | null
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string | null
  published_by: string | null
  published_at: string | null
  retired_by: string | null
  retired_at: string | null
}

export interface NewConsentDocumentInput {
  version: string
  title: string
  content_md: string
  content_sha256: string
  purposes: unknown
  requires_reconsent: boolean
  change_summary: string | null
  based_on_id: string | null
  created_by: string
}

export interface PublishInput {
  draftId: string
  actorId: string
  actorRole: string
  /** `admin.claims.aal` del JWT verificado (aal2 = TOTP confirmado). La función RPC lo vuelve a exigir
   *  por su cuenta — ver `publish_consent_document` en la migración 080 — como defensa en profundidad:
   *  la conexión a Postgres usa la service role, nunca el JWT del admin, así que no puede leer
   *  `auth.jwt()` del llamante real y confía en este parámetro tanto como en los demás. */
  actorAal: string | undefined
  actorEmailHmac: string
  reason: string
}

export interface DocumentsDeps {
  getPublished: () => Promise<ConsentDocumentRow | null>
  getById: (id: string) => Promise<ConsentDocumentRow | null>
  insert: (row: NewConsentDocumentInput) => Promise<ConsentDocumentRow>
  /** UPDATE ... WHERE id = id AND status = expectedStatus (RETURNING). null si ninguna fila coincidió
   *  (no existe, o alguien más cambió su estado entre medio: concurrencia optimista). NO se usa para
   *  publicar (ver `publish`): retirar la vigente y publicar el borrador deben ocurrir en UNA sola
   *  transacción real, algo que dos llamadas `updateIfStatus` sueltas no garantizan (T14 fix, 080). */
  updateIfStatus: (
    id: string,
    expectedStatus: ConsentDocumentStatus,
    patch: Partial<ConsentDocumentRow>,
  ) => Promise<ConsentDocumentRow | null>
  /** Retira la vigente (si hay una) + publica el borrador + deja bitácora, todo en UNA transacción real
   *  (RPC `publish_consent_document`, migración 080). Lanza `ApiError`/`AuthError` ya tipados. */
  publish: (input: PublishInput) => Promise<ConsentDocumentRow>
}

export interface CurrentPrivacySettings extends PrivacySettingsForRender {
  settings_version: number
  four_eyes_publish: boolean
}

export interface SettingsDeps {
  getCurrent: () => Promise<CurrentPrivacySettings | null>
}

export interface AdminConsentDeps {
  guard?: AuthGuardOptions
  /** HMAC del correo normalizado (clave propia de búsqueda, H15): la bitácora no guarda el correo en claro. */
  emailHmac: (email: string) => Promise<string>
  audit: (entry: AuditEntry) => Promise<void>
  documents: DocumentsDeps
  settings: SettingsDeps
}

/** Error de dominio con código de estado HTTP, para las acciones de /documents. Nunca lleva datos sensibles en `code`. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
    this.name = 'ApiError'
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

/** Sub-ruta tras el nombre de la función, tanto si llega como `/admin-consent/x` como `/functions/v1/admin-consent/x`. */
function route(req: Request): string {
  const path = new URL(req.url).pathname
  const i = path.indexOf('/admin-consent')
  return i === -1 ? path : path.slice(i + '/admin-consent'.length) || '/'
}

const PurposeSchema = z.object({
  code: z.string().min(1).max(100),
  label: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  required: z.boolean(),
  order: z.number().optional(),
})

const CreateDraftSchema = z.object({
  version: z.string().min(1).max(50),
  change_summary: z.string().max(2000).optional(),
  // Solo se usan si todavía no hay ninguna versión publicada (arranque, REQ-01): en cualquier otro caso
  // el borrador se clona de la vigente y estos campos se ignoran (se editan después con PATCH).
  title: z.string().min(1).max(300).optional(),
  content_md: z.string().min(1).max(100000).optional(),
  purposes: z.array(PurposeSchema).min(1).optional(),
  requires_reconsent: z.boolean().optional(),
})

const UpdateDraftSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    content_md: z.string().min(1).max(100000).optional(),
    purposes: z.array(PurposeSchema).min(1).optional(),
    requires_reconsent: z.boolean().optional(),
    change_summary: z.string().max(2000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'empty_patch' })

const ReasonSchema = z.object({ reason: z.string().trim().min(1).max(2000) })

type Admin = VerifiedUser & { roles: readonly (typeof PRIVACY_ROLES)[number][] }

async function auditLog(
  deps: AdminConsentDeps,
  admin: Admin,
  entry: { action: string; entity_id: string; before: unknown; after: unknown; reason?: string | null },
) {
  if (!admin.email) throw new AuthError(403, 'forbidden')
  await deps.audit({
    actor_id: admin.userId,
    actor_email_hmac: await deps.emailHmac(admin.email.trim().toLowerCase()),
    actor_role: admin.roles.join(','),
    action: entry.action,
    entity: 'consent_documents',
    entity_id: entry.entity_id,
    before: entry.before,
    after: entry.after,
    reason: entry.reason ?? null,
  })
}

async function createDraft(admin: Admin, deps: AdminConsentDeps, body: unknown): Promise<ConsentDocumentRow> {
  const parsed = CreateDraftSchema.safeParse(body)
  if (!parsed.success) throw new ApiError(400, 'invalid_input')
  const input = parsed.data

  const published = await deps.documents.getPublished()
  let newDoc: NewConsentDocumentInput
  if (published) {
    const contentMd = input.content_md ?? published.content_md
    newDoc = {
      version: input.version,
      title: input.title ?? published.title,
      content_md: contentMd,
      content_sha256: await sha256Hex(contentMd),
      purposes: input.purposes ?? published.purposes,
      requires_reconsent: input.requires_reconsent ?? false,
      change_summary: input.change_summary ?? null,
      based_on_id: published.id,
      created_by: admin.userId,
    }
  } else {
    // REQ-01: sin ninguna versión publicada todavía (arranque), el borrador no puede clonarse de nada.
    if (!input.title || !input.content_md || !input.purposes) {
      throw new ApiError(400, 'bootstrap_requires_title_content_purposes')
    }
    newDoc = {
      version: input.version,
      title: input.title,
      content_md: input.content_md,
      content_sha256: await sha256Hex(input.content_md),
      purposes: input.purposes,
      requires_reconsent: input.requires_reconsent ?? false,
      change_summary: input.change_summary ?? null,
      based_on_id: null,
      created_by: admin.userId,
    }
  }

  const created = await deps.documents.insert(newDoc)
  await auditLog(deps, admin, { action: 'consent_document.create', entity_id: created.id, before: null, after: created })
  return created
}

async function updateDraft(admin: Admin, deps: AdminConsentDeps, id: string, body: unknown): Promise<ConsentDocumentRow | null> {
  const parsed = UpdateDraftSchema.safeParse(body)
  if (!parsed.success) throw new ApiError(400, 'invalid_input')
  const patchInput = parsed.data

  const current = await deps.documents.getById(id)
  if (!current) return null
  if (current.status !== 'draft') throw new ApiError(409, 'not_draft')

  const patch: Partial<ConsentDocumentRow> = {
    ...patchInput,
    updated_by: admin.userId,
    updated_at: new Date().toISOString(),
  }
  if (patchInput.content_md !== undefined) patch.content_sha256 = await sha256Hex(patchInput.content_md)

  const updated = await deps.documents.updateIfStatus(id, 'draft', patch)
  if (!updated) throw new ApiError(409, 'concurrent_modification')
  await auditLog(deps, admin, { action: 'consent_document.update', entity_id: id, before: current, after: updated })
  return updated
}

const DIFF_FIELDS = ['title', 'content_md', 'purposes', 'requires_reconsent'] as const

async function diffDraft(deps: AdminConsentDeps, id: string) {
  const draft = await deps.documents.getById(id)
  if (!draft) return null
  const base = await deps.documents.getPublished()
  const changes: Partial<Record<(typeof DIFF_FIELDS)[number], { before: unknown; after: unknown }>> = {}
  for (const field of DIFF_FIELDS) {
    const before = base ? base[field] : null
    const after = draft[field]
    if (JSON.stringify(before) !== JSON.stringify(after)) changes[field] = { before, after }
  }
  return {
    base: base ? { id: base.id, version: base.version } : null,
    draft: { id: draft.id, version: draft.version, status: draft.status },
    changes,
  }
}

async function previewDraft(deps: AdminConsentDeps, id: string) {
  const draft = await deps.documents.getById(id)
  if (!draft) return null
  const settings = await deps.settings.getCurrent()
  if (!settings) throw new ApiError(503, 'settings_unavailable')
  const rendered = renderConsent(draft.content_md, settings, { version: draft.version, published_at: draft.published_at })
  return {
    document: { id: draft.id, version: draft.version, status: draft.status },
    rendered_md: rendered.text,
    rendered_sha256: await sha256Hex(rendered.text),
    unknown: rendered.unknown,
    unresolved: rendered.unresolved,
  }
}

async function publishDraft(admin: Admin, deps: AdminConsentDeps, id: string, body: unknown): Promise<ConsentDocumentRow | null> {
  const parsed = ReasonSchema.safeParse(body)
  if (!parsed.success) throw new ApiError(400, 'reason_required')

  const draft = await deps.documents.getById(id)
  if (!draft) return null
  if (draft.status !== 'draft') throw new ApiError(409, 'not_draft')

  const settings = await deps.settings.getCurrent()
  if (!settings) throw new ApiError(503, 'settings_unavailable')

  // SEC-02: "cuatro ojos" — comprobación rápida aquí (evita un viaje a la BD en el caso común); la
  // función RPC (080) la vuelve a hacer por su cuenta como respaldo, no por redundancia decorativa.
  if (settings.four_eyes_publish) {
    const lastEditor = draft.updated_by ?? draft.created_by
    if (lastEditor === admin.userId) throw new ApiError(403, 'four_eyes_required')
  }

  const now = new Date().toISOString()
  const rendered = renderConsent(draft.content_md, settings, { version: draft.version, published_at: now })
  if (rendered.unknown.length > 0 || rendered.unresolved.length > 0) throw new ApiError(422, 'notice_invalid')

  if (!admin.email) throw new AuthError(403, 'forbidden')

  // Retirar la vigente (si hay una) + publicar el borrador + bitácora, en UNA transacción real (RPC
  // `publish_consent_document`, 080): dos llamadas `updateIfStatus` sueltas no lo garantizan, porque
  // PostgREST ejecuta cada una como su propia transacción y la restricción DEFERRED de 077 se comprueba
  // al COMMIT de cada una por separado (verificado contra Postgres real; ver PROGRESS.md). Si la
  // inserción en `admin_audit_log` falla dentro de la función, Postgres revierte TODO — no hace falta
  // ningún UPDATE compensatorio manual aquí.
  return await deps.documents.publish({
    draftId: id,
    actorId: admin.userId,
    actorRole: admin.roles.join(','),
    actorAal: typeof admin.claims.aal === 'string' ? admin.claims.aal : undefined,
    actorEmailHmac: await deps.emailHmac(admin.email.trim().toLowerCase()),
    reason: parsed.data.reason,
  })
}

async function retireDraft(admin: Admin, deps: AdminConsentDeps, id: string, body: unknown): Promise<ConsentDocumentRow | null> {
  const parsed = ReasonSchema.safeParse(body)
  if (!parsed.success) throw new ApiError(400, 'reason_required')

  const draft = await deps.documents.getById(id)
  if (!draft) return null
  // Un borrador se descarta sin reemplazo (077 solo lo exige para published → retired). Retirar la
  // versión VIGENTE sin reemplazo no es una acción de esta ruta: ocurre como parte de `publish`.
  if (draft.status !== 'draft') throw new ApiError(409, 'not_draft')

  const now = new Date().toISOString()
  const retired = await deps.documents.updateIfStatus(id, 'draft', { status: 'retired', retired_by: admin.userId, retired_at: now })
  if (!retired) throw new ApiError(409, 'concurrent_modification')

  try {
    await auditLog(deps, admin, {
      action: 'consent_document.retire',
      entity_id: id,
      before: draft,
      after: retired,
      reason: parsed.data.reason,
    })
  } catch (err) {
    await deps.documents.updateIfStatus(id, 'retired', { status: 'draft', retired_by: null, retired_at: null })
    if (err instanceof AuthError) throw err
    throw new ApiError(503, 'audit_failed')
  }

  return retired
}

const EDITOR_ROLES = ['privacy_editor', 'privacy_admin'] as const
const ADMIN_ONLY = ['privacy_admin'] as const

export async function handle(req: Request, deps: AdminConsentDeps): Promise<Response> {
  const path = route(req)

  try {
    if (path === '/session') {
      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
      const admin = await requireRole(req, PRIVACY_ROLES, deps.guard)
      if (!admin.email) throw new AuthError(403, 'forbidden')
      const sessionId = typeof admin.claims.session_id === 'string' ? admin.claims.session_id : null
      try {
        await deps.audit({
          actor_id: admin.userId,
          actor_email_hmac: await deps.emailHmac(admin.email.trim().toLowerCase()),
          actor_role: admin.roles.join(','),
          action: 'admin.session_verified',
          entity: 'admin_session',
          entity_id: sessionId,
        })
      } catch {
        return json(503, { error: 'audit_failed' })
      }
      return json(200, { user_id: admin.userId, roles: admin.roles })
    }

    if (path === '/documents') {
      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
      const admin = await requireRole(req, EDITOR_ROLES, deps.guard)
      const body = await req.json().catch(() => ({}))
      const created = await createDraft(admin, deps, body)
      return json(201, created)
    }

    const docMatch = /^\/documents\/([^/]+)$/.exec(path)
    if (docMatch) {
      if (req.method !== 'PATCH') return json(405, { error: 'method_not_allowed' })
      const admin = await requireRole(req, EDITOR_ROLES, deps.guard)
      const body = await req.json().catch(() => ({}))
      const updated = await updateDraft(admin, deps, docMatch[1], body)
      if (!updated) return json(404, { error: 'not_found' })
      return json(200, updated)
    }

    const diffMatch = /^\/documents\/([^/]+)\/diff$/.exec(path)
    if (diffMatch) {
      if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' })
      await requireRole(req, EDITOR_ROLES, deps.guard)
      const result = await diffDraft(deps, diffMatch[1])
      if (!result) return json(404, { error: 'not_found' })
      return json(200, result)
    }

    const previewMatch = /^\/documents\/([^/]+)\/preview$/.exec(path)
    if (previewMatch) {
      if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' })
      await requireRole(req, EDITOR_ROLES, deps.guard)
      const result = await previewDraft(deps, previewMatch[1])
      if (!result) return json(404, { error: 'not_found' })
      return json(200, result)
    }

    const publishMatch = /^\/documents\/([^/]+)\/publish$/.exec(path)
    if (publishMatch) {
      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
      const admin = await requireRole(req, ADMIN_ONLY, deps.guard)
      const body = await req.json().catch(() => ({}))
      const published = await publishDraft(admin, deps, publishMatch[1], body)
      if (!published) return json(404, { error: 'not_found' })
      return json(200, published)
    }

    const retireMatch = /^\/documents\/([^/]+)\/retire$/.exec(path)
    if (retireMatch) {
      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
      const admin = await requireRole(req, ADMIN_ONLY, deps.guard)
      const body = await req.json().catch(() => ({}))
      const retired = await retireDraft(admin, deps, retireMatch[1], body)
      if (!retired) return json(404, { error: 'not_found' })
      return json(200, retired)
    }

    return json(404, { error: 'not_found' })
  } catch (err) {
    if (err instanceof AuthError) return json(err.status, { error: err.code })
    if (err instanceof ApiError) return json(err.status, { error: err.code })
    return json(500, { error: 'internal_error' })
  }
}
