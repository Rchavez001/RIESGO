-- Plain-language cleanup for citizen-facing content.

UPDATE public.questions
SET
  question_text = replace(replace(replace(replace(replace(replace(replace(replace(question_text,
    'MFA', 'verificacion en dos pasos'),
    '2FA', 'verificacion en dos pasos'),
    'phishing', 'mensaje falso para robar datos'),
    'Phishing', 'Mensaje falso para robar datos'),
    'ransomware', 'bloqueo de archivos para pedir dinero'),
    'Ransomware', 'Bloqueo de archivos para pedir dinero'),
    'credenciales', 'claves o datos de entrada'),
    'dominio', 'direccion de la pagina'),
  answer_text = replace(replace(replace(replace(replace(replace(replace(replace(COALESCE(answer_text, ''),
    'MFA', 'verificacion en dos pasos'),
    '2FA', 'verificacion en dos pasos'),
    'phishing', 'mensaje falso para robar datos'),
    'Phishing', 'Mensaje falso para robar datos'),
    'ransomware', 'bloqueo de archivos para pedir dinero'),
    'Ransomware', 'Bloqueo de archivos para pedir dinero'),
    'credenciales', 'claves o datos de entrada'),
    'dominio', 'direccion de la pagina'),
  explanation = replace(replace(replace(replace(replace(replace(replace(replace(COALESCE(explanation, ''),
    'MFA', 'verificacion en dos pasos'),
    '2FA', 'verificacion en dos pasos'),
    'phishing', 'mensaje falso para robar datos'),
    'Phishing', 'Mensaje falso para robar datos'),
    'ransomware', 'bloqueo de archivos para pedir dinero'),
    'Ransomware', 'Bloqueo de archivos para pedir dinero'),
    'credenciales', 'claves o datos de entrada'),
    'dominio', 'direccion de la pagina'),
  options = replace(replace(replace(replace(replace(replace(replace(replace(options::text,
    'MFA', 'verificacion en dos pasos'),
    '2FA', 'verificacion en dos pasos'),
    'phishing', 'mensaje falso para robar datos'),
    'Phishing', 'Mensaje falso para robar datos'),
    'ransomware', 'bloqueo de archivos para pedir dinero'),
    'Ransomware', 'Bloqueo de archivos para pedir dinero'),
    'credenciales', 'claves o datos de entrada'),
    'dominio', 'direccion de la pagina')::jsonb
WHERE
  question_text ~* '(MFA|2FA|phishing|ransomware|credenciales|dominio)'
  OR COALESCE(answer_text, '') ~* '(MFA|2FA|phishing|ransomware|credenciales|dominio)'
  OR COALESCE(explanation, '') ~* '(MFA|2FA|phishing|ransomware|credenciales|dominio)'
  OR options::text ~* '(MFA|2FA|phishing|ransomware|credenciales|dominio)';

UPDATE public.alerts
SET
  title = replace(replace(replace(replace(replace(replace(title,
    'MFA', 'verificacion en dos pasos'),
    'phishing', 'mensaje falso para robar datos'),
    'Phishing', 'Mensaje falso para robar datos'),
    'ransomware', 'bloqueo de archivos para pedir dinero'),
    'Ransomware', 'Bloqueo de archivos para pedir dinero'),
    'Backup', 'Copia de seguridad'),
  description = replace(replace(replace(replace(replace(replace(description,
    'MFA', 'verificacion en dos pasos'),
    'phishing', 'mensaje falso para robar datos'),
    'Phishing', 'Mensaje falso para robar datos'),
    'ransomware', 'bloqueo de archivos para pedir dinero'),
    'Ransomware', 'Bloqueo de archivos para pedir dinero'),
    'Backup', 'Copia de seguridad')
WHERE title ~* '(MFA|phishing|ransomware|backup)' OR description ~* '(MFA|phishing|ransomware|backup)';

UPDATE public.katas
SET
  name = replace(replace(replace(replace(replace(name,
    'MFA', 'verificacion en dos pasos'),
    'phishing', 'mensaje falso para robar datos'),
    'Phishing', 'Mensaje falso para robar datos'),
    'ransomware', 'bloqueo de archivos para pedir dinero'),
    'Backup', 'Copia de seguridad'),
  description = replace(replace(replace(replace(replace(COALESCE(description, ''),
    'MFA', 'verificacion en dos pasos'),
    'phishing', 'mensaje falso para robar datos'),
    'Phishing', 'Mensaje falso para robar datos'),
    'ransomware', 'bloqueo de archivos para pedir dinero'),
    'Backup', 'Copia de seguridad'),
  teaching = replace(replace(replace(replace(replace(COALESCE(teaching, ''),
    'MFA', 'verificacion en dos pasos'),
    'phishing', 'mensaje falso para robar datos'),
    'Phishing', 'Mensaje falso para robar datos'),
    'ransomware', 'bloqueo de archivos para pedir dinero'),
    'Backup', 'Copia de seguridad')
WHERE
  name ~* '(MFA|phishing|ransomware|backup)'
  OR COALESCE(description, '') ~* '(MFA|phishing|ransomware|backup)'
  OR COALESCE(teaching, '') ~* '(MFA|phishing|ransomware|backup)';
