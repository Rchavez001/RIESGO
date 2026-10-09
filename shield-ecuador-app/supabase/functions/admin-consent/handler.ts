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
import { buildEmailVerificationCodeEmail } from '../_shared/email/templates.ts'
import type { EmailMessage, EmailSendResult } from '../_shared/email/types.ts'
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

export interface NewPrivacySettingsInput {
  settings_version: number
  controller_name: string | null
  controller_address: string | null
  controller_phone: string | null
  privacy_email: string
  dpo_name: string | null
  dpo_contact: string | null
  privacy_policy_url: string | null
  unsubscribe_subject: string
  response_days: number
  ip_retention_days: number
  four_eyes_publish: boolean
  created_by: string
}

export interface SettingsDeps {
  getCurrent: () => Promise<CurrentPrivacySettings | null>
  /** INSERT de una sola tabla (sin problema de atomicidad, a diferencia de `documents.publish`). */
  insert: (row: NewPrivacySettingsInput) => Promise<CurrentPrivacySettings>
}

export interface EmailVerificationRow {
  id: string
  new_email: string
  code_hash: string
  expires_at: string
  attempts: number
  confirmed_at: string | null
  requested_by: string
  created_at: string
}

export interface NewEmailVerificationInput {
  new_email: string
  code_hash: string
  expires_at: string
  requested_by: string
}

export interface ConfirmEmailChangeInput {
  verificationId: string
  codeHash: string
  actorId: string
  actorRole: string
  /** Mismo motivo que `PublishInput.actorAal`: la función RPC (082) lo vuelve a exigir por su cuenta. */
  actorAal: string | undefined
  actorEmailHmac: string
}

export interface EmailVerificationDeps {
  insert: (row: NewEmailVerificationInput) => Promise<EmailVerificationRow>
  /** La más reciente con `confirmed_at IS NULL`; `null` si no hay ninguna pendiente. */
  getLatestPending: () => Promise<EmailVerificationRow | null>
  /** UPDATE de una sola fila con bloqueo optimista (`WHERE id = … AND attempts = row.attempts`): sube
   *  `attempts` en uno sin una carrera de leer-en-TS-y-escribir-a-ciegas frente a dos confirmaciones
   *  simultáneas. NO vive dentro de `confirm` (ver T15.a, migración 082): si viviera ahí, un error por
   *  código inválido revertiría también este incremento en la misma transacción. */
  incrementAttempts: (row: EmailVerificationRow) => Promise<void>
  /** RPC `confirm_privacy_email_change` (082, T15.a): marca `confirmed_at` + inserta la siguiente
   *  versión de `privacy_settings` con el correo nuevo, en UNA transacción real. */
  confirm: (input: ConfirmEmailChangeInput) => Promise<CurrentPrivacySettings>
}

export type EmailTransportMode = 'resend' | 'smtp'

export interface EmailTransportRow {
  transport_version: number
  mode: EmailTransportMode
  from_name: string
  from_email: string
  smtp_host: string | null
  smtp_port: number | null
  smtp_username: string | null
  /** Cifrado con AAD atada a `transport_version` (T12.d.1, D-15 condición (3) la reutiliza para el host/IP en T12.d.2). Nunca sale de este módulo en claro. */
  smtp_password_ciphertext: unknown | null
  created_by: string
  created_at: string
}

export type PublicEmailTransport = Omit<EmailTransportRow, 'smtp_password_ciphertext'> & { password_set: boolean }

export interface NewEmailTransportInput {
  transport_version: number
  mode: EmailTransportMode
  from_name: string
  from_email: string
  smtp_host: string | null
  smtp_port: number | null
  smtp_username: string | null
  smtp_password_ciphertext: unknown | null
  created_by: string
}

