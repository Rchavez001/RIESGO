# Índice de documentación — CiberDojo (shield-ecuador-app)

Este documento es el índice general de toda la documentación del proyecto: los `.md` de esta
carpeta raíz y los archivos de [`docs/`](docs/). No describe el código en sí — para eso, sigue los
enlaces de cada fila a su documento correspondiente.

Mantenimiento: cualquier tarea que mueva, archive o cree un documento dentro del alcance de este
índice debe actualizar la tabla correspondiente en el mismo cambio.

## 1. Documentos en la raíz de `shield-ecuador-app/`

| Documento | Propósito | Público |
|---|---|---|
| [ARQUITECTURA_CYBER_DOJO.md](ARQUITECTURA_CYBER_DOJO.md) | Arquitectura técnica completa: capas, base de datos, Edge Functions, paneles de administración. | Desarrollador |
| [BASE_DE_DATOS.md](BASE_DE_DATOS.md) | Esquema completo de la base de datos, tabla por tabla (incluye el módulo de consentimiento). | Desarrollador |
| [DOCUMENTO_FUNCIONALIDADES.md](DOCUMENTO_FUNCIONALIDADES.md) | Requisitos funcionales y no funcionales, con trazabilidad a los documentos especializados. | Product owner / nueva persona que se incorpore |
| [GUIA_LEVANTAMIENTO_PROYECTO.md](GUIA_LEVANTAMIENTO_PROYECTO.md) | Guía paso a paso para levantar el proyecto desde cero (migraciones, Edge Functions, variables de entorno). | Desarrollador nuevo / quien reconstruya el entorno |
| [MANUAL_ADMINISTRADOR.md](MANUAL_ADMINISTRADOR.md) | Manual **oficial y vigente** de las secciones del panel `central-admin-app` (ver nota sobre otras referencias al final de este documento). | Quien administre la consola (hoy, el club Phycom) |
| [MANUAL_USUARIO_CYBER_DOJO.md](MANUAL_USUARIO_CYBER_DOJO.md) | Manual de usuario final, pantalla por pantalla, con texto citado de la UI. | Usuario final / quien capacite usuarios |
| [README-centro-de-seguridad.md](README-centro-de-seguridad.md) | Runbook técnico del submódulo "Centro de Seguridad" del panel admin (requisitos RF-01 a RF-08). | Desarrollador/seguridad |
| [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md) | Seguridad y privacidad de la implementación, incluido el módulo de consentimiento LOPDP. | Auditor/desarrollador de seguridad |
| [SETUP.md](SETUP.md) | Guía corta de instalación y arranque local. | Desarrollador nuevo |

**Fuera de esta tabla, a propósito:** `manual-central-admin.html` (raíz) es un manual visual del
panel admin en HTML autocontenido. No es un `.md`, por lo que queda fuera del alcance editable de
este loop de documentación (decisión registrada como `DOC-04` en `loop-docs/DECISIONS.md`); se
menciona aquí solo como referencia existente, nunca como entrada que este índice vaya a mantener
editable. Ver la nota de la sección 3 sobre cuál de los tres "manuales del administrador" es la
fuente de verdad.

## 2. Documentos en `docs/`

### 2.1 Documentos vigentes

| Documento | Propósito | Público |
|---|---|---|
| [docs/AI_HANDOFF_CYBER_DOJO.md](docs/AI_HANDOFF_CYBER_DOJO.md) | Traspaso breve para quien continúe el desarrollo: mapa de qué documento mirar para cada tema, sin repetir su contenido. | Desarrollador/IA que vaya a tocar código / capacitación club Phycom |
| [docs/BANCO_Y_APRENDIZAJE_CIBERDOJO.md](docs/BANCO_Y_APRENDIZAJE_CIBERDOJO.md) | Acta de publicación del banco de 700 preguntas / 300 casos. | Desarrollador/equipo de contenido |
| [docs/FICHA_DOGGOTEKA.md](docs/FICHA_DOGGOTEKA.md) | Ficha de personaje/diseño de la mascota DoggoTeka. | Diseño de contenido/narrativa |
| docs/Ficha-DoggoTeka.pdf | Versión imprimible de la ficha anterior. | Mismo público |
| docs/Ficha-DoggoTeka.png | Captura de la ficha anterior. | Mismo público |
| [docs/GUIA_OPERACION_CLUB.md](docs/GUIA_OPERACION_CLUB.md) | Guía de operación para el club Phycom: qué hace cada parte del sistema, cómo se despliega y qué revisar con regularidad (panel admin, agente de noticias, Centro de Seguridad). | Club Phycom (operación diaria) |
| [docs/MANUAL_CIBERSEGURIDAD_IMPLEMENTACION.md](docs/MANUAL_CIBERSEGURIDAD_IMPLEMENTACION.md) | Manual de seguridad de la implementación completa (frontend, Supabase, Central Admin). | Auditor de seguridad / desarrollador |
| [docs/MODO_INVITADO.md](docs/MODO_INVITADO.md) | Modo "Probar sin cuenta": qué guarda, aviso breve, evidencia registrada, tope de 10 preguntas y caducidad de la sesión anónima. | Desarrollador/auditor de privacidad |
| [docs/MANUAL_TECNICO_SENSOR_TPOT.md](docs/MANUAL_TECNICO_SENSOR_TPOT.md) | Manual técnico del sensor T-Pot (honeypot) y su propósito. | Desarrollador/seguridad que opere T-Pot |
| [docs/SUPABASE_VERIFICATION_QUERIES.sql](docs/SUPABASE_VERIFICATION_QUERIES.sql) | Consultas de solo lectura para confirmar que la base de datos en Supabase coincide con el repositorio. | Desarrollador/quien verifique un despliegue |
| [docs/TPOT_AI_AGENT.md](docs/TPOT_AI_AGENT.md) | Especificación de los dos agentes de IA de T-Pot (`TpotThreatAnalysisAgent`, `TpotAiAuditAgent`). | Desarrollador/seguridad |
| [docs/TPOT_DEPLOYMENT_CHECKLIST.md](docs/TPOT_DEPLOYMENT_CHECKLIST.md) | Checklist de despliegue seguro de un sensor T-Pot. | Quien despliegue o mantenga el sensor |
| [docs/TPOT_INTEGRATION.md](docs/TPOT_INTEGRATION.md) | Arquitectura completa de la integración T-Pot (flujo, variables de entorno, endpoints, troubleshooting). | Desarrollador |

