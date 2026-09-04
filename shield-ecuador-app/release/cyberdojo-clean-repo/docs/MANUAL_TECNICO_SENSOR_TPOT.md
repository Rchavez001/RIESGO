# Manual tecnico del sensor T-Pot y su utilidad

Fecha de revision: 2026-06-23  
Proyecto: Shield Ecuador / Ciber Dojo  
Componente documentado: integracion administrativa con sensor T-Pot externo

## 1. Proposito del sensor

El sensor T-Pot sirve para observar actividad hostil o sospechosa contra servicios expuestos controladamente. Su utilidad principal es defensiva:

- Capturar intentos de fuerza bruta, sondeos, escaneos y payloads sospechosos.
- Identificar IPs origen, puertos atacados, protocolos, sensores afectados y patrones repetidos.
- Extraer indicadores de compromiso o IOCs para analisis defensivo.
- Convertir eventos reales en reportes ejecutivos, tecnicos y educativos para Ciber Dojo.
- Alimentar ejercicios, katas y preguntas de concientizacion con evidencia observada.

En esta aplicacion, el sensor real no corre dentro del repositorio ni dentro de `central-admin-app`. El sensor real debe ser una instalacion T-Pot separada, aislada y conectada a un Elasticsearch/OpenSearch. La app administrativa consulta esos datos, los normaliza, los sanitiza y los presenta.

## 2. Definicion precisa

### 2.1 Que es el sensor

El sensor es la fuente externa de telemetria honeypot. En una arquitectura T-Pot real, puede incluir componentes como:

- Cowrie: captura interacciones tipo SSH/Telnet y fuerza bruta.
- Dionaea: captura intentos contra servicios vulnerables y malware.
- Suricata: genera alertas de red IDS.
- Heralding u otros sensores: capturan intentos de autenticacion y servicios simulados.
- Elastic/OpenSearch: almacena los eventos generados por los sensores.

### 2.2 Que es la app administrativa

La app administrativa es la consola que consume los eventos del sensor. Implementa:

- Conexion a Elastic/OpenSearch mediante `TPOT_ELASTIC_URL`.
- Autenticacion hacia Elastic/OpenSearch con usuario/password o token.
- Normalizacion de eventos.
- Redaccion de datos sensibles.
- Extraccion de IOCs.
- Reportes.
- Analisis IA defensivo.
- Auditoria antes de mostrar resultados IA.

### 2.3 Que no es

La app administrativa no es:

- Un honeypot.
- Un IDS completo.
- Un SIEM completo.
- Un escaner ofensivo.
- Un sistema de bloqueo automatico.
- Un sistema de respuesta automatizada sobre atacantes.

## 3. Arquitectura funcional

Flujo implementado:

```text
Atacante / trafico externo
  -> Sensor T-Pot externo
  -> Indices Elastic/OpenSearch
  -> Central Admin /api/admin/tpot/*
  -> tpotService.js
  -> Normalizacion
  -> Sanitizacion
  -> IOCs / MITRE / resumenes
  -> UI administrativa
  -> Analisis IA defensivo
  -> Auditoria
  -> Aprobacion para visualizacion
```

La aplicacion central no se conecta directamente a los contenedores internos de T-Pot. Consulta el backend de datos mediante API compatible con Elasticsearch/OpenSearch.

## 4. Componentes del codigo

### 4.1 `central-admin-app/server.js`

Responsabilidades:

- Sirve archivos estaticos de la app administrativa.
- Protege el admin con Basic Auth si existen `CENTRAL_ADMIN_USER` y `CENTRAL_ADMIN_PASSWORD`.
- Expone endpoints `/api/admin/tpot/*`.
- Aplica rate limit basico por IP/ruta: 80 solicitudes por minuto.
- Delega toda la logica T-Pot a `tpotService.js`.

Endpoints T-Pot implementados:

- `GET /api/admin/tpot/health`
- `GET /api/admin/tpot/summary`
- `GET /api/admin/tpot/logs`
- `GET /api/admin/tpot/reports`
- `GET /api/admin/tpot/iocs`
- `GET /api/admin/tpot/audit-log`
- `GET /api/admin/tpot/settings`
- `PUT /api/admin/tpot/settings`
- `POST /api/admin/tpot/ai-analysis`
- `GET /api/admin/tpot/ai-analysis/:id`
- `POST /api/admin/tpot/ai-analysis/:id/audit`
- `POST /api/admin/tpot/ai-analysis/:id/approve`
- `POST /api/admin/tpot/ai-analysis/:id/reject`

### 4.2 `central-admin-app/tpotService.js`

Responsabilidades:

- Lee configuracion desde variables de entorno.
- Verifica salud del backend Elastic/OpenSearch.
- Consulta eventos del sensor.
- Normaliza campos heterogeneos.
- Sanitiza secretos y datos sensibles.
- Calcula resumenes.
- Extrae IOCs.
- Mapea eventos a MITRE ATT&CK de forma inicial.
- Genera reportes.
- Genera jobs IA.
- Audita resultados IA.
- Mantiene auditoria y jobs en memoria.

## 5. Variables de entorno

Configuracion principal:

```bash
TPOT_ELASTIC_URL=https://opensearch.example.com
TPOT_ELASTIC_USERNAME=tpot_reader
TPOT_ELASTIC_PASSWORD=change-me
TPOT_API_TOKEN=change-me
TPOT_VERIFY_TLS=true
TPOT_TIMEOUT_MS=8000
TPOT_ALLOWED_INDEXES=logstash-*,tpot-*,cowrie-*,suricata-*,dionaea-*
```

Configuracion IA:

```bash
AI_ANALYSIS_ENABLED=false
AI_PROVIDER=local
AI_MODEL=local-defensive-rules
AI_API_KEY=
AI_AUDIT_ENABLED=true
AI_AUDIT_MODEL=local-tpot-auditor
AI_MAX_LOG_RECORDS=120
AI_MAX_CONTEXT_TOKENS=6000
AI_OUTPUT_REQUIRES_APPROVAL=true
```

Configuracion del admin:

```bash
CENTRAL_ADMIN_USER=admin
CENTRAL_ADMIN_PASSWORD=change-me
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-side-only
```

Notas tecnicas:

- `TPOT_ELASTIC_URL` es el endpoint realmente usado para consultar eventos.
- `TPOT_API_BASE_URL` existe en configuracion, pero el codigo actual no implementa un cliente separado contra esa API.
- `TPOT_ALLOWED_INDEXES` limita que indices puede consultar el admin.
- `AI_OUTPUT_REQUIRES_APPROVAL=true` impide mostrar salida IA cruda antes de aprobacion.

## 6. Modo demo y modo live

### 6.1 Modo demo

Cuando no existen `TPOT_ELASTIC_URL` ni `TPOT_API_BASE_URL`, el servicio responde:

- `mode: demo`
- `connected: false`
- `status: not_configured`

En este modo usa eventos simulados para probar la UI:

- SSH brute force en Cowrie.
- Telnet login.
- Alerta Suricata tipo scan.
- Malware capture en Dionaea.
- HTTP fuzzing en Heralding.

Este modo no representa telemetria real.

### 6.2 Modo live

Cuando `TPOT_ELASTIC_URL` esta configurado:

- `getHealth()` hace `GET /` al endpoint Elastic/OpenSearch.
- `getEvents()` consulta `/{index}/_search`.
- Se usa `POST` con query DSL de Elastic.
- Se aplica timeout mediante `AbortController`.
- Se normalizan los hits de `payload.hits.hits`.

## 7. Consulta de eventos

### 7.1 Seleccion de indice

La funcion `sanitizeIndex()` valida el indice solicitado contra `allowedIndexes`.

Si el indice pedido no esta permitido:

- Se usa el primer indice permitido.
- Por defecto: `logstash-*`.

