-- supabase/migrations/003_seed_data.sql

-- ========================================
-- SEED: Preguntas del cuestionario
-- ========================================
INSERT INTO questions (id, branch, order_num, iso_control, question_text, question_type, options, active) VALUES
('A01', 'A', 1, 'A.5.15', '¿Qué usa más para su negocio?', 'unica_opcion',
'[
  {"valor": "A", "texto": "Solo celular", "puntaje_riesgo": 2, "siguiente_pregunta": "A02", "explicacion_para_usuario": "El celular es su herramienta principal. Necesita protegerlo bien."},
  {"valor": "B", "texto": "Solo computadora", "puntaje_riesgo": 2, "siguiente_pregunta": "A05", "explicacion_para_usuario": "La computadora tiene información valiosa. Debe tener cuidado."},
  {"valor": "C", "texto": "Celular y computadora", "puntaje_riesgo": 1, "siguiente_pregunta": "A02", "explicacion_para_usuario": "Más dispositivos = más puertas. Hay que asegurar las dos."},
  {"valor": "D", "texto": "Ninguno, todo en papel", "puntaje_riesgo": 0, "siguiente_pregunta": "I01", "explicacion_para_usuario": "¡Excelente! Pero si algún día usa tecnología, regrese a evaluarse."}
]'::jsonb, true),

('A02', 'A', 2, 'A.5.24', '¿Su celular tiene bloqueo con PIN, huella o cara?', 'unica_opcion',
'[
  {"valor": "A", "texto": "Sí, huella o cara", "puntaje_riesgo": 0, "siguiente_pregunta": "A03", "explicacion_para_usuario": "Perfecto. Eso impide que cualquiera entre si se le pierde."},
  {"valor": "B", "texto": "Sí, PIN o patrón", "puntaje_riesgo": 1, "siguiente_pregunta": "A03", "explicacion_para_usuario": "Bien, pero los PIN cortos se adivinan fácil."},
  {"valor": "C", "texto": "No tiene bloqueo", "puntaje_riesgo": 8, "siguiente_pregunta": "B01", "alerta_inmediata": true, "mensaje_alerta": "¡Peligro! Si se le pierde, cualquiera entra a su banca y WhatsApp.", "explicacion_para_usuario": "¡Peligro! Si se le pierde, cualquiera entra a su banca y WhatsApp."},
  {"valor": "D", "texto": "No sé cómo ponerlo", "puntaje_riesgo": 5, "siguiente_pregunta": "B01", "explicacion_para_usuario": "Es fácil. La app le enseñará paso a paso."}
]'::jsonb, true),

('A03', 'A', 3, 'A.5.37', '¿Actualiza las aplicaciones de su celular cuando le aparece la notificación?', 'unica_opcion',
'[
  {"valor": "A", "texto": "Sí, siempre de inmediato", "puntaje_riesgo": 0, "siguiente_pregunta": "B01", "explicacion_para_usuario": "Excelente hábito. Las actualizaciones cierran puertas a los hackers."},
  {"valor": "B", "texto": "A veces, cuando tengo tiempo", "puntaje_riesgo": 3, "siguiente_pregunta": "B01", "explicacion_para_usuario": "Trate de actualizar en los 3 primeros días. Las fallas se corrigen rápido."},
  {"valor": "C", "texto": "Casi nunca las actualizo", "puntaje_riesgo": 6, "siguiente_pregunta": "B01", "explicacion_para_usuario": "Riesgo alto. Las apps sin actualizar tienen huecos que los ladrones conocen."},
  {"valor": "D", "texto": "No sé qué son esas notificaciones", "puntaje_riesgo": 4, "siguiente_pregunta": "B01", "explicacion_para_usuario": "Le enseñaremos a reconocerlas. Son muy importantes."}
]'::jsonb, true),

('B01', 'B', 1, 'A.5.17', '¿Cómo maneja las contraseñas de su negocio?', 'unica_opcion',
'[
  {"valor": "A", "texto": "Cada cuenta tiene contraseña diferente y difícil", "puntaje_riesgo": 0, "siguiente_pregunta": "B02", "explicacion_para_usuario": "¡Perfecto! Es la forma más segura."},
  {"valor": "B", "texto": "Uso la misma contraseña en todo", "puntaje_riesgo": 9, "siguiente_pregunta": "B02", "alerta_inmediata": true, "mensaje_alerta": "Si le roban una contraseña, entran a TODO. Hay que cambiarlas HOY.", "explicacion_para_usuario": "Si le roban una, entran a todo. Cambie esto HOY."},
  {"valor": "C", "texto": "Tengo 2-3 contraseñas que roto", "puntaje_riesgo": 5, "siguiente_pregunta": "B02", "explicacion_para_usuario": "Mejor que una sola, pero aún con riesgo."},
  {"valor": "D", "texto": "Las anoto en papel o en el celular sin clave", "puntaje_riesgo": 7, "siguiente_pregunta": "B02", "explicacion_para_usuario": "Papel se pierde, el celular puede ser robado. Hay formas más seguras."}
]'::jsonb, true),

