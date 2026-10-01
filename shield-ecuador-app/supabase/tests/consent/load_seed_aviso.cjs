// SOLO DESARROLLO LOCAL. Genera el SQL que carga el aviso v1.0 del seed y unos datos de configuración
// FICTICIOS (@example.test), y lo deja PUBLICADO para poder probar el registro de punta a punta.
//
//   node supabase/tests/consent/load_seed_aviso.cjs | psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1
//
// - Las finalidades salen del comentario FINALIDADES del propio seed (lo dice el seed: "cargar en consent_documents.purposes").
// - Ese comentario final NO se guarda en content_md; el aviso queda como el equipo legal lo escribió (con sus marcadores).
// - Los datos del responsable y del delegado son de desarrollo. Los reales los completa la persona responsable desde el panel
//   (D-07) y el sistema no deja publicar con marcadores sin resolver.
// - Falla si la versión 1.0 ya existe: los documentos publicados son inmutables (se recrea la base local con `supabase db reset`).
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const seedPath = path.resolve(__dirname, '../../../../loop-consentimiento/seed/aviso_consentimiento_v1.0.md')
const raw = fs.readFileSync(seedPath, 'utf8').replace(/\r\n/g, '\n')

const purposesComment = raw.match(/<!--\s*\nFINALIDADES[\s\S]*?-->\s*$/)
if (!purposesComment) throw new Error('El seed no trae el comentario final FINALIDADES')
const purposes = JSON.parse(purposesComment[0].match(/\[[\s\S]*\]/)[0])
if (!purposes.some((p) => p.required === true)) throw new Error('El seed no define una finalidad obligatoria')

const content = raw.slice(0, purposesComment.index).replace(/\s+$/, '') + '\n'
const contentSha = crypto.createHash('sha256').update(content, 'utf8').digest('hex')
const title = content.match(/^#\s+(.+)$/m)[1].trim()

const ADMIN_ID = '00000000-0000-0000-0000-0000000000d1'
const q = (s) => `$aviso$${s}$aviso$`
process.stdout.write(`
INSERT INTO public.users (id, email, role) VALUES ('${ADMIN_ID}', 'admin.dev@example.test', 'admin') ON CONFLICT DO NOTHING;

INSERT INTO public.privacy_settings (settings_version, controller_name, controller_address, controller_phone, privacy_email,
                                     dpo_name, dpo_contact, privacy_policy_url, unsubscribe_subject, response_days, ip_retention_days, created_by)
SELECT 1, 'Club de Ciberseguridad (DATOS DE DESARROLLO)', 'Domicilio de desarrollo, Guayaquil', '+593 00 000 0000', 'privacidad@example.test',
       'Delegado de desarrollo', 'delegado@example.test', 'https://example.test/politica',
       'Solicitud de baja y eliminación de datos - CiberDojo', 15, 730, '${ADMIN_ID}'
WHERE NOT EXISTS (SELECT 1 FROM public.privacy_settings);

INSERT INTO public.consent_documents (version, title, content_md, content_sha256, purposes, status, created_by, change_summary)
VALUES ('1.0', ${q(title)}, ${q(content)}, '${contentSha}', ${q(JSON.stringify(purposes))}::jsonb, 'draft', '${ADMIN_ID}',
        'Seed de desarrollo local: texto pendiente de revisión legal');

UPDATE public.consent_documents SET status = 'published', published_by = '${ADMIN_ID}', published_at = now() WHERE version = '1.0';

SELECT version, status, char_length(content_md) AS caracteres, jsonb_array_length(purposes) AS finalidades FROM public.consent_documents;
`)
