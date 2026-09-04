# Agentes IA T-Pot

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

Antes de enviar a IA:

- `password`, `pass`, `pwd` -> `***` o `len/hash`;
- tokens, API keys, JWT -> `[redacted]`;
- correos -> `[email-redacted]`;
- payloads largos -> truncados;
- binarios completos -> excluidos;
- PCAP -> no se envia, solo metadatos.

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

Si `approved_for_display=false`, la UI no muestra `raw_ai_output`.

## MITRE inicial

- SSH/Telnet brute force -> Credential Access / Brute Force / T1110.
- Port scanning -> Reconnaissance / Active Scanning / T1595.
- `wget`/`curl` -> Command and Control / Ingress Tool Transfer / T1105.
- shell commands -> Execution / Command and Scripting Interpreter / T1059.

Si no hay certeza, `technique_id` debe ser `null` y la justificacion debe explicar la limitacion.
