// admin-consent: API administrativa del módulo de consentimiento (SEC-02, SEC-03, H08). T05.a solo añade
// `POST /admin-consent/session`; versiones, publicación, configuración y bitácora llegan en T14–T16.
//
// Toda ruta pasa por `requireRole` (JWT verificado + TOTP + rol en `admin_roles`) y queda atribuida al `actor_id` del
// token. La bitácora (`admin_audit_log`) no admite escrituras de `authenticated`: el registro lo hace `deps.audit` con la
// service role como mero transporte, siempre con el actor verificado aquí. Si no se puede registrar, la acción no ocurre.
import { AuthError, PRIVACY_ROLES, requireRole, type AuthGuardOptions } from '../_shared/auth-guard.ts'

export interface AuditEntry {
  actor_id: string
  actor_email_hmac: string
  actor_role: string
  action: string
  entity: string
  entity_id: string | null
}

export interface AdminConsentDeps {
  guard?: AuthGuardOptions
  /** HMAC del correo normalizado (clave propia de búsqueda, H15): la bitácora no guarda el correo en claro. */
  emailHmac: (email: string) => Promise<string>
  audit: (entry: AuditEntry) => Promise<void>
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

/** Sub-ruta tras el nombre de la función, tanto si llega como `/admin-consent/x` como `/functions/v1/admin-consent/x`. */
function route(req: Request): string {
  const path = new URL(req.url).pathname
  const i = path.indexOf('/admin-consent')
  return i === -1 ? path : path.slice(i + '/admin-consent'.length) || '/'
}

export async function handle(req: Request, deps: AdminConsentDeps): Promise<Response> {
  const path = route(req)
  if (path !== '/session') return json(404, { error: 'not_found' })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  try {
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
  } catch (err) {
    if (err instanceof AuthError) return json(err.status, { error: err.code })
    return json(500, { error: 'internal_error' })
  }
}