export interface EmailTransportDeps {
  getCurrent: () => Promise<EmailTransportRow | null>
  insert: (row: NewEmailTransportInput) => Promise<EmailTransportRow>
  /** Cifra una contraseña nueva bajo la AAD de la versión que se va a insertar (todavía no existe como fila). */
  encryptPassword: (password: string, transportVersion: number) => Promise<unknown>
  /** Descifra la contraseña de una fila YA EXISTENTE con la AAD atada a su propio `transport_version`
   *  (nunca la de otra fila): así, cuando el admin no envía una contraseña nueva, se puede re-cifrar bajo
   *  la versión siguiente sin arrastrar el mismo ciphertext de una versión a otra. */
  decryptPassword: (row: EmailTransportRow) => Promise<string>
  /** T12.d.2: registra el resultado de un correo de prueba (REQ-21) — nunca el texto del correo ni la contraseña. */
  recordTest: (input: { transportVersion: number; success: boolean; errorCode: string | null; testedBy: string }) => Promise<void>
}

export interface RateLimitCheck {
  allowed: boolean
  reason?: string
}

export interface EmailDeps {
  /** Envía con el proveedor del modo vigente (resend o smtp) — nunca lanza; un fallo del proveedor se
   *  traduce a `EmailSendResult.ok = false` con un código estable (T12.a/T12.c). */
  send: (transport: EmailTransportRow, message: EmailMessage) => Promise<EmailSendResult>
  /** Mismo patrón fail-closed que T10/T11 (rate-limit.ts), con clave HMAC del admin que pide la prueba. */
  checkTestRateLimit: (req: Request, actorEmail: string) => Promise<RateLimitCheck>
}

/** Fila de `email_outbox` (079): solo un puntero a la fila de origen, sin correo ni datos del titular. */
export interface EmailOutboxRow {
  id: string
  reference_table: string
  reference_id: string
  created_at: string
}

export interface EmailOutboxDeps {
  /** Solo `status = 'pending'`, de más antiguo a más nuevo. */
  listPending: () => Promise<EmailOutboxRow[]>
  /** Reconstruye el mensaje a partir de la fila de origen (`reference_table`/`reference_id`). `null` si
   *  todavía no hay una plantilla registrada para esa tabla (p. ej. antes de que T13/T12.d.4 la añadan):
   *  la fila se deja pendiente — nunca se marca enviada sin un envío real. */
  rebuildMessage: (row: EmailOutboxRow) => Promise<EmailMessage | null>
  /** `mark_email_outbox_sent` (079): única forma de tocar una fila existente. */
  markSent: (id: string) => Promise<void>
}

/** Fila de `admin_audit_log` (073) tal como la lee el panel — sin ip_ciphertext/ip_hmac/key_version:
 *  esos tres campos existen en la tabla para la IP del propio admin (REQ-16), pero ningún llamador de
 *  `deps.audit` los rellena todavía (ver nota en PROGRESS.md, pendiente fuera del alcance de T16.a). */
export interface AuditLogRow {
  id: number
  actor_id: string | null
  actor_email_hmac: string
  actor_role: string
  action: string
  entity: string
  entity_id: string | null
  before: unknown
  after: unknown
  diff: string | null
  reason: string | null
  created_at: string
}

export interface AuditLogFilter {
  from?: string
  to?: string
  actorId?: string
  action?: string
  limit: number
  offset: number
}

export interface AuditTrailDeps {
  /** `total` es el número de filas que cumplen el filtro (sin paginar), no el tamaño de `items`. */
  list: (filter: AuditLogFilter) => Promise<{ items: AuditLogRow[]; total: number }>
}

/** Fila de `consent_records` (073) tal como la ve el panel (REQ-17): la IP ya llega descifrada y
 *  ENMASCARADA — nunca el texto cifrado ni la IP en claro. "Revelar IP" es una ruta aparte (T16.d,
 *  solo `privacy_admin`, con motivo y bitácora), no esta. */
export interface EvidenceRow {
  document_version: string
  purpose_code: string
  decision: 'granted' | 'denied' | 'revoked'
  channel: string
  server_ts: string
  rendered_sha256: string
  ip_masked: string | null
}