Esto reduce el riesgo de consulta arbitraria a indices no autorizados.

### 7.2 Query generada

La funcion `buildElasticQuery()` genera una busqueda con:

- `size`: limite de resultados.
- `sort`: `@timestamp desc`.
- `query`: `match_all` o `bool.must`.

Filtros soportados:

- `from` y `to` para rango de `@timestamp`.
- `source_ip` contra `source.ip`.
- `country` contra `source.geo.country_iso_code`.
- `port` contra `destination.port`.
- `protocol` contra `network.transport`.
- `q` como `query_string` sanitizado.

### 7.3 Limites

El limite maximo de pagina en logs es `MAX_PAGE_SIZE = 200`.

Para analisis IA, `AI_MAX_LOG_RECORDS` se fuerza entre 10 y 1000. Por defecto son 120 eventos.

## 8. Normalizacion de eventos

La funcion `normalizeEvent()` transforma formatos distintos de T-Pot/Elastic en un esquema comun:

```json
{
  "event_id": "string",
  "timestamp": "ISO date",
  "source_ip": "string",
  "source_country": "string",
  "source_asn": "string",
  "destination_port": 0,
  "protocol": "tcp",
  "honeypot": "cowrie",
  "event_type": "ssh_brute_force",
  "severity": "high",
  "username_attempted": "r***t",
  "password_attempted_masked": "len:8:sha256:...",
  "command": "sanitized command",
  "url": "sanitized url",
  "domain": "domain",
  "file_hash": "sha256/md5",
  "suricata_signature": "signature",
  "zeek_uid": "uid",
  "user_agent": "user agent",
  "raw_ref": "elastic id",
  "tags": []
}
```

Campos de entrada aceptados:

- IP origen: `source_ip`, `source.ip`, `src_ip`, `src_ip_addr`, `remote_host`, `client_ip`.
- Puerto destino: `destination_port`, `destination.port`, `dest_port`, `port`.
- Sensor: `honeypot`, `sensor`, `type`, `program`, `service`.
- Tipo de evento: `event.action`, `event_type`, `action`, `category`, `log_type`.
- Password: `password`, `pass`, `pwd`, `password_attempted`.
- Comando: `command`, `input`, `message`.

## 9. Sanitizacion y proteccion de datos

La sanitizacion se aplica antes de mostrar eventos y antes de alimentar IA.

### 9.1 Reglas de redaccion

`sanitizeText()` aplica:

- Emails -> `[email-redacted]`
- JWT -> `[jwt-redacted]`
- `api_key`, `token`, `secret`, `authorization`, `bearer` -> valor reemplazado por `***`
- `password`, `passwd`, `pwd` -> valor reemplazado por `***`
- Truncamiento por longitud maxima

### 9.2 Passwords capturados

Las credenciales intentadas no se muestran en claro.

`maskSecret()` genera:

```text
len:<longitud>:sha256:<primeros_12_hex>
```

Ejemplo:

```text
len:8:sha256:240be518fabd
```

Esto permite correlacionar intentos repetidos sin exponer la clave capturada.

### 9.3 Usuarios capturados

`maskUser()` conserva solo primer y ultimo caracter cuando aplica:

```text
admin -> a***n
root -> r***t
```

### 9.4 IOCs

Los indicadores se guardan/retornan en forma defensiva:

- `indicator_value_hash`: hash SHA-256 del valor real.
- `indicator_value_masked`: valor enmascarado o sanitizado.
- `frequency`: frecuencia observada.
- `first_seen`, `last_seen`: ventana temporal.
- `severity`: severidad maxima observada.
- `source_honeypot`: sensor de origen.

## 10. Resumenes y metricas

`getSummary()` construye:

- Total de eventos.
- Eventos por severidad.
- Eventos por honeypot.
- Top IPs origen.
- Top paises.
- Top puertos.
- Top protocolos.
- Top user-agents.
- Top credenciales intentadas enmascaradas.
- Hashes de malware.
- Eventos recientes.

