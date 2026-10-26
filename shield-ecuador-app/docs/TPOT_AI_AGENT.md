# Agentes IA T-Pot

Nota de implementacion: el codigo no define clases ni modulos llamados `TpotThreatAnalysisAgent`
o `TpotAiAuditAgent`. Son nombres conceptuales para dos funciones de
`central-admin-app/tpotService.js`: `localThreatAnalysis()` (agente de analisis, invocada por
`runAiJob()`) y `localAudit()` (agente auditor, invocada por `runAiJob()` y por `auditAiAnalysis()`).
Ninguna de las dos llama hoy a un modelo de IA externo: `callAiProvider()` es un placeholder
defensivo que delega directo en `localThreatAnalysis()` sin importar `AI_PROVIDER`/`AI_API_KEY`
(`central-admin-app/tpotService.js`, comentario "Defensive placeholder"); el propio endpoint de
configuracion lo reporta como `analysis_engine: "reglas_locales"` (`getSettings()`). El analisis es
hoy reglas locales sobre los eventos normalizados, no un modelo generativo.

## TpotThreatAnalysisAgent

Agente defensivo para analizar eventos honeypot normalizados y sanitizados.

Capacidades:

- resumen ejecutivo;
- forensica tecnica;
- extraccion de IOCs;
- mapeo MITRE ATT&CK por reglas iniciales;
- deteccion de fuerza bruta, escaneo, payloads sospechosos y comandos capturados;
- reportes educativos CiberDojo;
- recomendaciones defensivas.

Salida estructurada:

```json
{
  "analysis_type": "executive_summary",
  "executive_summary": "",
  "technical_summary": "",
  "key_findings": [],
  "attack_patterns": [],
  "iocs": [],
  "mitre_attack_mapping": [],
  "timeline": [],
  "severity": "low",
  "confidence": 0.0,
  "evidence": [],
  "recommended_defensive_actions": [],
  "educational_use_cases": [],
  "limitations": [],
  "requires_human_review": true
}
```

## Sanitizacion previa

Antes de enviar a IA (funciones `sanitizeText()`/`maskSecret()`/`sanitizeRecord()` en
`central-admin-app/tpotService.js`):

- `password`, `pass`, `pwd` -> `***` o `len:<n>:sha256:<hash-corto>` (`maskSecret()`, usado en el
  campo `password_attempted_masked`);
- `token`/`api_key`/`secret`/`authorization`/`bearer` -> se reemplazan por `<nombre>=***`
  (no literalmente `[redacted]`); un JWT (`eyJ...`) se reemplaza por `[jwt-redacted]`;
- correos -> `[email-redacted]`;
- payloads largos -> truncados (`sanitizeText()` recorta cada campo a un largo maximo propio,
  p. ej. 500 caracteres para `command`, 1000 por defecto);
- binarios completos y capturas PCAP -> nunca se leen ni se reenvian: `normalizeEvent()` solo
  extrae un conjunto fijo de campos de texto/numero del evento (IP, puerto, protocolo, comando,
  usuario, hash, etc.); no existe ningun campo ni ruta de codigo que adjunte un binario o un PCAP
  completo al analisis.

## TpotAiAuditAgent

Audita todo resultado antes de mostrarlo:

- busca secretos o credenciales completas;
- bloquea instrucciones ofensivas accionables;
- verifica evidencia;
- separa hechos, inferencias y recomendaciones;
- exige confianza y limitaciones;
- valida que IOCs provengan de eventos observados.

Salida:

```json
{
  "audit_status": "approved",
  "risk_level": "low",
  "policy_findings": [],
  "data_leakage_findings": [],
  "unsupported_claims": [],
  "offensive_content_findings": [],
  "required_redactions": [],
  "corrected_safe_output": {},
  "audit_notes": "",
  "approved_for_display": false
}
```

Flujo real de estados del job (`tpotService.js`): `pending` -> `running` -> (segun
`localAudit()`) `audited` si `approved_for_display=true`, o `rejected` si es `false`. Un job
`audited` solo pasa a `approved` con una llamada humana explicita a `approveAiAnalysis()`
(`conflict()` bloquea aprobar cualquier otro estado). `getAiAnalysisJob()` solo devuelve
`raw_ai_output`/`audited_output` cuando `job.status === "approved"` (si `AI_OUTPUT_REQUIRES_APPROVAL`
esta en `false`, un job `audited` pasa a `approved` automaticamente sin aprobacion humana; el valor
por defecto de esa variable es `true`).

## MITRE inicial

- SSH/Telnet brute force -> Credential Access / Brute Force / T1110.
- Port scanning -> Reconnaissance / Active Scanning / T1595.
- `wget`/`curl` -> Command and Control / Ingress Tool Transfer / T1105.
- shell commands -> Execution / Command and Scripting Interpreter / T1059.

El codigo actual de `mapMitre()` no tiene una rama que produzca `technique_id: null`: cada una de
las cuatro reglas anteriores, si encuentra al menos un evento que calza su expresion regular, agrega
el mapeo con un `technique_id` y una `confidence` fijos (0.78/0.66/0.7/0.62 respectivamente); si
ningun evento calza, esa regla simplemente no agrega nada a `mitre_attack_mapping` (no agrega una
entrada con `technique_id: null`). No existe hoy un mecanismo de "incertidumbre explicita" mas alla
de confiar en que, si una regla no calza, no aparece en la lista.
