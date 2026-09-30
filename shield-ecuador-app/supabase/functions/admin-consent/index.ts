// admin-consent (T05.a): ver handler.ts. `verify_jwt = true` (valor por defecto; ver supabase/config.toml).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hmacLookup } from '../_shared/crypto.ts'
import { handle } from './handler.ts'

// Solo para insertar en admin_audit_log (sin privilegios para `authenticated`); el actor sale del JWT verificado.
const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})

serve((req) =>
  handle(req, {
    emailHmac: (email) => hmacLookup(email, 'LOOKUP_HMAC_KEY_B64'),
    audit: async (entry) => {
      const { error } = await db.from('admin_audit_log').insert(entry)
      if (error) throw new Error(`admin_audit_log: ${error.code ?? 'error'}`)
    },
  })
)