### 2.2 Documentos controlados (evaluación / auditoría ISO)

Estos documentos tienen fecha y versión declaradas formalmente. **Nunca se editan ni se
sobrescriben directamente** (regla dura de este loop): cualquier cambio propuesto va como un
documento nuevo en `loop-docs/propuestas/`, con su propia tabla de control de versiones y estado
"pendiente de aprobación".

| Documento | Propósito |
|---|---|
| docs/EVALUACION_ISO_42001_TR_24368_CIBERDOJO.md | Evaluación de alineación con ISO/IEC 42001 e ISO/IEC TR 24368. Versión 1.0, 26 de septiembre de 2026. Diagnóstico técnico para revisión de dirección, no conformidad integral. |
| docs/EVALUACION_ISO_42001_TR_24368_CIBERDOJO.html | Misma evaluación, formato HTML. |
| docs/EVALUACION_ISO_42001_TR_24368_CIBERDOJO.docx | Misma evaluación, formato Word. |
| docs/ISO_CIBERDOJO_INVENTARIO.csv | Inventario de archivos revisados para esa evaluación (ruta, bytes, sha256, alcance de revisión). Evidencia histórica, no un documento vivo. |
| docs/Informe_Seguridad_CiberDojo_.pdf | Informe de seguridad. |
| docs/Informe_Profesional_Seguridad_CiberDojo_2026.pdf | Informe profesional de seguridad 2026. |
| docs/Informe de Auditoría de Seguridad - CiberDojo.pdf | Informe de auditoría de seguridad. |
| docs/Análisis de vulnerabilidades — CiberDojo.pdf | Análisis de vulnerabilidades. |
| docs/Cumplimiento OWASP Top 10 — CiberDojo.pdf | Informe de cumplimiento OWASP Top 10. |
| docs/OWASP_Top10_Review_Paper_EDITED.docx | Paper de revisión OWASP Top 10. |

### 2.3 Documentos archivados (`docs/archivo/`)

Documentos históricos, movidos aquí porque ya cumplieron su propósito (decisiones `DOC-02`/`DOC-03`
en `loop-docs/DECISIONS.md`). Cada uno lleva un aviso "Documento histórico, no vigente desde
2026-10-26" al inicio, sin reescribir el resto del contenido.

| Documento | Propósito original | Público |
|---|---|---|
| [docs/archivo/APLICACION_CINEMATICA_LOCAL.md](docs/archivo/APLICACION_CINEMATICA_LOCAL.md) | Instrucciones de revisión local del rediseño cinematográfico (ya publicado en producción). | Desarrollador/QA |
| [docs/archivo/DIRECCION_VISUAL_REFERENCIAS.md](docs/archivo/DIRECCION_VISUAL_REFERENCIAS.md) | Propuesta de dirección de arte del rediseño cinematográfico (ya implementada). | Diseño/dirección de producto |

## 3. `vault/` — notas internas del club

[`vault/`](vault/) es una base de conocimiento interna en formato Obsidian, para que el club
Phycom no repita investigación ya hecha (arquitectura, autenticación, módulos, decisiones de
diseño). No es documentación oficial del proyecto ni código: son notas de orientación. Su propio
índice (`vault/Índice.md`) ya mapea su contenido — no se duplica aquí.

`vault/Manual del administrador.md` es un stub dentro de esa carpeta que remite a
`manual-central-admin.html` (raíz) como "el manual completo". Ninguno de los dos es la fuente de
verdad: **`MANUAL_ADMINISTRADOR.md` (raíz, sección 1 de este índice) es el manual oficial y
vigente** del panel `central-admin-app`. `manual-central-admin.html` y
`vault/Manual del administrador.md` son referencias visuales adicionales, no autoritativas.
