// AI-LOGS-ALLOWLIST (P2): `security_events.metadata` es contenido libre de quien registra el
// evento (`_shared/security-events.ts`) — hoy ninguna de las llamadas reales a
// `logSecurityEvent()` del repo pone ahí un correo, IP o identificador de usuario, pero nada a
// nivel de esquema lo impide a futuro. Antes de que `security-diagnose` reenvíe `security_events`
// a un proveedor externo de IA, se filtra cada `metadata` a esta lista cerrada; cualquier otro
// campo, y cualquier valor que no sea texto/número/booleano o un arreglo de texto, se descarta sin
// excepción. Vive aparte de `news-agent-core.ts` para que esta lógica (y su prueba) no dependan de
// esa dependencia mucho más pesada.
const METADATA_ALLOWLIST = ['reason', 'name', 'keys'] as const

export function sanitizeMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const safe: Record<string, unknown> = {}
  for (const key of METADATA_ALLOWLIST) {
    const value = (metadata as Record<string, unknown>)[key]
    if (value === undefined) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') { safe[key] = value; continue }
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) safe[key] = value
  }
  return safe
}

export function sanitizeEventsForAi<T extends { metadata?: unknown }>(events: T[]): Array<T & { metadata: Record<string, unknown> }> {
  return events.map((event) => ({ ...event, metadata: sanitizeMetadata(event.metadata) }))
}
