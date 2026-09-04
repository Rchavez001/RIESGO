# Integracion T-Pot para CiberDojo Admin

## Arquitectura

T-Pot no se instala dentro de Cloud Run ni dentro del contenedor productivo de CiberDojo.
La arquitectura implementada es desacoplada:

```text
CiberDojo Admin
  -> /api/admin/tpot/*
  -> Backend Node protegido por Basic Auth / Cloud Run
  -> API segura T-Pot / Elasticsearch / OpenSearch externo
  -> Normalizador defensivo
  -> Sanitizador
  -> Agente IA TpotThreatAnalysisAgent
  -> Agente auditor TpotAiAuditAgent
  -> Resultado aprobado para UI
```

Si `TPOT_ELASTIC_URL` no esta configurado, el panel muestra datos demo defensivos para validar UI sin conectar sensores reales.

## Instalacion recomendada de T-Pot

- Instalar T-Pot en VM aislada, nunca en Cloud Run.
- Separar red honeypot de red productiva.
- No montar secretos productivos.
- Restringir Elasticsearch/OpenSearch a IPs autorizadas o VPN/API Gateway.
- TLS obligatorio con certificado valido.
- Usuario de solo lectura para indices permitidos.
- No exponer Kibana publicamente salvo autenticacion independiente fuerte.

## Variables de entorno

En Cloud Run del Admin:

```bash
TPOT_API_BASE_URL=
TPOT_ELASTIC_URL=
TPOT_ELASTIC_USERNAME=
TPOT_ELASTIC_PASSWORD=
TPOT_API_TOKEN=
TPOT_VERIFY_TLS=true
TPOT_TIMEOUT_MS=8000
TPOT_ALLOWED_INDEXES=logstash-*,tpot-*,cowrie-*,suricata-*,dionaea-*
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

## Endpoints internos

Todos protegidos por el acceso del Admin:

- `GET /api/admin/tpot/health`
- `GET /api/admin/tpot/summary`
- `GET /api/admin/tpot/logs`
- `GET /api/admin/tpot/reports`
- `GET /api/admin/tpot/iocs`
- `POST /api/admin/tpot/ai-analysis`
- `GET /api/admin/tpot/ai-analysis/:id`
- `POST /api/admin/tpot/ai-analysis/:id/audit`
- `POST /api/admin/tpot/ai-analysis/:id/approve`
- `POST /api/admin/tpot/ai-analysis/:id/reject`
- `GET /api/admin/tpot/audit-log`
- `GET /api/admin/tpot/settings`
- `PUT /api/admin/tpot/settings`

## Seguridad

- No hay ejecucion remota de comandos contra T-Pot.
- No hay acciones destructivas sobre indices.
- Los secretos solo viven en variables de entorno del servidor.
- Logs se normalizan y sanitizan antes de UI/IA.
- Credenciales capturadas se muestran como longitud + hash.
- Correos, tokens, JWT y secretos se redactan.
- Rate limiting basico por ruta/IP.
- Auditoria en memoria y tablas Supabase preparadas por `013_tpot_integration.sql`.

## Uso UI

En Admin abrir `Inteligencia de Amenazas`:

1. Dashboard: KPIs ejecutivos, sensores, IOCs, eventos recientes y drill-down.
2. Alertas: logs normalizados, filtros y detalle tecnico de eventos.
3. Analisis IA: unica entrada visible para generar, auditar, aprobar y publicar analisis.
4. Reportes: ejecutivo, tecnico, educativo e historial aprobado.
5. Configuracion: T-Pot, agente multimodal, IA auditora, flujo de aprobacion e integraciones.

La auditoria IA ya no se muestra como opcion principal separada. Es parte del flujo de `Analisis IA`. El boton `Probar conexion` se ubica en `Configuracion > Integraciones`.

Regla funcional: ningun resultado de IA se considera final ni publicable hasta pasar por auditoria automatica y la aprobacion requerida.

## Troubleshooting

- `not_configured`: falta `TPOT_ELASTIC_URL`.
- `disconnected`: revisar firewall, TLS, credenciales y allowlist.
- `T-Pot integration request failed`: revisar formato de indices y permisos de lectura.
- Sin resultados: verificar `TPOT_ALLOWED_INDEXES` y rango temporal.