('B02', 'B', 2, 'A.8.5', '¿Usa verificación en dos pasos (código al celular) en su banca en línea?', 'unica_opcion',
'[
  {"valor": "A", "texto": "Sí, en todos mis servicios", "puntaje_riesgo": 0, "siguiente_pregunta": "C01", "explicacion_para_usuario": "Excelente. Eso dobla la seguridad."},
  {"valor": "B", "texto": "Solo en el banco", "puntaje_riesgo": 2, "siguiente_pregunta": "C01", "explicacion_para_usuario": "Bien en lo más importante. Extiéndalo al correo también."},
  {"valor": "C", "texto": "No, no lo tengo activado", "puntaje_riesgo": 8, "siguiente_pregunta": "C01", "alerta_inmediata": true, "mensaje_alerta": "Sin doble factor, una contraseña robada da acceso total a su banca.", "explicacion_para_usuario": "Sin esto, una contraseña robada da acceso total."},
  {"valor": "D", "texto": "No sé qué es eso", "puntaje_riesgo": 6, "siguiente_pregunta": "C01", "explicacion_para_usuario": "Es un código extra que llega al celular. Le enseñamos a activarlo."}
]'::jsonb, true),

('C01', 'C', 1, 'A.6.8', '¿Ha recibido correos o mensajes pidiendo datos de su cuenta bancaria?', 'unica_opcion',
'[
  {"valor": "A", "texto": "Sí y nunca hago caso, los borro", "puntaje_riesgo": 0, "siguiente_pregunta": "C02", "explicacion_para_usuario": "¡Perfecto! Los bancos NUNCA piden datos por correo."},
  {"valor": "B", "texto": "Sí, a veces me preocupan", "puntaje_riesgo": 3, "siguiente_pregunta": "C02", "explicacion_para_usuario": "Regla de oro: si pide datos, es fraude. Llame al banco directamente."},
  {"valor": "C", "texto": "Sí, una vez di mis datos por error", "puntaje_riesgo": 10, "siguiente_pregunta": "C02", "alerta_inmediata": true, "mensaje_alerta": "¡Acción urgente! Cambie su contraseña bancaria ahora y llame a su banco.", "explicacion_para_usuario": "¡Acción urgente! Cambie su contraseña bancaria ahora y llame a su banco."},
  {"valor": "D", "texto": "No recibo ese tipo de mensajes", "puntaje_riesgo": 0, "siguiente_pregunta": "C02", "explicacion_para_usuario": "Bien, pero prepárese porque eventualmente llegarán."}
]'::jsonb, true),

('C02', 'C', 2, 'A.6.3', '¿Tiene instalado antivirus en su computadora o celular?', 'unica_opcion',
'[
  {"valor": "A", "texto": "Sí, pagado y actualizado", "puntaje_riesgo": 0, "siguiente_pregunta": "FIN", "explicacion_para_usuario": "Excelente protección extra."},
  {"valor": "B", "texto": "Sí, uno gratuito", "puntaje_riesgo": 2, "siguiente_pregunta": "FIN", "explicacion_para_usuario": "Algo es mejor que nada, pero los pagados detectan más amenazas."},
  {"valor": "C", "texto": "No tengo", "puntaje_riesgo": 5, "siguiente_pregunta": "FIN", "explicacion_para_usuario": "Los patrocinadores de la app ofrecen opciones económicas."},
  {"valor": "D", "texto": "No sé si tengo", "puntaje_riesgo": 3, "siguiente_pregunta": "FIN", "explicacion_para_usuario": "Le ayudaremos a verificarlo en los katas."}
]'::jsonb, true),

('I01', 'I', 1, 'A.5.15', '¿Planea usar tecnología digital en su negocio próximamente?', 'unica_opcion',
'[
  {"valor": "A", "texto": "Sí, en los próximos 6 meses", "puntaje_riesgo": 0, "siguiente_pregunta": "FIN", "explicacion_para_usuario": "Cuando empiece, regrese a evaluarse. Le prepararemos para empezar bien."},
  {"valor": "B", "texto": "Tal vez en el futuro", "puntaje_riesgo": 0, "siguiente_pregunta": "FIN", "explicacion_para_usuario": "Cuando esté listo, aquí estaremos."},
  {"valor": "C", "texto": "No, prefiero el papel", "puntaje_riesgo": 0, "siguiente_pregunta": "FIN", "explicacion_para_usuario": "Válido. Cuide bien sus documentos físicos también."}
]'::jsonb, true),

