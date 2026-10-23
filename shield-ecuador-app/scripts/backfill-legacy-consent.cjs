#!/usr/bin/env node
// T25 (D-10 opción A, D-11): backfill de un solo uso del consentimiento legacy (aviso
// 2026-06-22) a consent_records. SOLO dentro de la ventana de release, con el OK explícito de
// la persona responsable; nunca como iteración normal del loop (ver DECISIONS.md D-11).
//
//   node scripts/backfill-legacy-consent.cjs                 # dry-run (por defecto: no escribe nada)
//   node scripts/backfill-legacy-consent.cjs --dry-run        # explícito, igual que el por defecto
//   node scripts/backfill-legacy-consent.cjs --apply          # escribe, en lotes, idempotente
//
// Variables de entorno (ninguna se imprime, ni siquiera parcialmente):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   — proyecto destino (local o el real, con tu OK)
//   LOOKUP_HMAC_KEY_B64                       — la MISMA clave que usan las Edge Functions
//   PII_KEY_VERSION                           — opcional, por defecto 1 (no se cifra nada aquí;
//                                                solo deja `key_version` consistente con el resto)
const crypto = require('crypto')

const PURPOSE_CODE = 'registro_aprendizaje'
const CHANNEL = 'registro'
const DEFAULT_BATCH_SIZE = 500

