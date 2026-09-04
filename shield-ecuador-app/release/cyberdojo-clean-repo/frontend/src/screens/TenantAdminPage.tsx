import React, { useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  Database,
  FileQuestion,
  Gauge,
  KeyRound,
  Play,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react'

type TenantStatus = 'activo' | 'revision' | 'suspendido'

interface Tenant {
  id: string
  name: string
  slug: string
  plan: 'Starter' | 'Pro' | 'Enterprise'
  status: TenantStatus
  users: number
  baseQuestionsPerDojo: number
  aiQuestionsPerDojo: number
  activeDojoCount: number
  auditorProvider: string
  generatorProvider: string
  lastRun: string
}

const initialTenants: Tenant[] = [
  {
    id: 'tenant-manta-market',
    name: 'Manta Market',
    slug: 'manta-market',
    plan: 'Pro',
    status: 'activo',
    users: 42,
    baseQuestionsPerDojo: 10,
    aiQuestionsPerDojo: 10,
    activeDojoCount: 8,
    auditorProvider: 'Claude',
    generatorProvider: 'DeepSeek',
    lastRun: '2026-05-10 07:30',
  },
  {
    id: 'tenant-andes-tech',
    name: 'Andes Tech',
    slug: 'andes-tech',
    plan: 'Enterprise',
    status: 'revision',
    users: 118,
    baseQuestionsPerDojo: 10,
    aiQuestionsPerDojo: 10,
    activeDojoCount: 12,
    auditorProvider: 'Claude',
    generatorProvider: 'Kimi',
    lastRun: '2026-05-10 06:58',
  },
  {
    id: 'tenant-cafe-loja',
    name: 'Cafe Loja',
    slug: 'cafe-loja',
    plan: 'Starter',
    status: 'activo',
    users: 12,
    baseQuestionsPerDojo: 10,
    aiQuestionsPerDojo: 6,
    activeDojoCount: 5,
    auditorProvider: 'DeepSeek',
    generatorProvider: 'DeepSeek',
    lastRun: '2026-05-09 19:12',
  },
]

const basePrompt = `Genera exactamente 10 preguntas base por dojo para una PYME ecuatoriana.
Cada pregunta debe alinearse a ISO 27001, tener lenguaje simple, 4 opciones, puntaje de riesgo y explicacion educativa.
No repitas preguntas existentes. Devuelve JSON estricto.`

const auditPrompt = `Audita preguntas generadas por IA para Ciber Dojo.
Aprueba solo preguntas claras, accionables, sin ambiguedad, alineadas a ISO 27001 y utiles para PYMEs ecuatorianas.
Devuelve JSON estricto con question_id, status approved|rejected, notes y suggested_improvement.`

export function TenantAdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants)
  const [selectedTenantId, setSelectedTenantId] = useState(initialTenants[0].id)
  const [generatorPrompt, setGeneratorPrompt] = useState(basePrompt)
  const [auditorPrompt, setAuditorPrompt] = useState(auditPrompt)
  const [message, setMessage] = useState('')

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0],
    [selectedTenantId, tenants]
  )

  const totals = useMemo(() => ({
    tenants: tenants.length,
    users: tenants.reduce((sum, tenant) => sum + tenant.users, 0),
    baseQuestions: tenants.reduce((sum, tenant) => sum + tenant.activeDojoCount * tenant.baseQuestionsPerDojo, 0),
    aiQuestions: tenants.reduce((sum, tenant) => sum + tenant.activeDojoCount * tenant.aiQuestionsPerDojo, 0),
  }), [tenants])

  function updateSelectedTenant(patch: Partial<Tenant>) {
    setTenants((current) => current.map((tenant) => (
      tenant.id === selectedTenant.id ? { ...tenant, ...patch } : tenant
    )))
  }

  function saveTenantConfig() {
    setMessage(`Configuracion guardada para ${selectedTenant.name}. En integracion backend, esto debe persistir en tabla tenants/tenant_ai_configs.`)
  }

  function runGeneration() {
    setMessage(`Solicitud lista: generar ${selectedTenant.aiQuestionsPerDojo} preguntas IA por dojo para ${selectedTenant.name} usando ${selectedTenant.generatorProvider}.`)
  }

  function runAudit() {
    setMessage(`Solicitud lista: auditar preguntas generadas de ${selectedTenant.name} usando ${selectedTenant.auditorProvider}.`)
  }

  return (
    <div className="tenant-admin">
      <aside className="tenant-rail">
        <div className="tenant-brand">
          <span>CD</span>
          <div>
            <strong>Ciber Dojo</strong>
            <em>Tenant Command</em>
          </div>
        </div>

        <nav className="tenant-nav">
          {[
            [Building2, 'Inquilinos'],
            [FileQuestion, 'Preguntas'],
            [Bot, 'IA y Auditoria'],
            [Database, 'Base de datos'],
            [ShieldCheck, 'Seguridad'],
          ].map(([Icon, label]) => {
            const TypedIcon = Icon as typeof Building2
            return (
              <button key={String(label)}>
                <TypedIcon size={17} />
                {label as string}
              </button>
            )
          })}
        </nav>

        <div className="tenant-rail-note">
          <KeyRound size={16} />
          <p>Front separado para administracion SaaS multi-tenant. No es el dojo del usuario final.</p>
        </div>
      </aside>

      <main className="tenant-workspace">
        <header className="tenant-header">
          <div>
            <p>ADMINISTRADOR CENTRAL DE INQUILINOS</p>
            <h1>Operaciones SaaS · Tenants</h1>
          </div>
          <div className="tenant-header-actions">
            <button onClick={runGeneration}>
              <Play size={16} />
              Generar preguntas IA
            </button>
            <button onClick={saveTenantConfig} className="primary">
              <Save size={16} />
              Guardar cambios
            </button>
          </div>
        </header>

        {message && (
          <div className="tenant-message">
            <CheckCircle2 size={18} />
            {message}
          </div>
        )}

        <section className="tenant-metrics">
          <Metric icon={<Building2 size={18} />} label="Inquilinos" value={String(totals.tenants)} />
          <Metric icon={<Users size={18} />} label="Usuarios gestionados" value={String(totals.users)} />
          <Metric icon={<FileQuestion size={18} />} label="Preguntas base" value={String(totals.baseQuestions)} />
          <Metric icon={<Bot size={18} />} label="Preguntas IA objetivo" value={String(totals.aiQuestions)} />
        </section>

        <section className="tenant-layout">
          <div className="tenant-list-panel">
            <div className="tenant-panel-head">
              <div>
                <p>DIRECTORIO</p>
                <h2>Inquilinos</h2>
              </div>
              <button>Nuevo</button>
            </div>

            <div className="tenant-list">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  className={tenant.id === selectedTenant.id ? 'active' : ''}
                  onClick={() => setSelectedTenantId(tenant.id)}
                >
                  <div>
                    <strong>{tenant.name}</strong>
                    <span>{tenant.slug} · {tenant.plan}</span>
                  </div>
                  <span className={`tenant-status ${tenant.status}`}>{tenant.status}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </div>

          <div className="tenant-config-panel">
            <div className="tenant-panel-head">
              <div>
                <p>CONFIGURACION DEL INQUILINO</p>
                <h2>{selectedTenant.name}</h2>
              </div>
              <span className={`tenant-status ${selectedTenant.status}`}>{selectedTenant.status}</span>
            </div>

            <div className="tenant-form-grid">
              <TenantField label="Nombre del inquilino">
                <input value={selectedTenant.name} onChange={(event) => updateSelectedTenant({ name: event.target.value })} />
              </TenantField>
              <TenantField label="Slug">
                <input value={selectedTenant.slug} onChange={(event) => updateSelectedTenant({ slug: event.target.value })} />
              </TenantField>
              <TenantField label="Plan">
                <select value={selectedTenant.plan} onChange={(event) => updateSelectedTenant({ plan: event.target.value as Tenant['plan'] })}>
                  <option>Starter</option>
                  <option>Pro</option>
                  <option>Enterprise</option>
                </select>
              </TenantField>
              <TenantField label="Estado">
                <select value={selectedTenant.status} onChange={(event) => updateSelectedTenant({ status: event.target.value as TenantStatus })}>
                  <option value="activo">Activo</option>
                  <option value="revision">Revision</option>
                  <option value="suspendido">Suspendido</option>
                </select>
              </TenantField>
            </div>

            <div className="tenant-rules">
              <div>
                <div className="tenant-rule-icon"><FileQuestion size={19} /></div>
                <TenantField label="Preguntas base por dojo">
                  <input
                    type="number"
                    value={selectedTenant.baseQuestionsPerDojo}
                    onChange={(event) => updateSelectedTenant({ baseQuestionsPerDojo: Number(event.target.value) || 10 })}
                  />
                </TenantField>
              </div>
              <div>
                <div className="tenant-rule-icon"><Bot size={19} /></div>
                <TenantField label="Preguntas generadas por IA por dojo">
                  <input
                    type="number"
                    value={selectedTenant.aiQuestionsPerDojo}
                    onChange={(event) => updateSelectedTenant({ aiQuestionsPerDojo: Number(event.target.value) || 10 })}
                  />
                </TenantField>
              </div>
              <div>
                <div className="tenant-rule-icon"><Gauge size={19} /></div>
                <TenantField label="Dojos activos">
                  <input
                    type="number"
                    value={selectedTenant.activeDojoCount}
                    onChange={(event) => updateSelectedTenant({ activeDojoCount: Number(event.target.value) || 1 })}
                  />
                </TenantField>
              </div>
            </div>

            <div className="tenant-ai-grid">
              <div className="tenant-ai-card">
                <div className="tenant-card-title">
                  <Bot size={18} />
                  <div>
                    <p>GENERADOR</p>
                    <h3>IA que crea preguntas</h3>
                  </div>
                </div>
                <TenantField label="Proveedor generador">
                  <select value={selectedTenant.generatorProvider} onChange={(event) => updateSelectedTenant({ generatorProvider: event.target.value })}>
                    <option>DeepSeek</option>
                    <option>Kimi</option>
                    <option>Claude</option>
                  </select>
                </TenantField>
                <TenantField label="Prompt de generacion">
                  <textarea rows={8} value={generatorPrompt} onChange={(event) => setGeneratorPrompt(event.target.value)} />
                </TenantField>
                <button className="tenant-action" onClick={runGeneration}>
                  <Play size={16} />
                  Ejecutar generacion
                </button>
              </div>

              <div className="tenant-ai-card">
                <div className="tenant-card-title">
                  <ShieldCheck size={18} />
                  <div>
                    <p>AUDITOR</p>
                    <h3>IA que revisa preguntas</h3>
                  </div>
                </div>
                <TenantField label="Proveedor auditor">
                  <select value={selectedTenant.auditorProvider} onChange={(event) => updateSelectedTenant({ auditorProvider: event.target.value })}>
                    <option>Claude</option>
                    <option>DeepSeek</option>
                    <option>Kimi</option>
                  </select>
                </TenantField>
                <TenantField label="Prompt de auditoria">
                  <textarea rows={8} value={auditorPrompt} onChange={(event) => setAuditorPrompt(event.target.value)} />
                </TenantField>
                <button className="tenant-action" onClick={runAudit}>
                  <ShieldCheck size={16} />
                  Ejecutar auditoria
                </button>
              </div>
            </div>
          </div>

          <aside className="tenant-side-panel">
            <div className="tenant-panel-head">
              <div>
                <p>ESTADO</p>
                <h2>Resumen</h2>
              </div>
              <Activity size={18} />
            </div>
            <div className="tenant-summary">
              <SummaryRow label="Usuarios" value={String(selectedTenant.users)} />
              <SummaryRow label="Dojos activos" value={String(selectedTenant.activeDojoCount)} />
              <SummaryRow label="Base por dojo" value={String(selectedTenant.baseQuestionsPerDojo)} />
              <SummaryRow label="IA por dojo" value={String(selectedTenant.aiQuestionsPerDojo)} />
              <SummaryRow label="Total base" value={String(selectedTenant.activeDojoCount * selectedTenant.baseQuestionsPerDojo)} />
              <SummaryRow label="Total IA" value={String(selectedTenant.activeDojoCount * selectedTenant.aiQuestionsPerDojo)} />
              <SummaryRow label="Ultima corrida" value={selectedTenant.lastRun} />
            </div>

            <div className="tenant-checklist">
              <h3><SlidersHorizontal size={17} /> Checklist operativo</h3>
              {[
                '10 preguntas base por dojo',
                '10 preguntas IA por dojo',
                'Prompt generador configurado',
                'Prompt auditor configurado',
                'Proveedor auditor asignado',
              ].map((item) => (
                <label key={item}>
                  <input type="checkbox" defaultChecked />
                  {item}
                </label>
              ))}
            </div>

            <button className="tenant-save-wide" onClick={saveTenantConfig}>
              <Settings2 size={16} />
              Publicar configuracion
            </button>
          </aside>
        </section>
      </main>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="tenant-metric">
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function TenantField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="tenant-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="tenant-summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