export interface EvidenceDeps {
  /** HMAC con la misma clave de búsqueda que `users.email_lookup_hmac` (correo ya normalizado,
   *  LOOKUP_HMAC_KEY_B64) — nunca `ILIKE` sobre una columna cifrada (REQ-17). `null` si ningún
   *  usuario tiene ese correo: no inventa una coincidencia. */
  findUserIdByEmailHmac: (emailHmac: string) => Promise<string | null>
  /** Historial de `consent_records` de un usuario (más reciente primero). */
  listByUserId: (userId: string) => Promise<EvidenceRow[]>
}

export interface AdminConsentDeps {
  guard?: AuthGuardOptions
  /** HMAC del correo normalizado (clave propia de búsqueda, H15): la bitácora no guarda el correo en claro. */
  emailHmac: (email: string) => Promise<string>
  audit: (entry: AuditEntry) => Promise<void>
  documents: DocumentsDeps
  settings: SettingsDeps
  emailVerification: EmailVerificationDeps
  emailTransport: EmailTransportDeps
  email: EmailDeps
  emailOutbox: EmailOutboxDeps
  auditTrail: AuditTrailDeps
  evidence: EvidenceDeps
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

// REQ-14, sin `privacy_email` (esa solo cambia por T15.c/`request_email_change`+`confirm_email_verification`,
// nunca por esta ruta). Si el body la incluye, zod la descarta en silencio (no forma parte del schema).
const UpdateSettingsSchema = z.object({
  controller_name: z.string().trim().min(1).max(300).nullable(),
  controller_address: z.string().trim().min(1).max(500).nullable(),
  controller_phone: z.string().trim().min(1).max(50).nullable(),
  dpo_name: z.string().trim().min(1).max(300).nullable(),
  dpo_contact: z.string().trim().min(1).max(300).nullable(),
  privacy_policy_url: z.string().trim().url().max(500).nullable(),
  unsubscribe_subject: z.string().trim().min(1).max(300),
  response_days: z.number().int().min(1).max(90),
  ip_retention_days: z.number().int().min(0),
})

// REQ-15: el correo nuevo solo cambia de verdad en `confirm_privacy_email_change` (082); aquí solo se
// valida el tamaño/forma básica — el CHECK real de `privacy_email_verifications.new_email` (075) es la
// última palabra sobre el formato.
const RequestEmailChangeSchema = z.object({
  new_email: z.string().trim().min(1).max(254),
})

const ConfirmEmailChangeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'invalid_code_format'),
})

// REQ-16: `from`/`to` aceptan cualquier string parseable como fecha (fecha sola o fecha-hora completa);
// `limit` tope 200 para no permitir un volcado completo de la bitácora en una sola respuesta.
const isoDateString = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'invalid_date' })