// Mismo cálculo que _shared/crypto.ts: hmacLookup() — HMAC-SHA256 con la clave decodificada de
// base64, codificado en base64url sin relleno. Debe coincidir exactamente con lo que calcula
// cualquier Edge Function del módulo para el mismo user_id (una baja o un `unlink` posteriores
// buscan por este mismo valor).
function computeHmac(value, keyB64) {
  const key = Buffer.from(keyB64, 'base64')
  if (key.length < 16) throw new Error('invalid_hmac_key')
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function requireHmacKey(env) {
  const key = env.LOOKUP_HMAC_KEY_B64
  if (!key) throw new Error('Falta LOOKUP_HMAC_KEY_B64 en el entorno de esta sesión. No se ejecuta nada.')
  return key
}

// Clasificación según PROGRESS_ARCHIVO.md Iteración 2 §2 (D-10/D-11): A y B se migran (una fila de
// evidencia cada una); C no se migra (nadie inventa lo que nunca se autorizó).
function classifyUsers(users) {
  const migrate = []
  let skipped = 0
  for (const u of users) {
    if (!u.data_processing_authorized) { skipped += 1; continue }
    migrate.push({
      id: u.id,
      version: u.privacy_notice_version,
      serverTs: u.data_processing_authorized_at ?? u.created_at,
      approximate: !u.data_processing_authorized_at, // población B: sin fecha propia
    })
  }
  return { migrate, skipped }
}

// Texto reconstruido desde el repositorio (no hay copia almacenada del original mostrado,
// confirmado en PROGRESS_ARCHIVO.md Iteración 2 §1): una autorización general de una sola frase,
// sin responsable, sin plazos, sin finalidades separadas, sin mención de menores ni de IP.
function legacyDocumentContent(sourceVersion) {
  const title = `Aviso de privacidad — versión histórica ${sourceVersion}`
  const content_md = `# ${title}

**Nota: no existe una copia almacenada del texto original mostrado en esta versión.** Este texto
fue reconstruido a partir del código fuente de la aplicación vigente en esa fecha y se conserva
únicamente como registro histórico; esta versión nunca estuvo publicada en el módulo de
consentimiento y no puede volver a mostrarse a nadie.

Texto reconstruido:

> Autorizo el tratamiento de mis datos personales para fines internos de la aplicación,
> incluyendo registro, gestión de usuario, operación del servicio y clasificación estadística
> durante la vigencia de mi uso de la aplicación.

El formulario de entonces incluía además una nota de derechos ARCO (acceso, rectificación,
cancelación, oposición) con un correo de contacto de la época [contacto de la época, omitido].

Este texto no identificaba al responsable del tratamiento, no indicaba plazos de conservación,
no separaba finalidades, no mencionaba a personas menores de edad ni la dirección IP de quien lo
aceptaba.
`
  const content_sha256 = crypto.createHash('sha256').update(content_md, 'utf8').digest('hex')
  return { title, content_md, content_sha256 }
}

function buildLegacyDocumentRow(sourceVersion, adminId) {
  const { title, content_md, content_sha256 } = legacyDocumentContent(sourceVersion)
  return {
    version: `legacy-${sourceVersion}`,
    title,
    content_md,
    content_sha256,
    purposes: [{ code: PURPOSE_CODE, label: 'Registro y aprendizaje', required: true, order: 1 }],
    status: 'retired', // NUNCA 'published' — D-11: el índice de "un solo publicado" no se toca.
    created_by: adminId,
    change_summary: 'Backfill T25: historial del consentimiento anterior (2026-06-22), D-10 opción A.',
  }
}

function buildEvidenceRow({ userId, legacyDoc, serverTs, hmacKeyB64, keyVersion }) {
  return {
    user_id: userId,
    user_ref_hmac: computeHmac(userId, hmacKeyB64),
    document_id: legacyDoc.id,
    document_version: legacyDoc.version,
    rendered_sha256: legacyDoc.content_sha256, // no hubo renderizado: es el propio contenido histórico
    settings_version: 0, // "no aplica" (D-11): los datos del responsable de entonces no eran configurables
    purpose_code: PURPOSE_CODE,
    decision: 'granted',
    channel: CHANNEL,
    ip_ciphertext: null,
    ip_hmac: null,
    ua_ciphertext: null,
    ua_hmac: null,
    key_version: keyVersion,
    server_ts: serverTs,
  }
}

function abbreviateId(id) {
  return `${String(id).slice(0, 8)}…`
}

// `admin` es un cliente al estilo de @supabase/supabase-js (createClient(url, serviceRoleKey)):
// inyectable para pruebas (cliente falso) sin tocar Postgres real. `log` por defecto es
// console.log; las pruebas lo capturan para confirmar que nunca se imprime nada sensible.
async function runBackfill({ admin, hmacKeyB64, keyVersion, apply, batchSize = DEFAULT_BATCH_SIZE, log = console.log }) {
  const { data: allUsers, error: usersError } = await admin
    .from('users')
    .select('id, data_processing_authorized, data_processing_authorized_at, created_at, privacy_notice_version')
  if (usersError) throw new Error(`no se pudo leer users: ${usersError.message ?? usersError}`)

  const { migrate, skipped } = classifyUsers(allUsers ?? [])
  const byVersion = new Map()
  for (const u of migrate) {
    if (!byVersion.has(u.version)) byVersion.set(u.version, [])
    byVersion.get(u.version).push(u)
  }

  log(`Personas a migrar (A+B, autorizadas): ${migrate.length}`)
  log(`Personas sin autorizar (C, no se migran): ${skipped}`)
  for (const [version, rows] of byVersion) {
    const withDate = rows.filter((r) => !r.approximate).length
    log(`  versión "${version}": ${rows.length} (${withDate} con fecha propia, ${rows.length - withDate} con fecha aproximada)`)
  }
  log(`Ejemplo (hasta 3 ids abreviados, sin correos ni IP): ${migrate.slice(0, 3).map((u) => abbreviateId(u.id)).join(', ') || '(ninguno)'}`)

  if (!apply) {
    log('Dry-run: no se escribió nada. Vuelve a correr con --apply para insertar.')
    return { migrated: 0, skipped, documentsCreated: 0 }
  }

  const { data: adminRow, error: adminError } = await admin.from('users').select('id').eq('role', 'admin').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (adminError) throw new Error(`no se pudo leer un admin para created_by: ${adminError.message ?? adminError}`)
  if (!adminRow) throw new Error('no existe ninguna cuenta con role=admin: no hay a quién atribuir el documento legacy')

  let documentsCreated = 0
  const legacyDocByVersion = new Map()
  for (const version of byVersion.keys()) {
    const legacyVersion = `legacy-${version}`
    const { data: existing, error: existingError } = await admin.from('consent_documents').select('id, version, content_sha256').eq('version', legacyVersion).maybeSingle()
    if (existingError) throw new Error(`no se pudo comprobar el documento ${legacyVersion}: ${existingError.message ?? existingError}`)
    if (existing) { legacyDocByVersion.set(version, existing); continue }

    const row = buildLegacyDocumentRow(version, adminRow.id)
    const { data: inserted, error: insertError } = await admin.from('consent_documents').insert(row).select('id, version, content_sha256').single()
    if (insertError) throw new Error(`no se pudo crear el documento ${legacyVersion}: ${insertError.message ?? insertError}`)
    legacyDocByVersion.set(version, inserted)
    documentsCreated += 1
    log(`Documento ${legacyVersion} creado (retired).`)
  }

  // Idempotencia (D-11/TASKS.md): antes de insertar, salta a quien ya tenga una fila legacy% para
  // esta finalidad — una segunda corrida de --apply no debe duplicar nada.
  const { data: existingEvidence, error: existingEvidenceError } = await admin
    .from('consent_records').select('user_ref_hmac').ilike('document_version', 'legacy-%').eq('purpose_code', PURPOSE_CODE)
  if (existingEvidenceError) throw new Error(`no se pudo comprobar evidencia existente: ${existingEvidenceError.message ?? existingEvidenceError}`)
  const alreadyMigrated = new Set((existingEvidence ?? []).map((r) => r.user_ref_hmac))

  let migratedCount = 0
  for (const [version, rows] of byVersion) {
    const legacyDoc = legacyDocByVersion.get(version)
    const pending = []
    for (const u of rows) {
      const row = buildEvidenceRow({ userId: u.id, legacyDoc, serverTs: u.serverTs, hmacKeyB64, keyVersion })
      if (alreadyMigrated.has(row.user_ref_hmac)) continue
      pending.push(row)
    }
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize)
      if (batch.length === 0) continue
      const { error: insertError } = await admin.from('consent_records').insert(batch)
      if (insertError) throw new Error(`no se pudo insertar un lote de evidencia (${version}): ${insertError.message ?? insertError}`)
      migratedCount += batch.length
    }
  }

  log(`Filas de evidencia insertadas: ${migratedCount} (ya migradas en una corrida anterior, sin tocar: ${alreadyMigrated.size}).`)
  return { migrated: migratedCount, skipped, documentsCreated }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const hmacKeyB64 = requireHmacKey(process.env)
  const keyVersion = Number.parseInt(process.env.PII_KEY_VERSION ?? '1', 10)

  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en el entorno de esta sesión. No se ejecuta nada.')

  // Import perezoso: así los tests que inyectan un cliente falso no necesitan la dependencia real.
  const path = require('path')
  const { createClient } = require(path.resolve(__dirname, '../frontend/node_modules/@supabase/supabase-js'))
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  await runBackfill({ admin, hmacKeyB64, keyVersion, apply })
}

module.exports = { computeHmac, classifyUsers, legacyDocumentContent, buildLegacyDocumentRow, buildEvidenceRow, abbreviateId, runBackfill, requireHmacKey }

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || String(err))
    process.exit(1)
  })
}