Utilidad:

- Priorizar que sensores reciben mas actividad.
- Ver puertos mas atacados.
- Detectar fuentes repetidas.
- Identificar patrones de fuerza bruta, fuzzing, escaneo o payloads.
- Alimentar reportes para direccion o equipos tecnicos.

## 11. Extraccion de IOCs

`extractIocsFromEvents()` considera como candidatos:

- `ip`: IP origen.
- `domain`: dominio observado.
- `url`: URL observada.
- `hash`: hash de archivo.
- `port`: puerto destino.
- `payload`: comando o input capturado.
- `credential`: password enmascarado.

Cada IOC se agrupa por tipo y valor, se cuenta su frecuencia y se ordena de mayor a menor frecuencia.

Uso defensivo:

- Revisar IPs repetidas.
- Crear listas de observacion.
- Comparar dominios/URLs sospechosos.
- Alimentar controles de deteccion.
- Construir ejercicios educativos con evidencia real.

## 12. Mapeo MITRE ATT&CK

`mapMitre()` hace un mapeo inicial por reglas:

| Evidencia | Tactica | Tecnica | ID |
| --- | --- | --- | --- |
| SSH/Telnet/login/auth/brute | Credential Access | Brute Force | T1110 |
| scan/probe/fuzz | Reconnaissance | Active Scanning | T1595 |
| wget/curl | Command and Control | Ingress Tool Transfer | T1105 |
| sh/bash/cmd/powershell | Execution | Command and Scripting Interpreter | T1059 |

El mapeo no es una atribucion definitiva. Es una clasificacion defensiva basada en campos normalizados y debe validarse por analista.

## 13. Reportes

`getReport()` produce tres salidas:

### 13.1 Reporte ejecutivo

Incluye:

- Titulo.
- Resumen de riesgo.
- Hallazgos clave.
- Recomendaciones priorizadas.

Audiencia: directivos, administradores, responsables no tecnicos.

### 13.2 Reporte tecnico

Incluye:

- Resumen completo.
- IOCs.
- Mapeo MITRE.
- Limitaciones.

Audiencia: equipo tecnico, SOC, administradores de infraestructura.

### 13.3 Reporte educativo

Incluye:

- Objetivos de aprendizaje.
- Preguntas sugeridas.
- Recomendaciones defensivas.

Audiencia: Ciber Dojo, usuarios finales, capacitacion y katas.

## 14. Flujo IA

### 14.1 Creacion de job

`POST /api/admin/tpot/ai-analysis`:

1. Recibe filtros y opciones.
2. Consulta eventos.
3. Sanitiza eventos.
4. Crea job en memoria.
5. Registra auditoria en memoria.
6. Ejecuta analisis asincrono con `setTimeout`.

Estados posibles:

- `pending`
- `running`
- `audited`
- `approved`
- `rejected`
- `failed`

### 14.2 Analisis local

Si `AI_ANALYSIS_ENABLED=false` o no existe `AI_API_KEY`, se usa `localThreatAnalysis()`.

Este analisis calcula:

- Cantidad de eventos.
- Conteo de autenticaciones/fuerza bruta.
- Conteo de `wget`/`curl`.
- Severidad estimada.
- IOCs.
- MITRE.
- Timeline.
- Evidencia.
- Recomendaciones defensivas.
- Casos educativos.

### 14.3 Proveedor IA externo

`callAiProvider()` existe como placeholder defensivo. Actualmente no llama a un proveedor externo real; devuelve analisis local agregando nota de proveedor/modelo.

### 14.4 Auditoria IA

`localAudit()` revisa la salida IA:

- Busca passwords o credenciales sin enmascarar.
- Busca API keys, secrets, tokens o bearer tokens.
- Detecta contenido ofensivo accionable como reverse shell o instrucciones de explotacion.
- Redacta nuevamente con `redactDeep()`.

Si la auditoria falla:

