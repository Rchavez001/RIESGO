// Identidad y roles de las funciones del módulo de consentimiento (T04; SEC-01, SEC-02, H01, H08).
//
// - `requireUser(req)`: verifica el JWT de Supabase Auth CRIPTOGRÁFICAMENTE (firma contra las claves públicas del
//   proyecto, `exp` obligatorio, `aud = authenticated`, emisor si está configurado) y solo entonces lee sus claims.
//   Nunca lee claims de un token sin verificar (a diferencia del decodificador ad hoc de funciones antiguas, H01).
//   Solo acepta usuarios individuales: `role = authenticated` con `sub` UUID. Rechaza `service_role`, la clave `anon`
//   y las sesiones anónimas (`is_anonymous`), aunque su firma sea válida.
// - `requireRole(req, roles)`: tras `requireUser`, lee los roles en `admin_roles` (migración 073) con el JWT del propio
//   usuario, bajo la política RLS `admin_roles_self_read`: el rol sale de la base, nunca de un claim. Falla cerrado.
//
// Claves: por defecto el JWKS del proyecto (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, claves asimétricas
// ES256/RS256). Un proyecto que aún firma con el secreto HS256 heredado publica un JWKS vacío: ahí la verificación
// falla (401), nunca se abre. Emisor esperado opcional: `SUPABASE_JWT_ISSUER` (p. ej. `https://<ref>.supabase.co/auth/v1`).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'https://deno.land/x/jose@v5.9.6/index.ts'

export const PRIVACY_ROLES = ['privacy_editor', 'privacy_admin', 'privacy_auditor'] as const
export type PrivacyRole = typeof PRIVACY_ROLES[number]

export interface VerifiedUser {
  userId: string
  email: string | null
  /** El token ya verificado, para llamar a PostgREST en nombre del usuario (RLS). */
  jwt: string
  claims: JWTPayload
}

export interface AuthGuardOptions {
  /** Resolución de claves de verificación. Por defecto, el JWKS remoto del proyecto. */
  key?: JWTVerifyGetKey
  /** Algoritmos aceptados. Por defecto solo asimétricos: HS256 y `none` quedan fuera. */
  algorithms?: string[]
  audience?: string
  issuer?: string
  /** Roles del usuario verificado. Por defecto, `admin_roles` vía PostgREST con el JWT del usuario. */
  lookupRoles?: (user: VerifiedUser) => Promise<string[]>
}

export type AuthErrorCode =
  | 'missing_token' | 'invalid_token' | 'token_expired' | 'not_user_token'
  | 'anonymous_session' | 'forbidden' | 'role_lookup_failed' | 'auth_unavailable'

/** Error con estado HTTP. El `code` es estable y apto para el cliente: no incluye el token ni detalles de la verificación. */
export class AuthError extends Error {
  constructor(readonly status: 401 | 403 | 503, readonly code: AuthErrorCode) {
    super(code)
    this.name = 'AuthError'
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_ALGORITHMS = ['ES256', 'RS256']

let projectJwks: JWTVerifyGetKey | null = null
function defaultKey(): JWTVerifyGetKey {
  if (!projectJwks) {
    const base = Deno.env.get('SUPABASE_URL')
    if (!base) throw new AuthError(503, 'auth_unavailable')
    projectJwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', base))
  }
  return projectJwks
}

function bearerToken(req: Request): string {
  const header = req.headers.get('Authorization')?.trim() ?? ''
  if (!header) throw new AuthError(401, 'missing_token')
  const match = /^Bearer(?:\s+(.*))?$/i.exec(header)
  if (!match) throw new AuthError(401, 'invalid_token')
  const token = (match[1] ?? '').trim()
  if (!token) throw new AuthError(401, 'missing_token')
  return token
}

export async function requireUser(req: Request, opts: AuthGuardOptions = {}): Promise<VerifiedUser> {
  const token = bearerToken(req)

  let claims: JWTPayload
  try {
    ;({ payload: claims } = await jwtVerify(token, opts.key ?? defaultKey(), {
      algorithms: opts.algorithms ?? DEFAULT_ALGORITHMS,
      audience: opts.audience ?? 'authenticated',
      issuer: opts.issuer ?? Deno.env.get('SUPABASE_JWT_ISSUER') ?? undefined,
      requiredClaims: ['exp'],
    }))
  } catch (err) {
    if (err instanceof AuthError) throw err
    if (err instanceof errors.JWTExpired) throw new AuthError(401, 'token_expired')
    throw new AuthError(401, 'invalid_token')
  }

  // A partir de aquí los claims están verificados.
  if (claims.role !== 'authenticated') throw new AuthError(401, 'not_user_token')
  if (typeof claims.sub !== 'string' || !UUID_RE.test(claims.sub)) throw new AuthError(401, 'invalid_token')
  if (claims.is_anonymous === true) throw new AuthError(403, 'anonymous_session')

  return {
    userId: claims.sub.toLowerCase(),
    email: typeof claims.email === 'string' && claims.email ? claims.email : null,
    jwt: token,
    claims,
  }
}

/** Roles del usuario en `admin_roles`, consultados CON SU PROPIO JWT: la política RLS solo le deja ver sus filas. */
async function lookupRolesFromDb(user: VerifiedUser): Promise<string[]> {
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) throw new Error('SUPABASE_URL/SUPABASE_ANON_KEY no configuradas')
  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${user.jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.from('admin_roles').select('role').eq('user_id', user.userId)
  if (error) throw new Error(`admin_roles: ${error.code ?? 'error'}`)
  return (data ?? []).map((row: { role: string }) => row.role)
}

export async function requireRole(
  req: Request,
  roles: readonly PrivacyRole[],
  opts: AuthGuardOptions = {},
): Promise<VerifiedUser & { roles: PrivacyRole[] }> {
  // Error de programación, no de acceso: sin roles pedidos no hay nada que conceder.
  if (roles.length === 0 || roles.some((r) => !PRIVACY_ROLES.includes(r))) {
    throw new TypeError('requireRole: lista de roles vacía o con un rol desconocido')
  }

  const user = await requireUser(req, opts)

  let granted: string[]
  try {
    granted = await (opts.lookupRoles ?? lookupRolesFromDb)(user)
  } catch {
    throw new AuthError(503, 'role_lookup_failed')
  }

  const matching = roles.filter((r) => granted.includes(r))
  if (matching.length === 0) throw new AuthError(403, 'forbidden')
  return { ...user, roles: matching }
}
