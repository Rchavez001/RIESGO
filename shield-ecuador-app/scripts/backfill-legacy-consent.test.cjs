#!/usr/bin/env node
// Pruebas de scripts/backfill-legacy-consent.cjs. NO forma parte de gates.sh (gates.sh está
// protegido de edición y este script es, por diseño de D-11, "nunca se ejecuta como iteración
// normal del loop" — se corre a mano, dentro de la ventana de release).
//
//   node scripts/backfill-legacy-consent.test.cjs                 # solo pruebas con cliente falso
//   RUN_REAL_PG=1 node scripts/backfill-legacy-consent.test.cjs   # + integración contra `supabase start` local real
//     (requiere: supabase start corriendo, con la migración 084 ya aplicada; SUPABASE_URL/
//      SUPABASE_SERVICE_ROLE_KEY del local — `supabase status -o env`)
//     OJO: por diseño (SEC-06, append-only) esta prueba NO puede borrar lo que inserta — ni
//     siquiera el service_role puede borrar consent_records. Deja residuo PERMANENTE en el
//     stack local (prefijo `legacy-test-…`/`@example.test`): correr `supabase db reset` después
//     si hace falta un stack limpio. Por eso NUNCA correrla contra un proyecto real (el propio
//     código ya rechaza cualquier SUPABASE_URL que no sea 127.0.0.1/localhost).
'use strict'
const assert = require('node:assert/strict')
const crypto = require('crypto')
const {
  computeHmac, classifyUsers, buildLegacyDocumentRow, buildEvidenceRow, requireHmacKey, runBackfill,
} = require('./backfill-legacy-consent.cjs')

let failures = 0
async function test(name, fn) {
  try { await fn(); console.log(`OK   ${name}`) }
  catch (err) { failures += 1; console.log(`FAIL ${name}\n     ${err.message}`) }
}

// ── Cliente falso (en memoria), solo lo necesario para los chains que usa runBackfill ──────────
function matchesFilters(row, filters) {
  return filters.every(([op, col, val]) => {
    if (op === 'eq') return row[col] === val
    if (op === 'ilike') return new RegExp('^' + val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i').test(row[col] ?? '')
    return true
  })
}
class FakeBuilder {
  constructor(table, db) { this.table = table; this.db = db; this.filters = []; this.mode = 'select'; this.toInsert = null; this.terminal = null }
  select() { return this }
  eq(col, val) { this.filters.push(['eq', col, val]); return this }
  ilike(col, val) { this.filters.push(['ilike', col, val]); return this }
  order() { return this }
  limit() { return this }
  insert(rows) { this.mode = 'insert'; this.toInsert = Array.isArray(rows) ? rows : [rows]; return this }
  maybeSingle() { this.terminal = 'maybeSingle'; return this }
  single() { this.terminal = 'single'; return this }
  then(resolve, reject) {
    try { resolve(this._run()) } catch (e) { reject(e) }
  }
  _run() {
    if (this.mode === 'insert') {
      const inserted = this.toInsert.map((row) => ({ id: row.id ?? crypto.randomUUID(), ...row }))
      this.db[this.table].push(...inserted)
      if (this.terminal === 'single') return { data: inserted[0], error: null }
      return { data: inserted, error: null }
    }
    const rows = this.db[this.table].filter((r) => matchesFilters(r, this.filters))
    if (this.terminal === 'single' || this.terminal === 'maybeSingle') return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null }
  }
}
function fakeAdmin(db) { return { from: (table) => new FakeBuilder(table, db) } }

function freshDb() {
  return {
    users: [],
    consent_documents: [],
    consent_records: [],
  }
}
const ADMIN_ID = '00000000-0000-0000-0000-0000000000a1'
function baseUsers() {
  return [
    { id: '10000000-0000-0000-0000-000000000001', data_processing_authorized: true, data_processing_authorized_at: '2026-03-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', privacy_notice_version: '2026-06-22' }, // A
    { id: '10000000-0000-0000-0000-000000000002', data_processing_authorized: true, data_processing_authorized_at: null, created_at: '2026-01-02T00:00:00Z', privacy_notice_version: '2026-06-22' }, // B (sin fecha propia)
    { id: '10000000-0000-0000-0000-000000000003', data_processing_authorized: false, data_processing_authorized_at: null, created_at: '2026-01-03T00:00:00Z', privacy_notice_version: '2026-06-22' }, // C
  ]
}
const HMAC_KEY = Buffer.from(crypto.randomBytes(32)).toString('base64')