- `audit_status = needs_revision`
- `approved_for_display = false`
- El job puede quedar `rejected`

Si la auditoria aprueba:

- `audit_status = approved`
- El job pasa a `audited` si requiere aprobacion humana.
- El job pasa a `approved` si no requiere aprobacion humana.

### 14.5 Ocultamiento de salida

Si `AI_OUTPUT_REQUIRES_APPROVAL=true`, `getAiAnalysisJob()` oculta:

- `raw_ai_output`
- `audited_output`

hasta que el job este aprobado.

## 15. Auditoria operacional

El servicio registra auditoria en memoria con:

- Usuario/actor.
- Accion.
- Filtros.
- Cantidad de registros.
- Estado.
- Metadata.
- Fecha.

Acciones auditadas:

- `tpot:summary`
- `tpot:logs`
- `tpot:report`
- `tpot:iocs`
- `ai-analysis:create`
- `ai-analysis:audit`
- `ai-analysis:approve`
- `ai-analysis:reject`
- `settings:update-requested`

Limitacion actual: la auditoria esta en memoria. Se pierde al reiniciar el proceso. Existen tablas en Supabase preparadas por `013_tpot_integration.sql`, pero el servicio Node actual no las usa como persistencia.

## 16. Seguridad recomendada del sensor

### 16.1 Aislamiento

El T-Pot real debe ejecutarse:

- En una VM o host separado.
- Fuera de la red productiva.
- Sin acceso a bases productivas.
- Sin secretos de Ciber Dojo.
- Con administracion limitada a VPN, IP allowlist o bastion.

### 16.2 Exposicion controlada

Los honeypots pueden exponerse a internet para capturar actividad, pero:

- La administracion de T-Pot no debe estar expuesta publicamente.
- Kibana/Elastic/OpenSearch no deben quedar abiertos sin autenticacion fuerte.
- El acceso desde Central Admin debe usar usuario lector de solo lectura.
- Los indices permitidos deben restringirse con `TPOT_ALLOWED_INDEXES`.

### 16.3 TLS y credenciales

Recomendaciones:

- TLS 1.2+.
- Certificado valido.
- Rotacion periodica de credenciales.
- Usuario dedicado de solo lectura.
- Secretos en Cloud Run env vars o secret manager.
- Nunca guardar credenciales T-Pot en JS ni en repositorio.

## 17. Utilidad para Shield Ecuador / Ciber Dojo

### 17.1 Inteligencia defensiva

Permite ver que tipos de ataques llegan a servicios expuestos:

- Fuerza bruta.
- Escaneo de puertos.
- Fuzzing HTTP.
- Payloads de descarga.
- Intentos contra SMB, SSH, Telnet u otros servicios.

### 17.2 Priorizacion de controles

Ayuda a decidir:

- Que puertos son mas atacados.
- Que credenciales debiles se repiten.
- Que paises/IPs aparecen con mayor frecuencia.
- Que sensores reciben mas actividad.
- Que patrones requieren alerta o capacitacion.

### 17.3 Material educativo

Convierte eventos reales en:

- Preguntas para usuarios.
- Katas de respuesta.
- Ejemplos de phishing, fuerza bruta o escaneo.
- Recomendaciones en lenguaje simple.
- Reportes ejecutivos para concientizacion.

### 17.4 Validacion de postura

No reemplaza un pentest, pero ayuda a validar exposicion y tendencias:

- Si se observan muchos intentos SSH, reforzar MFA, llaves y bloqueo de password auth.
- Si se observan payloads `wget`/`curl`, revisar hardening de servidores expuestos.
- Si se observan escaneos web, reforzar WAF, headers, parches y monitoreo.

## 18. Limitaciones tecnicas

