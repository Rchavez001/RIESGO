// deno run --allow-read --allow-env supabase/tests/consent/e2e_decrypt.ts <fn.env> <salida.json de e2e_local.cjs>
import { decryptConsentColumn } from '../../functions/_shared/consent-evidence.ts'

for (const line of Deno.readTextFileSync(Deno.args[0]).split('\n')) {
  const i = line.indexOf('=')
  if (i > 0) Deno.env.set(line.slice(0, i), line.slice(i + 1).trim())
}
const { rows } = JSON.parse(Deno.readTextFileSync(Deno.args[1]))
let ok = true
const seen = new Set<string>()
for (const row of rows) {
  const ip = await decryptConsentColumn(row, 'ip_ciphertext')
  const ua = await decryptConsentColumn(row, 'ua_ciphertext')
  seen.add(`${ip} | ${ua}`)
  if (!ip || ip === '1.2.3.4') ok = false // la IP inventada por el cliente nunca debe aparecer
}
console.log('IP | user-agent descifrados con el lector real (allowLegacy:false):', [...seen])

// Y la protección de AAD sobre datos REALES: pegar el cifrado de una fila en otra "persona" debe fallar.
let moved = false
try { await decryptConsentColumn({ ...rows[0], user_ref_hmac: 'hmac-de-otra-persona' }, 'ip_ciphertext'); moved = true } catch { /* esperado */ }
let swapped = false
try { await decryptConsentColumn({ user_ref_hmac: rows[0].user_ref_hmac, ua_ciphertext: rows[0].ip_ciphertext }, 'ua_ciphertext'); swapped = true } catch { /* esperado */ }
console.log(ok ? 'OK  ' : 'FALLA', 'la IP guardada es la del servidor, no la que mandó el cliente')
console.log(!moved ? 'OK  ' : 'FALLA', 'mover el cifrado a otro user_ref_hmac falla')
console.log(!swapped ? 'OK  ' : 'FALLA', 'mover el cifrado de ip a la columna ua falla')
Deno.exit(ok && !moved && !swapped ? 0 : 1)