async function main() {
  await test('computeHmac: determinista y coincide con HMAC-SHA256 + base64url calculado aparte', () => {
    const value = '10000000-0000-0000-0000-000000000001'
    const expected = crypto.createHmac('sha256', Buffer.from(HMAC_KEY, 'base64')).update(value, 'utf8').digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    assert.equal(computeHmac(value, HMAC_KEY), expected)
    assert.equal(computeHmac(value, HMAC_KEY), computeHmac(value, HMAC_KEY)) // determinista
  })

  await test('requireHmacKey: sin la variable, aborta con mensaje claro y sin imprimir nada secreto', () => {
    assert.throws(() => requireHmacKey({}), /Falta LOOKUP_HMAC_KEY_B64/)
    try { requireHmacKey({}) } catch (e) {
      assert.ok(!e.message.includes('Bearer'), 'el mensaje no debe contener ningún secreto')
      assert.equal(/[A-Za-z0-9+/]{20,}={0,2}/.test(e.message), false, 'el mensaje no debe contener nada que parezca una clave en base64')
    }
  })

  await test('classifyUsers: A y B se migran, C no; B queda marcada approximate', () => {
    const { migrate, skipped } = classifyUsers(baseUsers())
    assert.equal(migrate.length, 2)
    assert.equal(skipped, 1)
    assert.equal(migrate.find((u) => u.id.endsWith('001')).approximate, false)
    assert.equal(migrate.find((u) => u.id.endsWith('002')).approximate, true)
  })

  await test('buildLegacyDocumentRow: status siempre retired, nunca published', () => {
    const row = buildLegacyDocumentRow('2026-06-22', ADMIN_ID)
    assert.equal(row.status, 'retired')
    assert.equal(row.version, 'legacy-2026-06-22')
    assert.equal(row.purposes.length, 1)
    assert.equal(row.purposes[0].code, 'registro_aprendizaje')
  })

  await test('buildEvidenceRow: sin IP ni agente, user_ref_hmac == computeHmac(userId)', () => {
    const legacyDoc = { id: 'doc-1', version: 'legacy-2026-06-22', content_sha256: 'abc' }
    const row = buildEvidenceRow({ userId: '10000000-0000-0000-0000-000000000001', legacyDoc, serverTs: '2026-03-01T00:00:00Z', hmacKeyB64: HMAC_KEY, keyVersion: 1 })
    assert.equal(row.ip_ciphertext, null)
    assert.equal(row.ip_hmac, null)
    assert.equal(row.ua_ciphertext, null)
    assert.equal(row.ua_hmac, null)
    assert.equal(row.user_ref_hmac, computeHmac('10000000-0000-0000-0000-000000000001', HMAC_KEY))
    assert.equal(row.channel, 'registro')
    assert.equal(row.decision, 'granted')
  })

  await test('dry-run (cliente falso): no inserta nada en ninguna tabla', async () => {
    const db = freshDb()
    db.users.push(...baseUsers())
    db.users.push({ id: ADMIN_ID, role: 'admin', data_processing_authorized: false, privacy_notice_version: '2026-06-22', created_at: '2025-01-01T00:00:00Z' })
    const admin = fakeAdmin(db)
    const logs = []
    const result = await runBackfill({ admin, hmacKeyB64: HMAC_KEY, keyVersion: 1, apply: false, log: (m) => logs.push(m) })
    assert.equal(result.migrated, 0)
    assert.equal(db.consent_documents.length, 0)
    assert.equal(db.consent_records.length, 0)
    assert.ok(logs.some((l) => /Dry-run/.test(l)))
    assert.ok(logs.some((l) => /Personas a migrar.*2/.test(l)))
  })

  await test('--apply: migra solo A y B (2 filas), crea el documento legacy retired, nunca published', async () => {
    const db = freshDb()
    db.users.push(...baseUsers())
    db.users.push({ id: ADMIN_ID, role: 'admin', data_processing_authorized: false, privacy_notice_version: '2026-06-22', created_at: '2025-01-01T00:00:00Z' })
    const admin = fakeAdmin(db)
    const result = await runBackfill({ admin, hmacKeyB64: HMAC_KEY, keyVersion: 1, apply: true, log: () => {} })
    assert.equal(result.migrated, 2)
    assert.equal(db.consent_documents.length, 1)
    assert.equal(db.consent_documents[0].status, 'retired')
    assert.equal(db.consent_records.length, 2)
    assert.ok(db.consent_records.every((r) => r.ip_hmac === null && r.ip_ciphertext === null))
    assert.ok(!db.consent_records.some((r) => r.user_ref_hmac === computeHmac('10000000-0000-0000-0000-000000000003', HMAC_KEY)))
  })

  await test('--apply dos veces: la segunda inserta lo mismo que la primera (idempotencia)', async () => {
    const db = freshDb()
    db.users.push(...baseUsers())
    db.users.push({ id: ADMIN_ID, role: 'admin', data_processing_authorized: false, privacy_notice_version: '2026-06-22', created_at: '2025-01-01T00:00:00Z' })
    const admin = fakeAdmin(db)
    const first = await runBackfill({ admin, hmacKeyB64: HMAC_KEY, keyVersion: 1, apply: true, log: () => {} })
    const second = await runBackfill({ admin, hmacKeyB64: HMAC_KEY, keyVersion: 1, apply: true, log: () => {} })
    assert.equal(first.migrated, 2)
    assert.equal(second.migrated, 0) // ya estaban migradas: la segunda corrida no inserta nada nuevo
    assert.equal(db.consent_records.length, 2) // nunca duplicadas
    assert.equal(db.consent_documents.length, 1) // tampoco el documento
  })

  if (process.env.RUN_REAL_PG === '1') {
    await test('[Postgres real, supabase start local] --apply dos veces: idempotente contra la base real', async () => {
      const path = require('path')
      const { createClient } = require(path.resolve(__dirname, '../frontend/node_modules/@supabase/supabase-js'))
      const url = process.env.SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !serviceKey) throw new Error('RUN_REAL_PG=1 requiere SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY del stack local (supabase status -o env)')
      if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('esta prueba SOLO corre contra el stack local — SUPABASE_URL no es local')
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

      const suffix = Date.now()
      const testUsers = [
        { id: crypto.randomUUID(), email: `legacy-a-${suffix}@example.test`, role: 'user', data_processing_authorized: true, data_processing_authorized_at: '2026-03-01T00:00:00Z', privacy_notice_version: `test-${suffix}` },
        { id: crypto.randomUUID(), email: `legacy-c-${suffix}@example.test`, role: 'user', data_processing_authorized: false, privacy_notice_version: `test-${suffix}` },
      ]
      const { error: insertUsersError } = await admin.from('users').insert(testUsers)
      if (insertUsersError) throw new Error(`no se pudo sembrar users de prueba: ${insertUsersError.message}`)

      // El stack local puede no tener todavía ninguna cuenta admin (base vacía recién reconstruida
      // con db-reset): se crea una de prueba SOLO si hace falta, y se borra siempre al terminar.
      const { data: existingAdmin, error: adminErr } = await admin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle()
      if (adminErr) throw new Error(adminErr.message)
      let tempAdminId = null
      let adminRow = existingAdmin
      if (!adminRow) {
        tempAdminId = crypto.randomUUID()
        const { error: tempAdminError } = await admin.from('users').insert({ id: tempAdminId, email: `legacy-admin-${suffix}@example.test`, role: 'admin', data_processing_authorized: false })
        if (tempAdminError) throw new Error(`no se pudo crear el admin temporal de prueba: ${tempAdminError.message}`)
        adminRow = { id: tempAdminId }
      }

      try {
        const run = () => runBackfill({ admin, hmacKeyB64: HMAC_KEY, keyVersion: 1, apply: true, log: () => {} })
        const first = await run()
        const second = await run()
        assert.equal(first.migrated, 1) // solo la persona A (autorizada) de este lote de prueba
        assert.equal(second.migrated, 0)

        const expectedHmac = computeHmac(testUsers[0].id, HMAC_KEY)
        const { data: rows, error: rowsError } = await admin.from('consent_records').select('*').eq('user_ref_hmac', expectedHmac)
        if (rowsError) throw new Error(rowsError.message)
        assert.equal(rows.length, 1)
        assert.equal(rows[0].ip_hmac, null)
        assert.equal(rows[0].document_version, `legacy-test-${suffix}`)

        const { data: doc, error: docError } = await admin.from('consent_documents').select('status').eq('version', `legacy-test-${suffix}`).maybeSingle()
        if (docError) throw new Error(docError.message)
        assert.equal(doc.status, 'retired')
      } finally {
        // SEC-06 (append-only) se cumple también para esta fila de prueba: ni siquiera el
        // service_role puede borrar consent_records (el trigger de 073 lo rechaza salvo la
        // bandera de sesión que solo usa la función de retención) — confirmado aquí mismo: el
        // intento de abajo falla y se reporta, a propósito, en vez de fingir que limpió algo que
        // el propio diseño del sistema no permite borrar. La fila de `consent_documents` tampoco
        // se puede borrar mientras la de `consent_records` siga ahí (FK sin cascada, 074), y el
        // `user` de prueba tampoco mientras tenga evidencia (misma razón). Dejan residuo real y
        // PERMANENTE en el stack LOCAL: limpiarlo de verdad exige `supabase db reset` (local) o
        // una sesión psql con privilegio (`SET app.allow_evidence_mutation = 'on'`, reservado a
        // quien tenga acceso directo a la base) — nunca desde este script.
        const { error: delRecordsError } = await admin.from('consent_records').delete().ilike('document_version', `legacy-test-${suffix}`)
        if (delRecordsError) console.log(`     (esperado) no se pudo borrar consent_records de prueba — append-only: ${delRecordsError.message}`)
        const { error: delDocError } = await admin.from('consent_documents').delete().eq('version', `legacy-test-${suffix}`)
        if (delDocError) console.log(`     (esperado si la evidencia no se borró) no se pudo borrar el documento de prueba: ${delDocError.message}`)
        const { error: delUsersError } = await admin.from('users').delete().in('id', testUsers.map((u) => u.id))
        if (delUsersError) console.log(`     (esperado si la evidencia no se borró) no se pudieron borrar los users de prueba: ${delUsersError.message}`)
        if (tempAdminId) await admin.from('users').delete().eq('id', tempAdminId)
      }
    })
  }

  console.log(failures === 0 ? `\nTodas las pruebas pasaron.` : `\n${failures} prueba(s) fallida(s).`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