('A05', 'A', 5, 'A.5.15', '¿Su computadora tiene contraseña de inicio?', 'unica_opcion',
'[
  {"valor": "A", "texto": "Sí, siempre pide contraseña", "puntaje_riesgo": 0, "siguiente_pregunta": "B01", "explicacion_para_usuario": "Bien. Esa es la primera barrera."},
  {"valor": "B", "texto": "No, entra directamente", "puntaje_riesgo": 7, "siguiente_pregunta": "B01", "alerta_inmediata": true, "mensaje_alerta": "Cualquiera que tenga acceso físico puede ver todos sus datos.", "explicacion_para_usuario": "Cualquiera que acceda físicamente puede ver todos sus datos."},
  {"valor": "C", "texto": "Hay contraseña pero la comparto con todos", "puntaje_riesgo": 4, "siguiente_pregunta": "B01", "explicacion_para_usuario": "Si alguien del equipo tiene mala intención, tiene acceso total."}
]'::jsonb, true);

-- ========================================
-- SEED: Katas (ejercicios)
-- ========================================
INSERT INTO katas (kata_code, name, description, teaching, estimated_minutes, required_belt, points_reward, verification_type, active) VALUES
('KATA_BLOQUEO', 'Kata del Bloqueo', 'Activar bloqueo con huella o PIN en el celular', 'La primera barrera debe ser infranqueable', 5, 'white', 100, 'manual', true),
('KATA_CONTRASENAS', 'Kata de las Contraseñas', 'Cambiar todas las contraseñas a únicas y fuertes', 'Un solo punto débil puede derribar todo tu dojo', 20, 'white', 150, 'manual', true),
('KATA_DOBLE_FACTOR', 'Kata del Código Doble', 'Activar verificación en dos pasos en banca en línea', 'Como el guerrero lleva armadura sobre armadura', 10, 'yellow', 200, 'manual', true),
('KATA_CORREO_SEGURO', 'Kata del Correo Seguro', 'Conectar correo al detector de amenazas', 'Conoce a tu enemigo antes de que te ataque', 3, 'yellow', 150, 'automatic', true),
('KATA_VIGILANCIA', 'Kata de la Vigilancia', 'Revisar y reportar 3 correos sospechosos', 'El guerrero que entrena cada día nunca es sorprendido', 15, 'orange', 250, 'self_report', true),
('KATA_ANTIVIRUS', 'Kata del Escudo Digital', 'Instalar y activar antivirus en tu dispositivo principal', 'Un guerrero sin escudo es vulnerable', 10, 'white', 120, 'manual', true),
('KATA_BACKUP', 'Kata de la Memoria Segura', 'Hacer backup de información importante del negocio', 'Lo que no se respalda, puede perderse para siempre', 30, 'orange', 300, 'self_report', true);

-- ========================================
-- SEED: Dominios oficiales (Ecuador)
-- ========================================
INSERT INTO domains_whitelist (entity_name, domains, entity_type, active) VALUES
('Banco Pichincha', ARRAY['pichincha.com', 'bancopichincha.com'], 'banco', true),
('Banco Guayaquil', ARRAY['bancoguayaquil.com'], 'banco', true),
('Banco del Pacífico', ARRAY['bancodelpacifico.com'], 'banco', true),
('Banco Bolivariano', ARRAY['bolivariano.com'], 'banco', true),
('Banco Internacional', ARRAY['bancointernacional.com.ec'], 'banco', true),
('Produbanco', ARRAY['produbanco.com'], 'banco', true),
('SRI Ecuador', ARRAY['sri.gob.ec'], 'gobierno', true),
('EcuCERT', ARRAY['ecucert.gob.ec'], 'gobierno', true),
('Superintendencia de Bancos', ARRAY['superbancos.gob.ec'], 'gobierno', true),
('Registro Civil Ecuador', ARRAY['registrocivil.gob.ec'], 'gobierno', true),
('Ministerio de Telecomunicaciones', ARRAY['telecomunicaciones.gob.ec'], 'gobierno', true);

-- ========================================
-- SEED: Config de IA por defecto
-- ========================================
INSERT INTO ai_configs (config_name, primary_ai, primary_timeout_ms, fallback_ai, fallback_timeout_ms, tertiary_ai, temperature, max_tokens, prompt_version, active) VALUES
('default', 'deepseek', 8000, 'kimi', 5000, 'claude', 0.10, 500, 'v1.0.0', true);

-- ========================================
-- SEED: Alertas de ejemplo
-- ========================================
INSERT INTO alerts (title, description, threat_type, severity, source, target_business_types, active) VALUES
('Alerta: Phishing bancario activo en Ecuador',
 'Se han detectado correos falsos suplantando a bancos ecuatorianos. No haga clic en links. Llame a su banco directamente.',
 'phishing', 'alta', 'EcuCERT',
 ARRAY['comerciante', 'restaurante', 'ferreteria', 'farmacia'], true),
('Fraude por WhatsApp: Falso técnico de soporte',
 'Criminales se hacen pasar por técnicos de soporte y piden acceso remoto al celular. NUNCA permita acceso remoto a desconocidos.',
 'ingenieria_social', 'media', 'EcuCERT',
 ARRAY['pescador', 'agricultor', 'comerciante'], true);