const AuditLogQuerySchema = z.object({
  from: isoDateString.optional(),
  to: isoDateString.optional(),
  actor_id: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// T16.b: mismos filtros que /audit-log, sin limit/offset (la exportación no pagina: ver MAX_AUDIT_EXPORT_ROWS).
const AuditLogExportFilterSchema = AuditLogQuerySchema.omit({ limit: true, offset: true })

// T16.c (REQ-17): exactamente un identificador — correo (buscado por HMAC) o user_id directo, nunca los dos
// ni ninguno (ambigüedad en qué titular se busca).
const EvidenceSearchSchema = z
  .object({
    email: z.string().trim().min(3).max(254).optional(),
    user_id: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.email) !== Boolean(v.user_id), { message: 'exactly_one_of_email_or_user_id' })

// Mismo tope de puerto que el anti-SSRF de T12.c y el CHECK de la 079: 465/2525 únicos, nunca 25/587.
const UpdateEmailTransportSchema = z.object({
  mode: z.enum(['resend', 'smtp']),
  from_name: z.string().trim().min(1).max(300),
  from_email: z.string().trim().min(1).max(254),
  smtp_host: z.string().trim().min(1).max(255).optional(),
  smtp_port: z.union([z.literal(465), z.literal(2525)]).optional(),
  smtp_username: z.string().trim().min(1).max(255).optional(),
  /** Si se omite en modo `smtp`, se conserva el acceso vigente (ver `updateEmailTransport`): nunca se
   *  reenvía la contraseña actual desde el panel para "no cambiarla". */
  smtp_password: z.string().min(1).max(500).optional(),
})

type Admin = VerifiedUser & { roles: readonly (typeof PRIVACY_ROLES)[number][] }

async function auditLog(
  deps: AdminConsentDeps,
  admin: Admin,
  entry: { action: string; entity: string; entity_id: string | null; before: unknown; after: unknown; reason?: string | null },
) {
  if (!admin.email) throw new AuthError(403, 'forbidden')
  await deps.audit({
    actor_id: admin.userId,
    actor_email_hmac: await deps.emailHmac(admin.email.trim().toLowerCase()),
    actor_role: admin.roles.join(','),
    action: entry.action,
    entity: entry.entity,
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
  await auditLog(deps, admin, { action: 'consent_document.create', entity: 'consent_documents', entity_id: created.id, before: null, after: created })
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
  await auditLog(deps, admin, { action: 'consent_document.update', entity: 'consent_documents', entity_id: id, before: current, after: updated })
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
      entity: 'consent_documents',
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

async function updateSettings(admin: Admin, deps: AdminConsentDeps, body: unknown): Promise<CurrentPrivacySettings> {
  const parsed = UpdateSettingsSchema.safeParse(body)
  if (!parsed.success) throw new ApiError(400, 'invalid_input')
  const input = parsed.data

  const current = await deps.settings.getCurrent()
  if (!current) throw new ApiError(503, 'settings_unavailable')

  // `privacy_email` y `four_eyes_publish` no son campos de esta ruta (REQ-14 no los lista; el primero
  // solo cambia por T15.c): se copian de la vigente para no resetearlos a su valor por defecto en cada
  // guardado.
  const created = await deps.settings.insert({
    settings_version: current.settings_version + 1,
    ...input,
    privacy_email: current.privacy_email,
    four_eyes_publish: current.four_eyes_publish,
    created_by: admin.userId,
  })

  await auditLog(deps, admin, {
    action: 'privacy_settings.update',
    entity: 'privacy_settings',
    entity_id: String(created.settings_version),
    before: current,
    after: created,
  })

  return created
}

// REQ-15: 6 dígitos, `crypto.getRandomValues` (nunca `Math.random`) — mismo estándar que el resto del
// módulo exige para cualquier valor con función de seguridad.
function generateVerificationCode(): string {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(bytes[0] % 1_000_000).padStart(6, '0')
}

const MAX_EMAIL_VERIFICATION_ATTEMPTS = 5

async function requestEmailChange(admin: Admin, deps: AdminConsentDeps, body: unknown): Promise<{ expires_at: string }> {
  const parsed = RequestEmailChangeSchema.safeParse(body)
  if (!parsed.success) throw new ApiError(400, 'invalid_input')
  const newEmail = parsed.data.new_email

  const transport = await deps.emailTransport.getCurrent()
  if (!transport) throw new ApiError(400, 'email_transport_not_configured')

  const code = generateVerificationCode()
  // REQ-15/REQ-21(f): el código de verificación NUNCA se encola en `email_outbox` — si el envío falla,
  // se informa al instante en vez de reintentar después con un código que la persona nunca recibió.
  const result = await deps.email.send(transport, buildEmailVerificationCodeEmail({ to: newEmail, code }))
  if (!result.ok) throw new ApiError(502, 'email_send_failed')

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const created = await deps.emailVerification.insert({
    new_email: newEmail,
    code_hash: await sha256Hex(code),
    expires_at: expiresAt,
    requested_by: admin.userId,
  })

  // Nunca el código ni su hash en la bitácora.
  await auditLog(deps, admin, {
    action: 'privacy_email_change.request',
    entity: 'privacy_email_verifications',
    entity_id: created.id,
    before: null,
    after: { new_email: created.new_email, expires_at: created.expires_at },
  })

  return { expires_at: created.expires_at }
}

async function confirmEmailChange(admin: Admin, deps: AdminConsentDeps, body: unknown): Promise<CurrentPrivacySettings> {
  const parsed = ConfirmEmailChangeSchema.safeParse(body)
  if (!parsed.success) throw new ApiError(400, 'invalid_input')

  const pending = await deps.emailVerification.getLatestPending()
  if (!pending) throw new ApiError(404, 'not_found')
  // Agotados/vencidos se comprueban ANTES del hash y sin tocar la fila: así nunca se incrementa
  // `attempts` por encima de MAX_EMAIL_VERIFICATION_ATTEMPTS ni se sigue adivinando sobre un código
  // que ya no puede confirmarse de todos modos.
  if (pending.attempts >= MAX_EMAIL_VERIFICATION_ATTEMPTS) throw new ApiError(429, 'attempts_exhausted')
  if (new Date(pending.expires_at).getTime() <= Date.now()) throw new ApiError(410, 'code_expired')

  const codeHash = await sha256Hex(parsed.data.code)
  if (codeHash !== pending.code_hash) {
    await deps.emailVerification.incrementAttempts(pending)
    throw new ApiError(400, 'invalid_code')
  }

  if (!admin.email) throw new AuthError(403, 'forbidden')
  // La bitácora de esta confirmación la deja la propia RPC (082), en la misma transacción que marca
  // `confirmed_at` e inserta la versión nueva de `privacy_settings` — no hace falta otro `auditLog` aquí.
  return await deps.emailVerification.confirm({
    verificationId: pending.id,
    codeHash,
    actorId: admin.userId,
    actorRole: admin.roles.join(','),
    actorAal: typeof admin.claims.aal === 'string' ? admin.claims.aal : undefined,
    actorEmailHmac: await deps.emailHmac(admin.email.trim().toLowerCase()),
  })
}

function toPublicEmailTransport(row: EmailTransportRow): PublicEmailTransport {
  const { smtp_password_ciphertext, ...rest } = row
  return { ...rest, password_set: !!smtp_password_ciphertext }
}

async function updateEmailTransport(admin: Admin, deps: AdminConsentDeps, body: unknown): Promise<EmailTransportRow> {
  const parsed = UpdateEmailTransportSchema.safeParse(body)
  if (!parsed.success) throw new ApiError(400, 'invalid_input')
  const input = parsed.data

  const current = await deps.emailTransport.getCurrent()
  const nextVersion = (current?.transport_version ?? 0) + 1

  let smtpHost: string | null = null
  let smtpPort: number | null = null
  let smtpUsername: string | null = null
  let smtpPasswordCiphertext: unknown | null = null

  if (input.mode === 'smtp') {
    if (!input.smtp_host || !input.smtp_port || !input.smtp_username) throw new ApiError(400, 'smtp_fields_required')
    smtpHost = input.smtp_host
    smtpPort = input.smtp_port
    smtpUsername = input.smtp_username

    if (input.smtp_password) {
      smtpPasswordCiphertext = await deps.emailTransport.encryptPassword(input.smtp_password, nextVersion)
    } else if (current?.mode === 'smtp' && current.smtp_password_ciphertext) {
      // El admin no reenvía la contraseña vigente: se descifra bajo la AAD de SU PROPIA versión y se
      // re-cifra bajo la nueva — nunca se copia el mismo ciphertext de una fila a otra (T12.d.1).
      const existingPassword = await deps.emailTransport.decryptPassword(current)
      smtpPasswordCiphertext = await deps.emailTransport.encryptPassword(existingPassword, nextVersion)
    } else {
      throw new ApiError(400, 'smtp_password_required')
    }
  }

  const created = await deps.emailTransport.insert({
    transport_version: nextVersion,
    mode: input.mode,
    from_name: input.from_name,
    from_email: input.from_email,
    smtp_host: smtpHost,
    smtp_port: smtpPort,
    smtp_username: smtpUsername,
    smtp_password_ciphertext: smtpPasswordCiphertext,
    created_by: admin.userId,
  })

  await auditLog(deps, admin, {
    action: 'email_transport.update',
    entity: 'email_transport_settings',
    entity_id: String(created.transport_version),
    before: current ? toPublicEmailTransport(current) : null,
    after: toPublicEmailTransport(created),
  })

  return created
}

async function sendTestEmail(admin: Admin, deps: AdminConsentDeps, req: Request): Promise<{ success: boolean; error_code: string | null }> {
  if (!admin.email) throw new AuthError(403, 'forbidden')

  const rate = await deps.email.checkTestRateLimit(req, admin.email)
  if (!rate.allowed) {
    if (rate.reason === 'unavailable') throw new ApiError(503, 'rate_limit_unavailable')
    throw new ApiError(429, 'rate_limited')
  }

  const current = await deps.emailTransport.getCurrent()
  if (!current) throw new ApiError(400, 'email_transport_not_configured')

  const message: EmailMessage = {
    to: admin.email,
    subject: 'Correo de prueba — Consentimiento informado (CiberDojo)',
    html: '<p>Este es un correo de prueba del transporte de correo saliente configurado en el panel de Consentimiento informado.</p>',
  }
  const result = await deps.email.send(current, message)
  const errorCode = result.ok ? null : (result.errorCode ?? 'unknown_error')

  await deps.emailTransport.recordTest({
    transportVersion: current.transport_version,
    success: result.ok,
    errorCode,
    testedBy: admin.userId,
  })

  // D-15 condición (3): host + IP validada quedan en la bitácora en cada intento, éxito o fallo —
  // nunca solo en el camino feliz. En modo resend no hay `resolvedIp` (SmtpSender es quien lo calcula).
  await auditLog(deps, admin, {
    action: 'email_transport.test',
    entity: 'email_transport_settings',
    entity_id: String(current.transport_version),
    before: null,
    after: {
      mode: current.mode,
      success: result.ok,
      error_code: errorCode,
      smtp_host: current.mode === 'smtp' ? current.smtp_host : null,
      resolved_ip: result.resolvedIp ?? null,
    },
  })

  return { success: result.ok, error_code: errorCode }
}

async function listPendingEmails(deps: AdminConsentDeps): Promise<{ count: number; items: EmailOutboxRow[] }> {
  const items = await deps.emailOutbox.listPending()
  return { count: items.length, items }
}

/** T12.d.3 (REQ-21f): reintenta los avisos que quedaron en `email_outbox` tras un fallo del transporte
 *  activo. `rebuildMessage` puede devolver `null` (ninguna plantilla registrada todavía para esa
 *  `reference_table`, p. ej. antes de que T13/T12.d.4 la añadan): esa fila se cuenta como `skipped`, no
 *  se marca enviada. Nunca duplica un envío: solo opera sobre filas `status = 'pending'`. */
async function resendPendingEmails(
  admin: Admin,
  deps: AdminConsentDeps,
): Promise<{ attempted: number; sent: number; skipped: number; failed: number }> {
  const pending = await deps.emailOutbox.listPending()
  let sent = 0, skipped = 0, failed = 0
  if (pending.length > 0) {
    const transport = await deps.emailTransport.getCurrent()
    if (!transport) throw new ApiError(400, 'email_transport_not_configured')
    for (const row of pending) {
      const message = await deps.emailOutbox.rebuildMessage(row)
      if (!message) {
        skipped += 1
        continue
      }
      const result = await deps.email.send(transport, message)
      if (result.ok) {
        await deps.emailOutbox.markSent(row.id)
        sent += 1
      } else {
        failed += 1
      }
    }
  }

  const summary = { attempted: pending.length, sent, skipped, failed }
  await auditLog(deps, admin, { action: 'email_outbox.resend', entity: 'email_outbox', entity_id: null, before: null, after: summary })
  return summary
}

/** T16.a (REQ-16): solo lectura, sin restricción de rol más allá de pertenecer al módulo — el candado de
 *  REQ-17 ("Revelar IP") es de otra ruta (T16.d), no de ver la bitácora. */
async function listAuditLog(deps: AdminConsentDeps, url: URL): Promise<{ items: AuditLogRow[]; total: number }> {
  const query: Record<string, string> = {}
  for (const key of ['from', 'to', 'actor_id', 'action', 'limit', 'offset']) {
    const value = url.searchParams.get(key)
    if (value !== null) query[key] = value
  }
  const parsed = AuditLogQuerySchema.safeParse(query)
  if (!parsed.success) throw new ApiError(400, 'invalid_input')
  const { from, to, actor_id, action, limit, offset } = parsed.data
  return await deps.auditTrail.list({ from, to, actorId: actor_id, action, limit, offset })
}

/** T16.c (REQ-17): el correo nunca se busca con `ILIKE` sobre una columna cifrada — se hashea con la
 *  misma clave de búsqueda que `users.email_lookup_hmac` y se compara por HMAC. Si no hay ningún
 *  usuario con ese correo (o el `user_id` no tiene evidencia todavía), la respuesta es una lista vacía,
 *  nunca un 404: no distingue de forma visible "no existe" de "existe sin historial". */
async function searchEvidence(deps: AdminConsentDeps, url: URL): Promise<{ user_id: string | null; items: EvidenceRow[] }> {
  const query: Record<string, string> = {}
  for (const key of ['email', 'user_id']) {
    const value = url.searchParams.get(key)
    if (value !== null) query[key] = value
  }
  const parsed = EvidenceSearchSchema.safeParse(query)
  if (!parsed.success) throw new ApiError(400, 'invalid_input')

  const userId = parsed.data.user_id
    ? parsed.data.user_id
    : await deps.evidence.findUserIdByEmailHmac(await deps.emailHmac(parsed.data.email!.trim().toLowerCase()))
  if (!userId) return { user_id: null, items: [] }
  const items = await deps.evidence.listByUserId(userId)
  return { user_id: userId, items }
}

// T16.b (REQ-16): tope de filas por exportación — una exportación sin tope podría volcar toda la bitácora
// histórica en una sola respuesta; si el filtro pide más, `exportAuditLogCsv` lo señala en `truncated`.
const MAX_AUDIT_EXPORT_ROWS = 5000

const AUDIT_LOG_CSV_COLUMNS = [
  'id', 'actor_id', 'actor_email_hmac', 'actor_role', 'action', 'entity', 'entity_id', 'before', 'after', 'diff', 'reason', 'created_at',
] as const

/** Escapa un valor para una celda CSV y neutraliza inyección de fórmulas (OWASP): si el valor empieza con
 *  `=`, `+`, `-` o `@`, Excel/Sheets podría interpretarlo como fórmula al abrir el archivo exportado — se
 *  le antepone un apóstrofe, igual que hace Google Sheets al importar texto ajeno. */
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function auditLogToCsv(rows: AuditLogRow[]): string {
  const lines = [AUDIT_LOG_CSV_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(AUDIT_LOG_CSV_COLUMNS.map((key) => csvCell((row as unknown as Record<string, unknown>)[key])).join(','))
  }
  return lines.map((line) => `${line}\r\n`).join('')
}

/** T16.b (REQ-16): misma lectura que `listAuditLog`, sin paginar (hasta `MAX_AUDIT_EXPORT_ROWS`), con
 *  `reason` obligatorio (SPEC: "reason… obligatorio para… export") porque el resultado sale del sistema
 *  como archivo. La propia exportación queda en la bitácora (`audit.export`) con el filtro y el recuento
 *  de filas — nunca el contenido exportado, que ya es idéntico a lo que `GET /audit-log` deja leer. */
async function exportAuditLogCsv(
  deps: AdminConsentDeps,
  admin: Admin,
  url: URL,
): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
  const query: Record<string, string> = {}
  for (const key of ['from', 'to', 'actor_id', 'action']) {
    const value = url.searchParams.get(key)
    if (value !== null) query[key] = value
  }
  const parsedFilter = AuditLogExportFilterSchema.safeParse(query)
  if (!parsedFilter.success) throw new ApiError(400, 'invalid_input')

  const parsedReason = ReasonSchema.safeParse({ reason: url.searchParams.get('reason') ?? '' })
  if (!parsedReason.success) throw new ApiError(400, 'reason_required')

  const { from, to, actor_id, action } = parsedFilter.data
  const { items, total } = await deps.auditTrail.list({
    from, to, actorId: actor_id, action, limit: MAX_AUDIT_EXPORT_ROWS, offset: 0,
  })
  const csv = auditLogToCsv(items)

  await auditLog(deps, admin, {
    action: 'audit.export',
    entity: 'admin_audit_log',
    entity_id: null,
    before: null,
    after: { from: from ?? null, to: to ?? null, actor_id: actor_id ?? null, action: action ?? null, row_count: items.length, total_matching: total },
    reason: parsedReason.data.reason,
  })

  return { csv, rowCount: items.length, truncated: total > items.length }
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

    if (path === '/settings') {
      if (req.method === 'GET') {
        await requireRole(req, PRIVACY_ROLES, deps.guard)
        const current = await deps.settings.getCurrent()
        if (!current) throw new ApiError(503, 'settings_unavailable')
        return json(200, current)
      }
      if (req.method === 'POST') {
        const admin = await requireRole(req, ADMIN_ONLY, deps.guard)
        const body = await req.json().catch(() => ({}))
        const updated = await updateSettings(admin, deps, body)
        return json(200, updated)
      }
      return json(405, { error: 'method_not_allowed' })
    }

    if (path === '/settings/email-change') {
      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
      const admin = await requireRole(req, ADMIN_ONLY, deps.guard)
      const body = await req.json().catch(() => ({}))
      const result = await requestEmailChange(admin, deps, body)
      return json(200, result)
    }

    if (path === '/settings/email-change/confirm') {
      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
      const admin = await requireRole(req, ADMIN_ONLY, deps.guard)
      const body = await req.json().catch(() => ({}))
      const result = await confirmEmailChange(admin, deps, body)
      return json(200, result)
    }

    if (path === '/email-transport/test') {
      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
      const admin = await requireRole(req, ADMIN_ONLY, deps.guard)
      const result = await sendTestEmail(admin, deps, req)
      return json(200, result)
    }

    if (path === '/email-outbox/resend') {
      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
      const admin = await requireRole(req, ADMIN_ONLY, deps.guard)
      const result = await resendPendingEmails(admin, deps)
      return json(200, result)
    }

    if (path === '/email-outbox') {
      if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' })
      await requireRole(req, ADMIN_ONLY, deps.guard)
      const result = await listPendingEmails(deps)
      return json(200, result)
    }

    if (path === '/email-transport') {
      if (req.method === 'GET') {
        await requireRole(req, ADMIN_ONLY, deps.guard)
        const current = await deps.emailTransport.getCurrent()
        return json(200, current ? toPublicEmailTransport(current) : null)
      }
      if (req.method === 'POST') {
        const admin = await requireRole(req, ADMIN_ONLY, deps.guard)
        const body = await req.json().catch(() => ({}))
        const updated = await updateEmailTransport(admin, deps, body)
        return json(200, toPublicEmailTransport(updated))
      }
      return json(405, { error: 'method_not_allowed' })
    }

    if (path === '/audit-log') {
      if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' })
      await requireRole(req, PRIVACY_ROLES, deps.guard)
      const result = await listAuditLog(deps, new URL(req.url))
      return json(200, result)
    }

    if (path === '/audit-log/export.csv') {
      if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' })
      const admin = await requireRole(req, PRIVACY_ROLES, deps.guard)
      const { csv, rowCount, truncated } = await exportAuditLogCsv(deps, admin, new URL(req.url))
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="audit-log-export.csv"',
          'Cache-Control': 'no-store',
          'X-Row-Count': String(rowCount),
          'X-Export-Truncated': String(truncated),
        },
      })
    }

    if (path === '/evidence') {
      if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' })
      await requireRole(req, PRIVACY_ROLES, deps.guard)
      const result = await searchEvidence(deps, new URL(req.url))
      return json(200, result)
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
