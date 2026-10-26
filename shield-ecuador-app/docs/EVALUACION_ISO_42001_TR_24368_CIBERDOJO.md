# CiberDojo: evaluación de alineación con ISO/IEC 42001 e ISO/IEC TR 24368

**Fecha:** 26 de septiembre de 2026 · **Versión:** 1.0 · **Estado:** diagnóstico técnico y documental para revisión de dirección.

**Objeto:** determinar qué buenas prácticas están respaldadas por evidencia, qué impide justificar conformidad y dónde mejorar la aplicación y su gestión. Las prioridades y responsables de este documento son propuestas; no constituyen compromisos aprobados.

## 1. Dictamen ejecutivo

**CiberDojo presenta alineación parcial con buenas prácticas de gestión y uso responsable de IA. No hay evidencia suficiente para declarar conformidad integral con ISO/IEC 42001:2023.** Hay controles concretos de privacidad, trazabilidad, calidad de contenido y revisión de resultados. Sin embargo, existen brechas técnicas relevantes y no se encontró un sistema de gestión de IA formalmente documentado y operado en el material revisado.

**Frente a ISO/IEC TR 24368:2022, la conclusión correcta es de alineación parcial con sus consideraciones éticas y sociales.** Es un informe técnico orientativo; no se debe presentar como una certificación equivalente a ISO/IEC 42001. Su aplicación exige examinar efectos sobre las personas, además de la seguridad del software. [Fuentes oficiales: ISO 42001](https://www.iso.org/standard/42001) e [ISO TR 24368](https://www.iso.org/standard/78507.html).

Los argumentos favorables más sólidos son:

- El registro exige autorización de tratamiento, cifra campos personales y conserva una versión del aviso de privacidad.
- El Sensei consulta preguntas activas aprobadas y registra fuentes, respuesta, proveedor auditor y tiempos cuando la persistencia tiene éxito.
- La generación de noticias e importación del banco insertan contenido pendiente e inactivo, y existen acciones de aprobación.
- T-Pot normaliza y redacta información sensible; su aprobación comprueba un estado auditado previo.
- El aprendizaje incorpora explicaciones, lenguaje cotidiano, validación de respuestas en servidor y pruebas de estructura del banco.

Estos controles **no bastan** para sostener una declaración general de cumplimiento. Los obstáculos principales son:

1. **Autorización privilegiada inconsistente:** un helper confía en el rol de un JWT sin verificar su firma mientras varias funciones desactivan esa verificación en el gateway.
2. **Gobierno de IA no acreditado:** faltan evidencias de política aprobada, alcance del sistema de gestión, responsables, evaluación de impactos, tratamiento de riesgos y declaración de aplicabilidad.
3. **Supervisión humana desigual:** algunos contenidos pueden activarse mediante auditoría automática; el flujo de katas acepta también un actor de programación automática.
4. **Trazabilidad incompleta:** registros T-Pot en memoria, fallos de registro tolerados y edición de contenido educativo sin nueva versión en ciertas rutas.
5. **Privacidad y transparencia parciales:** falta una política integral evidenciada para textos enviados a proveedores, retención, supresión y comunicación de respuestas degradadas.
6. **Eficacia no demostrada:** pruebas de código y formato no prueban exactitud de la IA, equidad entre grupos ni mejora real del aprendizaje.

**Declaración externa defendible hoy:** «CiberDojo incorpora controles técnicos y pedagógicos compatibles con buenas prácticas de IA responsable y está en proceso de cerrar brechas de gobierno, seguridad y evaluación de impactos. Esta revisión no acredita conformidad ni certificación ISO/IEC 42001».

## 2. Alcance, método y límites

### 2.1 Qué se evaluó

Se revisó transversalmente el repositorio local: aplicación React, panel administrativo Node, Edge Functions, migraciones SQL, configuración, documentación principal, manuales, banco educativo, pruebas y scripts de verificación. Se contrastaron los flujos de IA con sus consumidores, controles y persistencia. Se examinaron también documentos históricos de `release/cyberdojo-clean-repo` como antecedentes, sin tomarlos como descripción vigente.

El inventario local contiene **27 Edge Functions con `index.ts` y 70 archivos de migración SQL**, con numeración que alcanza 072 y contiene saltos. Esta cifra reemplaza, para esta revisión, la descripción histórica de 14 funciones y 21 migraciones.

El [inventario de evidencia](ISO_CIBERDOJO_INVENTARIO.csv) identifica archivos, tamaño, huella SHA-256 y nivel de tratamiento. Una huella acredita la versión inventariada, no la calidad de su contenido. La cobertura combina lectura detallada de rutas relevantes con inventario y búsqueda temática del resto; **no significa revisión manual línea por línea de todo archivo ni auditoría exhaustiva de vulnerabilidades**.

El inventario reúne 326 archivos e incluye antecedentes y materiales auxiliares. En las referencias abreviadas a funciones, `nombre/index.ts` significa `supabase/functions/nombre/index.ts`, y `_shared/` corresponde a `supabase/functions/_shared/`. `tpotService.js` pertenece a `central-admin-app/`; `SenseiConsultPage.tsx` y `RegisterScreen.tsx`, a `frontend/src/screens/`.

La copia de trabajo contiene modificaciones y archivos sin seguimiento anteriores a esta evaluación. Se examina esa copia, no únicamente el último commit ni una versión productiva certificada. No se modificó lógica de la aplicación, no se desplegó código y no se ejecutaron cambios sobre producción.

### 2.2 Cómo interpretar los estados

| Estado | Significado |
|---|---|
| Evidenciado localmente | El control o comportamiento está presente en archivos concretos; no acredita su despliegue ni eficacia continuada. |
| Parcial | Hay una base útil, pero falta cobertura, integración, prueba o gestión. |
| Brecha confirmada localmente | Código o configuración contradicen una propiedad esperada o afirmada. |
| No evidenciado | No se encontró evidencia suficiente en el material disponible; podría existir fuera del repositorio. |
| No verificado en producción | Requiere configuración efectiva, registros o pruebas del entorno publicado. |

No se asigna un porcentaje de «cumplimiento ISO»: sería engañoso sin un alcance aprobado, todos los requisitos aplicables y evidencia operativa. Tampoco se convierten automáticamente los hallazgos en no conformidades de certificación.

### 2.3 Límites normativos y documentales

Se consultaron fichas oficiales de ISO e IEC y documentación oficial de Supabase. No se dispuso de los textos íntegros licenciados de las normas. La matriz por capítulos es una orientación de preparación, **no una comprobación exhaustiva de cada disposición normativa**. Antes de una declaración formal deben cotejarse la edición aplicable y sus requisitos completos.

No se verificaron contratos, decisiones de dirección, competencias del personal, presupuestos, reclamaciones reales, registros de producción, configuración efectiva de Cloud Run/Supabase, restauraciones, contratos de proveedores ni auditorías externas. Los resultados de producción narrados en manuales se tratan como antecedentes documentados, no como pruebas repetidas hoy.

Se excluyeron dependencias de terceros, compilaciones, respaldos completos, cachés, credenciales, bases locales, archivos multimedia y comprimidos del análisis de código operativo. Los PDF de referencia artística/literaria se inventariaron, sin validar integralmente su contenido o licencias; la ficha de la mascota se contrastó con su equivalente Markdown. El Word del banco se extrajo como texto y se revisó su enfoque, sin revalidar individualmente cada fuente externa citada. No se inspeccionaron secretos.

Se interpretan «IQ200» y «10xthink» como una solicitud de rigor y profundidad; no como normas, certificaciones ni métricas verificadas de esta evaluación.

## 3. Marco de referencia y criterio de aplicación

ISO/IEC 42001 se dirige al sistema de gestión de la organización que desarrolla, proporciona o utiliza IA. Por tanto, disponer de una aplicación segura no sustituye decisiones, responsabilidades y registros organizacionales. [Referencia: IEC, ISO/IEC 42001:2023](https://webstore.iec.ch/en/publication/90574).

TR 24368 aporta una perspectiva sobre preocupaciones éticas y sociales. Aquí se utiliza para formular preguntas sobre privacidad, trato justo, transparencia, autonomía, rendición de cuentas y efectos sociales. Las medidas concretas propuestas son decisiones de diseño para CiberDojo, no una reproducción ni una lista oficial exhaustiva del informe. [Referencia: ISO/IEC TR 24368:2022](https://www.iso.org/standard/78507.html).

Guías complementarias pertinentes:

| Documento | Utilidad propuesta en CiberDojo |
|---|---|
| [ISO/IEC 23894:2023](https://www.iso.org/standard/77304.html) | Organizar riesgos de respuestas incorrectas, proveedores, datos y automatizaciones. |
| [ISO/IEC 42005:2025](https://www.iso.org/standard/42005) | Estructurar evaluaciones de impacto por sistema y población afectada. |
| [ISO/IEC TR 24027:2021](https://www.iso.org/standard/77607.html) | Examinar sesgos del contenido, selección de datos y resultados entre grupos. |

Su mención no implica que estén implementadas ni que todas sean requisitos adicionales de certificación. Deben seleccionarse según el alcance y el riesgo.

## 4. Inventario funcional de IA y decisiones automatizadas

| Sistema o flujo | Implementación observada | Datos y salidas | Evaluación |
|---|---|---|---|
| Sensei | `ask-sensei`, banco aprobado, búsqueda web configurable y auditor externo; también fallback local en React | Texto libre, coincidencias, fuentes y respuesta; `sensei_consultations` | Parcial: registra actividad, pero admite respuesta sin corrección de auditor y persistencia fallida. |
| Noticias e investigación | `run-news-agent`, `run-incident-investigator`, `quiz-generator` y helper compartido | Fuentes, noticias, archivos e imágenes; preguntas y ejecuciones de agente | Parcial: entrada pendiente, dependencia de calidad externa y diferentes rutas de aprobación. |
| Auditor de preguntas | `audit-generated-questions` | Preguntas y correcciones propuestas por modelo | Automatización real; no equivale a auditoría independiente ni revisión humana. |
| Importación educativa | `import-question-bank` | Texto extraído de documentos; preguntas pendientes | Base favorable; faltan expediente de derechos de uso y pruebas adversariales documentadas. |
| Reequilibrio de distractores | `fix-learning-item-balance` | Opciones de `learning_items`; actualización directa | Conserva texto correcto, pero no crea una versión nueva ni revisión semántica independiente. |
| Escáner educativo | `frontend/src/services/`, `VulnScanner/`, `vuln-scanner-ai` | Señales del navegador y respuestas estructuradas | Orientativo; no demuestra un escaneo completo del equipo ni ausencia de vulnerabilidades. |
| Centro de Seguridad | `security-diagnose` y `security-kata-convert` | Metadatos de eventos, diagnóstico y contenido educativo | Valida estructura JSON; eso no comprueba verdad del diagnóstico ni aprobación humana efectiva. |
| T-Pot | `central-admin-app/tpotService.js` | Eventos normalizados, indicadores, reportes, revisión | El supuesto cliente IA externo es un placeholder que devuelve reglas locales. Persistencia en memoria. |
| Recomendaciones históricas | `generate-recommendations` | Perfil de riesgo, sector y caché | Sin autenticación de usuario dentro del handler. Su ausencia en rutas activas no prueba que el endpoint esté retirado. |
| Riesgo y correo | `calculate-risk`, `analyze-email` | Respuestas, indicadores y clasificación | Predominan reglas deterministas; no deben presentarse como modelos calibrados. |
| Aprendizaje, ranking y campeonato | RPC de aprendizaje, `get-ranking`, migraciones de campeonato | Aciertos, puntos, cinturón y posiciones | No todo es IA; sí forma parte de los efectos del contenido y de las decisiones automatizadas. |
| Administración por organización | `TenantAdminPage.tsx` | Datos de ejemplo y estado React | Prototipo; no prueba aislamiento multiempresa ni gobierno distribuido operativo. |

El alcance propuesto del futuro sistema de gestión debe cubrir generación, revisión, publicación, atención al usuario, diagnóstico y proveedores. Debe incluir las funciones históricas mientras sigan desplegadas, aunque carezcan de botón en la interfaz.

## 5. Buenas prácticas justificadas con evidencia

| ID | Evidencia local | Por qué es favorable | Límite de la justificación |
|---|---|---|---|
| E01 | `secure-register-user/index.ts:34`, `:70`, `:88`; `SECURITY_PRIVACY.md` | Consentimiento registrado, cifrado de PII y aviso versionado apoyan protección y trazabilidad. | No cubre automáticamente texto libre del Sensei, metadatos, backups o terceros. |
| E02 | `get-private-profile/index.ts`; migraciones 005, 012, 022 y 060 | Control de acceso y limitación de modificaciones de datos sensibles. | Es necesario comprobar políticas y grants efectivos en producción. |
| E03 | `ask-sensei/index.ts:213`, `:146`, `:522` | Banco aprobado, identificadores de preguntas, fuentes y datos del auditor permiten investigar respuestas. | Puede fallar el registro y no hay trazabilidad uniforme de versiones de prompts. |
| E04 | `_shared/news-agent-core.ts:423`; `import-question-bank/index.ts:213` | Contenido generado se inserta pendiente e inactivo. | La aprobación posterior puede ser automática según el flujo. |
| E05 | `security-diagnose/index.ts:31`, `:107`, `:132` | Diferencia salida estructuralmente válida de salida parcial. | La estructura válida no demuestra exactitud, ausencia de sesgo ni seguridad semántica. |
| E06 | `tpotService.js:174`, `:205`, `:235`, `:358` | Redacción, ocultamiento y aprobación condicionada reducen exposición. | Reglas limitadas, configuración modificable y almacenamiento volátil. |
| E07 | Migraciones 026, 059, 061, 063; `tests/learning_database.sql` | Validación en servidor y protección de respuestas/puntuación apoyan integridad educativa. | La existencia de pruebas SQL no acredita que se ejecutaran sobre la versión productiva. |
| E08 | `docs/BANCO_Y_APRENDIZAJE_CIBERDOJO.md:58`; pruebas del banco | Explicaciones y diseño pedagógico reducen barreras para personas no técnicas. | No hay evidencia aportada de pilotaje representativo o eficacia pedagógica medida. |
| E09 | Migraciones 069–072; `fix-learning-item-balance/index.ts:100` | Se identificó una pista de longitud y se protege el texto de la respuesta correcta. | Esto trata calidad de preguntas, no demuestra equidad social del sistema. |
| E10 | `_shared/security-events.ts:18`; `_shared/rate-limit.ts`; migración 053 | HMAC de IP y cuotas persistentes en ciertos endpoints apoyan minimización y resistencia al abuso. | Hay rutas que toleran fallos del control; no existe garantía de cobertura universal. |

## 6. Matriz de preparación para ISO/IEC 42001

La numeración orienta la revisión con el texto oficial; las conclusiones siguientes son valoraciones de la evidencia de CiberDojo. «No evidenciado» no significa que un documento no pueda existir fuera del repositorio.

| Área | Estado | Base existente | Qué falta y dónde trabajar |
|---|---|---|---|
| 4. Contexto | Parcial | Arquitectura y funcionalidades identifican MIPYMEs, ciudadanía y uso educativo. | Aprobar alcance organizacional, entidades responsables, partes interesadas, dependencias y límites. Crear `docs/gobierno-ia/alcance.md`. |
| 5. Liderazgo | No evidenciado | Roles técnicos y controles administrativos. | Política de IA firmada, patrocinio, responsabilidad por riesgos, autoridad para suspender sistemas y mecanismo de escalamiento. La función `is_admin()` no cumple esa función organizacional. |
| 6. Planificación | No evidenciado como sistema | Listas técnicas de riesgos y recomendaciones. | Método de evaluación, registro de riesgos/impactos, criterios de aceptación, objetivos, plan de tratamiento y declaración de aplicabilidad. No confundir `calculate-risk` con evaluación del riesgo de IA de la organización. |
| 7. Apoyo | Parcial | Manuales, código, configuraciones y pruebas. | Evidencia de competencias, recursos, comunicaciones y control documental. Resolver contradicciones entre manuales; asignar dueño y revisión a cada documento. |
| 8. Operación | Parcial con brechas | Generación, validaciones, restricciones, revisiones y registros. | Corregir autorización, publicación, versionado, proveedores, retención y contingencias. Registrar ejecución de controles y decisiones de aceptación. |
| 9. Evaluación del desempeño | Parcial técnico; gestión no evidenciada | Feedback del Sensei, reportes y pruebas locales. | Métricas de exactitud/daño, evaluación por grupos, auditoría interna con independencia y revisión de dirección con decisiones. La «auditoría IA» de respuestas no sustituye esas actividades. |
| 10. Mejora | Parcial | Migraciones correctivas y cambios del banco. | Registro de problemas, análisis causal, responsables, fechas, verificación de eficacia y seguimiento de recurrencias. Un commit no es por sí solo evidencia de cierre eficaz. |

### 6.1 Selección preliminar de controles del Anexo A

Esta tabla es un mapa de trabajo, no una declaración de aplicabilidad aprobada. La selección debe justificarse por riesgos; una función educativa no excluye automáticamente controles de proveedores, datos o impacto.

| Familia orientativa | Estado | Aplicación propuesta |
|---|---|---|
| A.2 Políticas | No evidenciado | Política de uso educativo/defensivo y restricciones de uso secundario de resultados. |
| A.3 Organización interna | Parcial | Separar operación, revisión editorial y aceptación de riesgos; canal para preocupaciones. |
| A.4 Recursos | Parcial | Inventario de modelos, datos, cómputo, dependencias y competencias; registrar versiones y propietarios. |
| A.5 Impactos | No evidenciado formalmente | Evaluar daños a estudiantes, trabajadores, terceros citados en noticias y personas cuyos datos aparezcan en logs. |
| A.6 Ciclo de vida | Parcial | Versionar prompts y contenido; validar antes de publicar; supervisar, retirar y revertir. |
| A.7 Datos | Parcial | Procedencia, permisos, calidad, minimización, retención y trazabilidad del banco y entradas. |
| A.8 Información a interesados | Parcial | Explicar IA/reglas, fuentes, límites, fallos y mecanismos de reclamación. |
| A.9 Uso | Parcial | Delimitar usos autorizados, supervisión y formación de administradores y usuarios. |
| A.10 Terceros/clientes | No evidenciado documentalmente | Evaluar proveedores, acuerdos de tratamiento, cambios de modelo, continuidad y responsabilidades. |

## 7. Evaluación ética y social frente a TR 24368

Las dimensiones siguientes son una operacionalización propuesta para esta aplicación, no una lista normativa textual.

| Dimensión | Práctica favorable | Brecha o incertidumbre | Mejora verificable |
|---|---|---|---|
| Beneficio y prevención del daño | Educación defensiva, explicaciones y orientación para prevenir fraude. | Un consejo incorrecto puede inducir confianza o acciones perjudiciales. | Banco de casos críticos revisado por especialistas; política de abstención y derivación. |
| Privacidad | Cifrado de registro y redacción T-Pot. | Textos libres y `metadata` llegan a rutas IA sin redacción uniforme demostrada. | Minimización por campo, pruebas de fuga, aviso de terceros y retención comprobable. |
| Transparencia | Fuentes y registros de auditoría en el backend. | Fallback, reglas locales y niveles de confianza pueden confundirse con IA validada. | Mostrar origen y estado de revisión; quitar confianza numérica no calibrada. |
| Equidad y no discriminación | Lenguaje cotidiano, contextos ocupacionales variados y revisión de distractores. | No hay evaluación comparativa por alfabetización digital, discapacidad o conectividad. | Pilotaje con participación voluntaria y minimización de datos; métricas de comprensión y error. |
| Autonomía y supervisión | Rechazo del consentimiento, controles de revisión y feedback. | Revisión no siempre humana; gamificación y ranking pueden ejercer presión. | Revisión proporcional al riesgo, opción de no aparecer en ranking, reclamo y revisión humana. |
| Responsabilidad | Actores y estados registrados en algunas rutas. | Actores genéricos, Basic Auth y registros volátiles debilitan atribución. | Identidades individuales, registros persistentes y decisión de publicación atribuible. |
| Fiabilidad | Esquemas JSON, timeouts, pruebas de banco y estados parciales. | Sin evaluación de veracidad, contradicciones, inyección de instrucciones y deterioro por cambios de modelo. | Evaluación repetible antes de cambios y vigilancia de resultados reales. |
| Inclusión y accesibilidad | Diseño de lectura, lenguaje simple y pautas de movimiento reducido documentadas. | No se aportó auditoría integral con tecnologías de asistencia y dispositivos modestos. | Pruebas de teclado, lector de pantalla, contraste, movimiento y conectividad limitada. |
| Efectos sociales | Formación para personas no técnicas. | Ranking excluye dominios de correo públicos; el resultado podría reutilizarse para valorar laboralmente a personas. | Explicar el alcance del ranking y justificarlo; limitar formalmente uso para decisiones laborales. |
| Sostenibilidad | Caché y reglas locales pueden reducir llamadas. | No se evidencia medición de consumo/coste por resultado útil. | Medir llamadas, tokens cuando disponibles y coste; estimar impacto ambiental con método y supuestos explícitos. |
| Participación y reparación | Feedback «sí/no ayudó» y contacto de privacidad. | No acredita proceso de reclamación sobre contenido IA, plazos ni comunicación de correcciones. | Canal accesible con número de caso, responsable, respuesta y seguimiento. |

**Conclusión ética:** existe una intención educativa y controles que la respaldan, pero no evidencia suficiente para afirmar que los efectos sobre todas las poblaciones relevantes están evaluados, aceptados y vigilados. La ausencia de un incidente conocido no demuestra ausencia de impacto.

## 8. Hallazgos y modificaciones concretas

Prioridades propuestas: **P0**, contención y verificación inmediata; **P1**, antes de afirmar alineación robusta o ampliar el uso; **P2**, consolidación y mejora. Las prioridades son juicio de esta revisión, no puntuaciones CVSS ni categorías oficiales ISO.

### H01 — P0 — Rol privilegiado aceptado sin verificar firma

**Evidencia:** `_shared/news-agent-core.ts:495–540` acepta `decodeJwtRole(token) === 'service_role'`. La función únicamente decodifica el payload. `supabase/config.toml:402–415` establece `verify_jwt = false` para `run-news-agent`, `check-security-alerts`, `security-diagnose` y `security-easm-scan`, que usan ese helper.

**Por qué importa:** el comentario presupone verificación del gateway, pero la configuración local la desactiva. La combinación permite que una afirmación de rol no autenticada alcance la ruta privilegiada del helper. Existe una brecha confirmada en código/configuración; la exposición efectiva depende del despliegue. No se intentó explotar producción.

**Modificar:** autenticar criptográficamente o verificar la credencial de servicio por un mecanismo soportado; mantener validación de identidad y rol para usuarios y un secreto específico para programación. No basta restringir CORS ni revisar el nombre del rol. [Supabase: seguridad de Edge Functions](https://supabase.com/docs/guides/functions/auth).

**Cierre:** pruebas negativas de token manipulado, sin firma válida, expirado, usuario normal e invitado; positivas de admin y programación legítimos; evidencia de configuración efectiva de las cuatro funciones. Responsable propuesto: backend/seguridad. Asociado a operación, integridad y responsabilidad.

### H02 — P1 — Aprobación de máquina confundible con supervisión humana

**Evidencia:** `audit-generated-questions/index.ts:124–165` activa aprobadas por defecto salvo configuración contraria. `security-kata-convert/index.ts:26` utiliza `requireAdminOrScheduler`, y `handlePublish` no exige una identidad humana diferenciada. T-Pot permite desactivar `AI_OUTPUT_REQUIRES_APPROVAL`.

**Por qué importa:** que exista el estado `approved` no demuestra una decisión humana. Las normas no implican que una persona deba aprobar cada respuesta: el nivel de supervisión debe justificarse según riesgos. La documentación sí promete aprobación humana en ciertos flujos y el código no la garantiza completamente.

**Modificar:** separar `machine_review_status`, `human_review_status` y `publication_status`; reservar publicación de contenido sensible a una persona identificada; impedir al scheduler aprobarlo; justificar cualquier publicación automática de bajo riesgo. En katas, hacer publicación y transición atómicas/idempotentes, pues actualmente son escrituras separadas.

**Cierre:** scheduler y proveedor no pueden publicar material reservado; revisión humana deja actor, versión, fecha y motivo; concurrencia/reintentos no duplican preguntas. Responsables: backend y responsable editorial.

### H03 — P1 — Respuestas degradadas y auditoría incompleta del Sensei

**Evidencia:** `ask-sensei/index.ts:532–582` retorna un resultado local cuando no hay auditor o este falla; `:677–687` devuelve el borrador sin corrección. `:719–721` tolera fallo de inserción. `SenseiConsultPage.tsx:86–97` utiliza un fallback local tras otros fallos del servicio.

**Modificar:** registrar y comunicar `generation_mode`, `audit_status`, versión y estado de persistencia; definir qué temas admiten fallback seguro y cuáles requieren abstención/derivación. Incorporar cola/reintento y alerta ante pérdida de auditoría, sin almacenar PII innecesaria. Revisar las cuotas del Sensei, basadas en conteo de consultas registradas, frente a concurrencia y errores de persistencia.

**Cierre:** fallos de proveedor, timeout y base de datos producen estados visibles y recuperables; nunca se presenta una respuesta degradada como verificada. Responsables: backend/frontend/operaciones.

### H04 — P1 — Protección de datos insuficiente en entradas libres y terceros

**Evidencia:** `ask-sensei/index.ts:537` envía la pregunta en el payload del auditor; `security-diagnose/index.ts:65–90` remite eventos con `metadata`. No se observa redacción uniforme en esos puntos. El aviso de `RegisterScreen.tsx:208–215` describe fines internos y un contacto para derechos, sin detalle de esos proveedores.

**Modificar:** catálogo de datos por flujo y proveedor; redacción antes de salir, minimización de `metadata`, prevención de secretos en archivos, aviso contextual y procedimiento de retención/supresión. Documentar condiciones contractuales de tratamiento, uso para entrenamiento, conservación y ubicación de cada proveedor. Obtener evaluación jurídica aplicable sin asumir que el consentimiento de registro cubre todo.

**Cierre:** entradas sintéticas con identificadores y secretos no salen sin tratamiento autorizado; se verifica eliminación de consultas/adjuntos y se gestionan backups conforme a política. Responsables: privacidad, backend y dirección.

### H05 — P1 — Auditoría T-Pot volátil

**Evidencia:** `tpotService.js:5–8` declara `MEMORY_JOBS`, `MEMORY_AUDIT`, `MEMORY_IOCS`; `getAuditLog` devuelve los últimos registros de memoria. La migración 013 define tablas, pero tenerlas no implica utilizarlas.

**Modificar:** persistir trabajos, revisiones y aprobaciones con actor individual y controles de integridad/retención. Definir qué sucede al reiniciar o escalar el servicio.

**Cierre:** un trabajo creado en una instancia puede revisarse en otra y tras reinicio; restauración y consulta de evidencias verificadas. Responsable: backend/operaciones.

### H06 — P1 — Versionado de contenido y procedencia incompletos

**Evidencia:** `fix-learning-item-balance/index.ts:112–120` cambia `learning_items.content` conservando identificador y versión; el antes/después se devuelve en la respuesta, sin historial persistente en esa función. La migración 044 sustituye contenido por par dojo/cinturón. `audit-generated-questions/index.ts:165` cambia el tipo de origen al aprobar/rechazar.

**Por qué importa:** conservar la respuesta correcta no conserva el significado de los distractores. Un intento histórico puede resultar difícil de reproducir. Además, el trigger de la migración 044 exige `source_type='news_generated'`, mientras el auditor cambia ese valor: las rutas automática y manual no necesariamente sincronizan igual.

**Modificar:** revisiones inmutables, procedencia separada de estado, snapshots o referencias a versión exacta por intento; historial con antes/después, modelo y decisión. Verificar la interacción del auditor con la sincronización del banco.

**Cierre:** un intento previo se reproduce con su contenido original; se puede retirar una revisión; aprobaciones manual y automática tienen resultados previstos y probados. Responsables: backend y pedagogía.

### H07 — P1 — Validación de formato sin garantía de veracidad

**Evidencia:** esquema de diagnóstico en `security-diagnose/index.ts:31`; parsing del auditor en `ask-sensei/index.ts:559`; controles de contenido en `audit-generated-questions/index.ts:119–182`. T-Pot `localAudit` devuelve `unsupported_claims: []` sin una comprobación general de afirmaciones.

**Modificar:** validación semántica y de identificadores, una sola respuesta correcta, fuentes accesibles y pertinentes, pruebas de contradicciones, contenido ofensivo e instrucciones insertadas en noticias/documentos/logs. Verificar todos los errores de escritura antes de contabilizar éxitos. El auditor no debería aceptar un identificador ajeno al lote pendiente.

**Cierre:** batería independiente con casos seguros/inseguros, umbrales aprobados y reporte por versión de modelo/prompt. Responsable: QA de IA y especialista de dominio.

### H08 — P1 — Administración con atribución y privilegios insuficientemente separados

**Evidencia:** `central-admin-app/server.js:88`, `:178`, `:209` implementa Basic Auth, denegación si faltan credenciales y proxy con service role. El helper compartido devuelve `central-admin`, no una identidad personal.

**Modificar:** identidad individual, autenticación reforzada, roles editor/revisor/operador, operaciones permitidas explícitas y registro de cambios. Verificar si ya existe IAP/SSO externo antes de duplicarlo. Basic Auth no implica incumplimiento ISO por sí solo, pero no demuestra atribución individual ni mínimo privilegio.

**Cierre:** pruebas de separación de funciones y atribución del actor; revisión de permisos; evidencia de protección del servicio directo y de su proxy. Responsable: infraestructura/seguridad.

### H09 — P1 — Falta expediente de gestión de IA

**Evidencia:** búsqueda transversal no identificó política aprobada de IA, declaración de aplicabilidad, evaluaciones formales de impacto, actas de revisión de dirección ni programa de auditoría interna. Los manuales técnicos son útiles pero no reemplazan esos registros.

**Crear:** paquete de gobierno descrito en la sección 10. **Cierre:** documentos aprobados y evidencia de al menos un ciclo real de aplicación, medición, revisión y corrección. Responsable: dirección y responsable designado de IA.

### H10 — P1 — Proveedores y cambios de modelo sin evaluación acreditada

**Evidencia:** tablas/configuraciones de proveedores y cadenas de fallback existen; no se aportan evaluaciones contractuales y de impacto por proveedor/modelo. T-Pot `callAiProvider` es una función local, no integración externa real.

**Modificar:** fichas de sistemas/modelos, proveedores autorizados por categoría de datos, cambios sometidos a evaluación, contingencia y retiro. Registrar modelo/configuración efectiva en cada ejecución, incluyendo cambios por fallback. No presentar nombres de proveedores configurados como prueba de que fueron utilizados.

**Cierre:** cada proveedor habilitado tiene evaluación, responsable y pruebas antes del cambio; fallback mantiene requisitos de privacidad y calidad. Responsables: dirección, privacidad y backend.

### H11 — P1 — Función histórica de recomendaciones con controles propios insuficientes

**Evidencia:** `generate-recommendations/index.ts:16–32` procesa entradas y crea cliente privilegiado sin validar usuario; la caché se calcula solo con `riskProfile` aunque la respuesta también depende de `businessType`. No se observa límite propio de consumo. La política de migración 022 permite lectura de caché a `authenticated`.

**Modificar:** confirmar si está desplegada; retirarla si no se usa o agregar identidad, autorización, límites, esquema de entrada, partición/minimización de caché y clave que incluya todos los factores relevantes. Revisar si su contenido permite reidentificación antes de permitir lectura general.

**Cierre:** inventario de endpoints publicado; acceso no autorizado rechazado; dos sectores no reciben por error la misma recomendación cacheada. Responsable: backend. No se afirma fuga real de datos en esta revisión.

### H12 — P1 — Equidad del ranking y uso secundario del desempeño

**Evidencia:** `get-ranking/index.ts:94` excluye usuarios sin dominio o con dominio público; `:105–114` devuelve nombre abreviado, dominio y puntos. Abreviar un nombre no anonimiza a una persona dentro de una organización pequeña.

**Modificar:** justificar si el ranking representa solo organizaciones, indicarlo claramente, ofrecer alias/exclusión y evaluar publicación por grupo. Establecer que puntos y cinturones educativos no son una medida validada de aptitud laboral o seguridad empresarial.

**Cierre:** reglas comunicadas y aceptadas por el responsable de producto; pruebas de inclusión/exclusión y mecanismo de corrección. Responsables: producto/privacidad.

### H13 — P2 — Confianza numérica y etiquetas con riesgo de sobreinterpretación

**Evidencia:** `tpotService.js:349` usa `0.72` si hay eventos y `0.2` si no; `analyze-email/index.ts:116` convierte puntuación en `confidenceScore`. Ninguna operación equivale a calibración estadística.

**Modificar:** describirlos como indicadores heurísticos o retirarlos hasta validarlos; identificar claramente reglas locales, escáner educativo y prototipo multiempresa. Revisar reportes descargables además de pantallas.

**Cierre:** las etiquetas reflejan lo medido y pruebas con usuarios confirman comprensión de límites. Responsables: producto/QA.

### H14 — P1 — Control documental desactualizado

**Evidencia:** arquitectura y setup describen 14 funciones y migraciones hasta 021; existen funciones y migraciones posteriores. `SECURITY_PRIVACY.md:138` señala RLS ausente que la migración 022 incorpora. El manual administrativo describe módulos como maqueta que `app.js` ya conecta a funciones. La documentación de aprendizaje dice que agentes de noticias no generan `learning_items`, pero la migración 044 contiene un puente. `/practica` está documentada como demo y el router actual redirige a `/dojos`.

**Modificar:** actualizar fuentes principales, marcar documentos históricos, retirar afirmaciones incompatibles y vincular cada versión documental a una release. Presencia local de un workflow Playwright tampoco demuestra que CI se ejecute correctamente en el repositorio padre.

**Cierre:** inventarios generados desde la release, revisión cruzada de manuales y responsable/fecha de próxima revisión. Responsables: líder técnico y documentación.

### H15 — P2 — Claves, cuotas y retención requieren pruebas operativas

**Evidencia:** `SECURITY_PRIVACY.md:79–88` reconoce una clave activa; `_shared/pii.ts:33` carga una sola clave; `_shared/rate-limit.ts:37–49` tolera error de RPC y usa el correo suministrado en la clave del bucket. `secure-register-user` le pasa un correo real.

**Modificar:** clave por versión y separación de fines criptográficos; procedimiento probado de rotación; HMAC de identificadores en cuotas; retención específica por tabla; política de degradación de controles y alertas. Confirmar rotaciones históricas mencionadas en manuales sin asumir que ya ocurrieron.

**Cierre:** lectura correcta de históricos tras rotación, limpieza verificable, control de abuso bajo fallo y evidencia de recuperación. Responsables: seguridad/operaciones.

### H16 — P1 — Falta evidencia de eficacia y pruebas adversariales de IA

**Evidencia:** existen pruebas estructurales, SQL y de interfaz; las ejecutadas en esta revisión se detallan en la sección 11. No se aportó evaluación longitudinal de errores/daños, sesgos o aprendizaje real, ni una batería integral de IA ejecutada por versión.

**Modificar:** evaluación de exactitud, fuentes, abstención, fugas, inyección, accesibilidad y calidad pedagógica; combinar pruebas automáticas y revisión experta. Mantener un conjunto reservado que no se use para ajustar prompts.

**Cierre:** resultados reproducibles, umbrales aprobados y tratamiento de fallos críticos antes de liberar. Responsables: QA, pedagogía y responsable de IA.

### H17 — P2 — Recomendación comercial dentro de una respuesta de seguridad

**Evidencia:** `frontend/src/services/scanOrchestrator.ts`, función `generarRespuestaFallback`, recomienda contactar a INSTASEG cuando la consulta/auditoría IA falla. La aplicación también tiene campañas y patrocinadores. Esto no demuestra un acuerdo comercial ni una infracción; sí requiere evaluar cómo percibe el usuario esa recomendación.

**Modificar:** identificar cualquier relación comercial existente, separar la recomendación educativa de publicidad y justificar la selección del servicio recomendado. Ofrecer criterios neutrales y alternativas de ayuda cuando proceda; evitar que un fallo del modelo se convierta inadvertidamente en recomendación promocional.

**Cierre:** revisión de producto y comunicación transparente comprobada con usuarios. Responsables: producto y dirección. Asociado a autonomía, transparencia y conflictos de interés.

## 9. Plan de mejora propuesto

| Fase orientativa | Entregables | Responsable sugerido | Dependencia y condición de cierre |
|---|---|---|---|
| Inmediata, 0–7 días | Verificar despliegue y contener H01; revisar endpoints históricos; preservar registros relevantes. | Backend/seguridad | Autorización comprobada en entorno controlado y configuración efectiva revisada. |
| 1–4 semanas | H02–H08: publicación, datos salientes, identidad, persistencia y versiones. | Tecnología, privacidad, editorial | Pruebas negativas y de recuperación; trazabilidad de una salida completa. |
| 1–4 semanas, en paralelo de proceso | Alcance, política, responsables, riesgos, impactos y aplicabilidad. | Dirección/responsable de IA | Aprobación formal y responsables con recursos; no solo plantillas. |
| 4–8 semanas | Evaluaciones de IA, proveedores, accesibilidad, ranking y documentos actualizados. | QA/producto/privacidad | Métricas y umbrales aprobados; brechas de alto impacto cerradas. |
| 8–12 semanas o cuando exista evidencia suficiente | Auditoría interna, revisión de dirección y acciones correctivas. | Auditor independiente del trabajo evaluado y dirección | Eficacia comprobada; expediente cotejado contra el texto íntegro de ISO/IEC 42001. |

Los plazos no prometen certificación ni presuponen tamaño del equipo. La preparación para evaluación externa depende de evidencia real, no de haber completado un calendario. Primero debe confirmarse si las brechas locales también están desplegadas.

## 10. Expediente mínimo que debe producir la organización

Ubicación propuesta: `docs/gobierno-ia/`, con registros sensibles en un repositorio de evidencias de acceso restringido. Los nombres siguientes son **archivos por crear**, no documentos existentes ni aprobados.

| Documento/registro | Contenido mínimo y evidencia esperada |
|---|---|
| `alcance.md` | Organización, servicios, ambientes, usuarios, exclusiones justificadas, proveedores y partes interesadas. |
| `politica-ia.md` | Uso autorizado, protección de personas, transparencia, supervisión y compromiso de mejora; aprobación de dirección. |
| `responsabilidades.md` | Dueño de cada sistema, aprobador editorial, responsable de privacidad, incidentes, riesgos y auditoría. |
| `inventario-sistemas.csv` | Finalidad, modelo/reglas, versión, datos, proveedor, criticidad, límites, dueño y estado productivo. |
| `riesgos.csv` | Escenario de daño, afectados, causas, probabilidad/impacto con criterio, controles, responsable, riesgo residual y aceptación. |
| `impactos/` | Evaluación por flujo con beneficios, daños, poblaciones vulnerables, alternativas, consulta a afectados y seguimiento. |
| `aplicabilidad.csv` | Referencia oficial de control, aplicabilidad, justificación, implementación, evidencia, dueño y revisión. |
| `proveedores/` | Evaluación técnica y contractual, restricciones de datos, cambios y salida/continuidad. |
| `ciclo-de-vida.md` | Reglas para cambios, pruebas, aprobación, despliegue, supervisión, rollback y retiro. |
| `datos-y-retencion.md` | Origen, derechos de uso, calidad, redacción, conservación por tabla, eliminación y backups. |
| `evaluaciones/` | Dataset versionado, criterios, resultados por modelo/prompt, revisión humana y decisión de liberar. |
| `incidentes-y-reclamos/` | Casos de daño/error, severidad, contención, aviso, resolución, causa y verificación de eficacia. |
| `auditoria-y-direccion/` | Programa, independencia, hallazgos, revisión de métricas, decisiones y seguimiento. |
| `competencias.md` | Formación y evidencia de competencia de quienes generan, revisan y operan IA. |

### 10.1 Registro inicial de riesgos a desarrollar

| Riesgo | Personas afectadas | Controles actuales | Tratamiento pendiente |
|---|---|---|---|
| Consejo falso ante fraude | Estudiante y negocio | Banco, fuentes, auditor configurable | Evaluación experta, abstención, derivación y aviso de corrección. |
| Datos personales en prompt/archivo | Usuario y terceros mencionados | Cifrado de perfil, redacción T-Pot | Redacción transversal y restricciones de proveedores. |
| Contenido manipulado mediante instrucciones externas | Estudiantes y administradores | Prompts, esquemas y revisión parcial | Pruebas adversariales y aislamiento de instrucciones/datos. |
| Activación o modificación no autorizada | Toda la comunidad | Auth/RLS y estados | H01, identidad individual, publicación transaccional. |
| Cambio educativo no reproducible | Estudiante con intento anterior | Identificadores/versiones iniciales | Versiones inmutables y rollback verificable. |
| Desventaja por conectividad o alfabetización | Usuarios con barreras de acceso | Diseño pedagógico y explicaciones | Pilotaje y ajustes con participación de afectados. |
| Interpretación laboral del ranking | Trabajadores | Nombre abreviado | Finalidad limitada, alias, oposición y explicación de cobertura. |

No se inventan probabilidades ni riesgos residuales: deben determinarse con datos, criterios aprobados y responsables.

### 10.2 Indicadores y puertas de aceptación propuestos

- **Trazabilidad:** proporción de ejecuciones con proveedor/modelo o modo local, versión de prompt/contenido y estado de revisión; registrar pérdidas de auditoría.
- **Calidad:** exactitud y pertinencia de fuentes en muestras revisadas, respuestas peligrosas, abstenciones apropiadas y reclamaciones por versión.
- **Privacidad:** fugas en pruebas sintéticas, cumplimiento de plazos internos de supresión y proveedores sin evaluación vigente.
- **Supervisión:** publicaciones que requieren revisión con evidencia humana completa; objetivo propuesto de cobertura total de ese subconjunto.
- **Equidad pedagógica:** comprensión, errores y abandono entre grupos relevantes, controlando diferencias de contexto y evitando recopilar atributos innecesarios.
- **Operación:** errores por proveedor, uso de fallback, costes, reintentos y tiempo de recuperación; resultados de restauración.

Como puerta inicial se propone no liberar con bypass de autorización conocido, fuga de secretos en pruebas o publicación que eluda una revisión humana requerida. Los demás umbrales deben acordarse antes de evaluar; cero fallos en una muestra no demuestra riesgo cero.

## 11. Verificación realizada y pendiente

Se ejecutaron pruebas locales existentes, sin llamadas productivas deliberadas ni modificación de datos de usuarios:

| Comando | Resultado observado el 26-09-2026 | Qué demuestra y qué no |
|---|---|---|
| `node central-admin-app/tests/tpotService.test.js` | Salida `tpotService tests passed`; código 0 | Pasa esa batería local; no demuestra persistencia distribuida ni sensor real. |
| `node tests/url-guard.test.cjs` | 4 URL permitidas y 32 bloqueadas; código 0 | Reglas unitarias de URL; no prueba toda la cadena de red/DNS en producción. |
| `node tests/shuffle-options.test.cjs` | 5 comprobaciones satisfactorias; código 0 | Preservación de opciones y variación de posición en muestras; no calidad semántica ni equidad social. |
| `python -m unittest discover -s tests -p test_learning_bank.py -v` | 3 pruebas satisfactorias | Estructura del banco local de 1.000 ítems; no identidad con el banco productivo ni eficacia educativa. |

No se ejecutó toda la suite E2E, las pruebas SQL, un pentest, un escaneo activo de servicios ni una evaluación de modelos con datos reales. No se afirma que toda la aplicación haya pasado pruebas. La revisión estática identificó H01 sin enviar tokens manipulados a servicios remotos.

Validaciones posteriores necesarias:

1. Confirmar versiones desplegadas, funciones expuestas y configuración JWT efectiva.
2. Exportar únicamente metadatos de RLS/grants/funciones y contrastarlos con migraciones; no extraer PII para demostrar permisos.
3. Probar autorización y publicación con cuentas/fixtures controlados en un entorno aislado.
4. Validar retención, eliminación, rotación y recuperación de registros.
5. Ejecutar batería semántica y adversarial por versión de modelo/prompt.
6. Obtener registros organizacionales y cotejarlos con la norma íntegra.

## 12. Reconciliación de documentación y cobertura

| Grupo | Material considerado | Valor y limitación |
|---|---|---|
| Arquitectura/datos | `ARQUITECTURA_CYBER_DOJO.md`, `BASE_DE_DATOS.md`, `DOCUMENTO_FUNCIONALIDADES.md` | Base histórica útil; inventarios y algunos estados ya superados por código posterior. |
| Operación | `GUIA_LEVANTAMIENTO_PROYECTO.md`, `SETUP.md`, `frontend/README.md` | Instrucciones no equivalen a ejecución; actualizar conjunto de migraciones y funciones. |
| Usuarios/admin | `MANUAL_USUARIO_CYBER_DOJO.md`, `MANUAL_ADMINISTRADOR.md`, `manual-central-admin.html` | Contrastar pantallas y capacidades reales; evitar mezclar maqueta e integración. |
| Seguridad/privacidad | `SECURITY_PRIVACY.md`, `docs/MANUAL_CIBERSEGURIDAD_IMPLEMENTACION.md`, `README-centro-de-seguridad.md`, consultas SQL de verificación | Controles y brechas reconocidos; algunas observaciones son históricas y necesitan cierre evidenciado. |
| T-Pot | Manual del sensor, integración, agentes y checklist de despliegue | Distinguen sensor externo y consola; checklist sin completar no prueba cumplimiento. |
| Continuidad | `docs/AI_HANDOFF_CYBER_DOJO.md` | Reúne decisiones de varias etapas; no todo refleja simultáneamente el estado actual. |
| Educación | Documento del banco, Word de origen, JSON/CSV y scripts | Permiten análisis de calidad estructural; falta pilotaje y expediente completo de fuentes/licencias. |
| Diseño | Documentos cinematográficos, referencias, ficha de mascota, `proposal/README.md` | Aportan intención de accesibilidad y comunicación; no certifican accesibilidad ni derechos del arte. |
| Release histórica | Documentación de `release/cyberdojo-clean-repo`, incluida auditoría IA previa | Antecedente comparativo; no prueba que los riesgos sigan vigentes ni que hayan sido cerrados. |

Las contradicciones identificadas deben resolverse contra una release identificable, no sustituyendo indiscriminadamente un manual por otro. Se recomienda conservar historial y marcar expresamente qué versión describe cada documento.

## 13. Condiciones para una futura declaración de conformidad

La organización podrá considerar una declaración de conformidad solo tras definir el alcance, comprobar todos los requisitos aplicables con el texto oficial, resolver o tratar justificadamente las brechas, demostrar operación de controles y completar evaluación interna y revisión de dirección. Si busca certificación, deberá someter el sistema de gestión a la evaluación correspondiente; este documento no la concede ni la sustituye.

Para TR 24368, la evidencia defendible será una evaluación ética y social documentada, participativa y revisada, con decisiones y medidas verificables. No basta incluir su número en una política o colocar una etiqueta en la interfaz.

**Decisión recomendada:** adoptar este diagnóstico como entrada a un programa de mejora; priorizar H01 y la autenticidad de las aprobaciones; conservar las buenas prácticas existentes y completar gobierno, evidencia operativa y evaluación de impactos antes de afirmar cumplimiento integral.

## 14. Referencias

Fuentes consultadas el 26 de septiembre de 2026; no se reproduce el texto íntegro de las normas:

- [ISO/IEC 42001:2023 — ficha oficial ISO](https://www.iso.org/standard/42001).
- [ISO/IEC 42001:2023 — ficha oficial IEC](https://webstore.iec.ch/en/publication/90574).
- [ISO/IEC TR 24368:2022 — ética e impacto social](https://www.iso.org/standard/78507.html).
- [ISO/IEC 23894:2023 — gestión de riesgos de IA](https://www.iso.org/standard/77304.html).
- [ISO/IEC 42005:2025 — evaluación de impacto](https://www.iso.org/standard/42005).
- [ISO/IEC TR 24027:2021 — sesgos](https://www.iso.org/standard/77607.html).
- [Supabase — Securing Edge Functions](https://supabase.com/docs/guides/functions/auth).

Las referencias de archivo y línea corresponden a la copia local examinada; pueden desplazarse tras cambios. Usar el inventario de huellas para identificar esa base de evidencia.