- No bloquea trafico.
- No modifica firewalls.
- No explota vulnerabilidades.
- No confirma compromiso de sistemas productivos.
- No atribuye atacantes con certeza.
- No guarda auditoria T-Pot persistente en el estado actual.
- No usa realmente `TPOT_API_BASE_URL` para consultas.
- No implementa proveedor IA externo real en `callAiProvider()`.
- Depende de la calidad de los campos que entregue Elastic/OpenSearch.
- El mapeo MITRE es aproximado por reglas.

## 19. Procedimiento operativo recomendado

### 19.1 Revision diaria

1. Abrir Central Admin.
2. Ir a Inteligencia de Amenazas.
3. Revisar `health`.
4. Revisar dashboard de ultimas 24 horas.
5. Ver top IPs, puertos y sensores.
6. Revisar eventos criticos o altos.
7. Extraer IOCs relevantes.
8. Generar reporte ejecutivo si hay actividad significativa.

### 19.2 Revision semanal

1. Comparar tendencias por sensor y puerto.
2. Revisar credenciales intentadas enmascaradas.
3. Revisar cambios en origenes frecuentes.
4. Convertir patrones en katas.
5. Validar que no haya datos sensibles sin redactar.
6. Rotar o revisar credenciales si corresponde.

### 19.3 Ante actividad critica

1. Confirmar evento en logs.
2. Validar si el evento pertenece solo al honeypot.
3. Comparar IOC contra sistemas productivos.
4. No ejecutar payloads capturados.
5. Crear reporte tecnico.
6. Revisar controles preventivos.
7. Documentar leccion aprendida para Ciber Dojo.

## 20. Troubleshooting

### `not_configured`

Causa probable:

- Falta `TPOT_ELASTIC_URL`.

Accion:

- Configurar URL de Elastic/OpenSearch.
- Validar secretos.
- Reiniciar despliegue si aplica.

### `disconnected`

Causa probable:

- Firewall bloquea.
- TLS invalido.
- Credenciales incorrectas.
- Endpoint caido.

Accion:

- Probar conectividad desde el entorno del admin.
- Revisar usuario/password o token.
- Validar allowlist.

### `T-Pot integration request failed`

Causa probable:

- Error consultando indice.
- Indice no permitido.
- Query incompatible con el backend.
- Timeout.

Accion:

- Revisar `TPOT_ALLOWED_INDEXES`.
- Consultar `/api/admin/tpot/health`.
- Reducir rango o limite.
- Verificar logs del admin.

### Sin eventos

Causa probable:

- Rango temporal sin actividad.
- Filtros demasiado restrictivos.
- Sensor no esta enviando eventos.
- Indice incorrecto.

Accion:

- Quitar filtros.
- Ampliar rango de fechas.
- Verificar indices en Elastic/OpenSearch.
- Validar ingestion T-Pot.

## 21. Checklist de produccion

- [ ] T-Pot instalado fuera de Cloud Run.
- [ ] T-Pot aislado de red productiva.
- [ ] Elastic/OpenSearch no expuesto publicamente.
- [ ] Usuario lector de solo lectura.
- [ ] `TPOT_ALLOWED_INDEXES` restringido.
- [ ] TLS habilitado y validado.
- [ ] Secretos fuera del repositorio.
- [ ] Central Admin protegido con MFA/IAP/VPN o allowlist.
- [ ] `AI_OUTPUT_REQUIRES_APPROVAL=true`.
- [ ] Auditoria persistente implementada o exportada.
- [ ] Reportes revisados para evitar datos sensibles.

## 22. Dictamen tecnico

El sensor aporta valor como fuente de inteligencia defensiva y educativa. Su mayor utilidad no es bloquear ataques, sino observar patrones reales, generar evidencia, priorizar controles y alimentar entrenamientos de Ciber Dojo.

La implementacion actual de Shield Ecuador esta correctamente orientada a una arquitectura desacoplada: T-Pot captura en una infraestructura separada y Central Admin consume datos sanitizados. Para elevarlo a produccion madura, faltan principalmente persistencia de auditoria T-Pot, proteccion fuerte del admin y endurecimiento operativo del entorno donde corre el T-Pot real.
