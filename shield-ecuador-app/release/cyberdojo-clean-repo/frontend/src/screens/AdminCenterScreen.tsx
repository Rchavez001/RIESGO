import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, UserProfile, AIProvider, AgentConfig, IncidentInvestigation, QuestionRecord, AgentRun, AIAuditCorrectionReport, BusinessSector } from '../lib/supabase'
import { Shield, Activity, Bot, Brain, AlertTriangle, Save, Play, ArrowLeft, RefreshCcw } from 'lucide-react'
import './admin-tw-compat.css'

interface AdminCenterScreenProps {
  currentUser: UserProfile | null
  onBackToApp: () => void
}

interface AdminStats {
  totalUsers: number
  evaluatedUsers: number
  highRiskUsers: number
  completedKatas: number
  incidents: number
  pendingAuditQuestions: number
}

const EMPTY_STATS: AdminStats = {
  totalUsers: 0,
  evaluatedUsers: 0,
  highRiskUsers: 0,
  completedKatas: 0,
  incidents: 0,
  pendingAuditQuestions: 0,
}

const DEFAULT_QUESTION = {
  id: '',
  branch: 'C',
  order_num: 1,
  iso_control: 'A.6.1',
  question_text: '',
  question_type: 'unica_opcion',
  options: JSON.stringify([
    {
      valor: 'A',
      texto: 'Si',
      puntaje_riesgo: 0,
      siguiente_pregunta: 'FIN',
      explicacion_para_usuario: 'Respuesta segura.'
    },
    {
      valor: 'B',
      texto: 'No',
      puntaje_riesgo: 5,
      siguiente_pregunta: 'FIN',
      explicacion_para_usuario: 'Debes corregir este riesgo.'
    }
  ], null, 2),
  active: true,
}

function getNumberSetting(config: AgentConfig, key: string, fallback: number) {
  const value = config.extra_settings?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function getBooleanSetting(config: AgentConfig, key: string, fallback: boolean) {
  const value = config.extra_settings?.[key]
  return typeof value === 'boolean' ? value : fallback
}

const VALID_TABS = ['dashboard', 'questions', 'sectors', 'agents', 'providers', 'incidents', 'audit-report'] as const
type AdminTab = typeof VALID_TABS[number]

export function AdminCenterScreen({ currentUser, onBackToApp }: AdminCenterScreenProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') ?? ''
  const activeTab: AdminTab = VALID_TABS.includes(tabParam as AdminTab) ? (tabParam as AdminTab) : 'dashboard'
  function setActiveTab(tab: AdminTab) { setSearchParams({ tab }) }
  const [stats, setStats] = useState<AdminStats>(EMPTY_STATS)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [questions, setQuestions] = useState<QuestionRecord[]>([])
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([])
  const [agentAssignments, setAgentAssignments] = useState<Record<string, string[]>>({})
  const [incidents, setIncidents] = useState<IncidentInvestigation[]>([])
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [auditCorrections, setAuditCorrections] = useState<AIAuditCorrectionReport[]>([])
  const [businessSectors, setBusinessSectors] = useState<BusinessSector[]>([])
  const [sectorOriginalCode, setSectorOriginalCode] = useState('')
  const [sectorForm, setSectorForm] = useState<BusinessSector>({
    code: '',
    label: '',
    active: true,
    display_order: 100,
  })
  const [questionForm, setQuestionForm] = useState(DEFAULT_QUESTION)
  const [providerForm, setProviderForm] = useState<AIProvider>({
    provider_key: '',
    label: '',
    provider_type: 'chat_completion',
    model_name: '',
    purpose: '',
    active: true,
    created_at: new Date().toISOString(),
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    if (isAdmin) {
      void loadAdminData()
    }
  }, [isAdmin])

  const AGENT_FUNCTION_MAP: Record<string, string> = {
    'incident-investigator': 'run-incident-investigator',
    'question-auditor': 'audit-generated-questions',
  }

  const latestRuns = useMemo(() => agentRuns.slice(0, 6), [agentRuns])

  const lastRunByAgentConfig = useMemo(() => {
    const map: Record<string, AgentRun> = {}
    for (const run of agentRuns) {
      if (run.agent_config_id && !map[run.agent_config_id]) {
        map[run.agent_config_id] = run
      }
    }
    return map
  }, [agentRuns])

  async function loadAdminData() {
    setLoading(true)
    setMessage('')

    const [
      totalUsersResult,
      evaluatedUsersResult,
      highRiskUsersResult,
      completedKatasResult,
      incidentsResult,
      pendingQuestionsResult,
      usersResult,
      questionsResult,
      providersResult,
      agentConfigsResult,
      assignmentsResult,
      investigationsResult,
      agentRunsResult,
      auditCorrectionsResult,
      sectorsResult,
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).not('last_evaluation_at', 'is', null),
      supabase.from('users').select('*', { count: 'exact', head: true }).in('current_risk_level', ['alto', 'critico']),
      supabase.from('kata_completions').select('*', { count: 'exact', head: true }),
      supabase.from('incident_investigations').select('*', { count: 'exact', head: true }),
      supabase.from('questions').select('*', { count: 'exact', head: true }).eq('audit_status', 'pending'),
      supabase.from('users').select('*').order('created_at', { ascending: false }).limit(8),
      supabase.from('questions').select('*').order('created_at', { ascending: false }).limit(25),
      supabase.from('ai_providers').select('*').order('provider_key'),
      supabase.from('agent_configs').select('*').order('agent_code'),
      supabase.from('agent_provider_assignments').select('*').eq('active', true).order('priority'),
      supabase.from('incident_investigations').select('*').order('incident_date', { ascending: false }).limit(12),
      supabase.from('agent_runs').select('*').order('started_at', { ascending: false }).limit(50),
      supabase.from('ai_audit_corrections_report').select('*').order('reviewed_at', { ascending: false }).limit(80),
      supabase.from('business_sectors').select('*').order('display_order'),
    ])

    setStats({
      totalUsers: totalUsersResult.count ?? 0,
      evaluatedUsers: evaluatedUsersResult.count ?? 0,
      highRiskUsers: highRiskUsersResult.count ?? 0,
      completedKatas: completedKatasResult.count ?? 0,
      incidents: incidentsResult.count ?? 0,
      pendingAuditQuestions: pendingQuestionsResult.count ?? 0,
    })

    setUsers((usersResult.data as UserProfile[]) ?? [])
    setQuestions((questionsResult.data as QuestionRecord[]) ?? [])
    setProviders((providersResult.data as AIProvider[]) ?? [])
    setAgentConfigs((agentConfigsResult.data as AgentConfig[]) ?? [])
    setIncidents((investigationsResult.data as IncidentInvestigation[]) ?? [])
    setAgentRuns((agentRunsResult.data as AgentRun[]) ?? [])
    setAuditCorrections((auditCorrectionsResult.data as AIAuditCorrectionReport[]) ?? [])
    setBusinessSectors((sectorsResult.data as BusinessSector[]) ?? [])

    const assignments = ((assignmentsResult.data as Array<{ agent_config_id: string; provider_key: string }>) ?? [])
      .reduce<Record<string, string[]>>((acc, item) => {
        acc[item.agent_config_id] = [...(acc[item.agent_config_id] ?? []), item.provider_key]
        return acc
      }, {})
    setAgentAssignments(assignments)
    setLoading(false)
  }

  async function saveQuestion() {
    setSaving(true)
    setMessage('')
    try {
      const options = JSON.parse(questionForm.options)
      const payload = {
        id: questionForm.id,
        branch: questionForm.branch,
        order_num: Number(questionForm.order_num),
        iso_control: questionForm.iso_control,
        question_text: questionForm.question_text,
        question_type: 'unica_opcion',
        options,
        active: questionForm.active,
        source_type: 'manual',
        audit_status: 'approved',
      }

      const exists = questions.some((question) => question.id === questionForm.id)
      const query = exists
        ? supabase.from('questions').update(payload).eq('id', questionForm.id)
        : supabase.from('questions').insert(payload)

      const { error } = await query
      if (error) throw error
      setMessage('Pregunta guardada correctamente.')
      setQuestionForm(DEFAULT_QUESTION)
      await loadAdminData()
    } catch (error) {
      setMessage(`No se pudo guardar la pregunta: ${(error as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  async function saveProvider() {
    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('ai_providers').upsert({
      provider_key: providerForm.provider_key,
      label: providerForm.label,
      provider_type: providerForm.provider_type,
      model_name: providerForm.model_name,
      purpose: providerForm.purpose,
      active: providerForm.active,
    })

    if (error) {
      setMessage(`No se pudo guardar el proveedor: ${error.message}`)
    } else {
      setMessage('Proveedor IA guardado correctamente.')
      setProviderForm({
        provider_key: '',
        label: '',
        provider_type: 'chat_completion',
        model_name: '',
        purpose: '',
        active: true,
        created_at: new Date().toISOString(),
      })
      await loadAdminData()
    }
    setSaving(false)
  }

  async function saveBusinessSector() {
    setSaving(true)
    setMessage('')

    const code = normalizeSectorCode(sectorForm.code)

    const { error } = await supabase.rpc('save_business_sector', {
      original_code: sectorOriginalCode || null,
      sector_code: code,
      sector_label: sectorForm.label.trim(),
      sector_active: sectorForm.active,
      sector_display_order: Number(sectorForm.display_order) || 100,
    })

    if (error) {
      setMessage(`No se pudo guardar el sector: ${error.message}`)
    } else {
      setMessage(sectorOriginalCode && sectorOriginalCode !== code
        ? 'Sector guardado y referencias actualizadas.'
        : 'Sector guardado correctamente.')
      resetSectorForm()
      await loadAdminData()
    }

    setSaving(false)
  }

  function editBusinessSector(sector: BusinessSector) {
    setSectorOriginalCode(sector.code)
    setSectorForm(sector)
    setActiveTab('sectors')
  }

  function resetSectorForm() {
    setSectorOriginalCode('')
    setSectorForm({
      code: '',
      label: '',
      active: true,
      display_order: 100,
    })
  }

  async function saveAgentConfig(config: AgentConfig) {
    setSaving(true)
    setMessage('')
    const { error } = await supabase
      .from('agent_configs')
      .update({
        name: config.name,
        description: config.description,
        enabled: config.enabled,
        trigger_time: config.trigger_time,
        timezone: config.timezone,
        prompt_template: config.prompt_template,
        investigation_window_days: config.investigation_window_days,
        extra_settings: config.extra_settings ?? {},
      })
      .eq('id', config.id)

    if (error) {
      setMessage(`No se pudo guardar el agente: ${error.message}`)
      setSaving(false)
      return
    }

    const selectedProviders = agentAssignments[config.id] ?? []
    const { data: existingAssignments } = await supabase
      .from('agent_provider_assignments')
      .select('*')
      .eq('agent_config_id', config.id)

    const existingKeys = new Set((existingAssignments ?? []).map((item) => item.provider_key))
    const upsertRows = selectedProviders.map((providerKey, index) => ({
      agent_config_id: config.id,
      provider_key: providerKey,
      priority: index + 1,
      active: true,
    }))

    if (upsertRows.length > 0) {
      await supabase.from('agent_provider_assignments').upsert(upsertRows)
    }

    const removedKeys = Array.from(existingKeys).filter((key) => !selectedProviders.includes(key))
    if (removedKeys.length > 0) {
      await supabase
        .from('agent_provider_assignments')
        .update({ active: false })
        .eq('agent_config_id', config.id)
        .in('provider_key', removedKeys)
    }

    setMessage('Configuracion de agente actualizada.')
    setSaving(false)
    await loadAdminData()
  }

  async function runAgent(functionName: string) {
    setMessage(`Ejecutando ${functionName}...`)
    const { error } = await supabase.functions.invoke(functionName, {
      body: { triggered_by: currentUser?.email ?? 'admin-ui' }
    })
    if (error) {
      setMessage(`Fallo al ejecutar ${functionName}: ${error.message}`)
      return
    }
    setMessage(`${functionName} ejecutado correctamente.`)
    await loadAdminData()
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-4 text-yellow-400" size={36} />
          <h1 className="text-2xl font-bold">Acceso restringido</h1>
          <p className="text-slate-300 mt-3">
            Tu usuario no tiene rol administrador. Asigna `role = admin` en la tabla `users`.
          </p>
          <button
            onClick={onBackToApp}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20"
          >
            <ArrowLeft size={16} />
            Volver a la app
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold text-slate-800">
            {activeTab === 'dashboard' && 'Panel General'}
            {activeTab === 'questions' && 'Gestión de Preguntas'}
            {activeTab === 'sectors' && 'Sectores'}
            {activeTab === 'agents' && 'Agentes IA'}
            {activeTab === 'providers' && 'Proveedores IA'}
            {activeTab === 'incidents' && 'Investigador de Incidentes'}
            {activeTab === 'audit-report' && 'Auditoría IA'}
          </h1>
          <button
            onClick={() => void loadAdminData()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 shadow-sm"
          >
            <RefreshCcw size={14} />
            Refrescar
          </button>
        </div>

        {message && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center text-slate-500 shadow-sm">
            Cargando centro administrativo...
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <section className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                  <StatCard title="Usuarios" value={stats.totalUsers} color="bg-blue-600" icon={<Shield size={18} />} />
                  <StatCard title="Evaluados" value={stats.evaluatedUsers} color="bg-emerald-600" icon={<Activity size={18} />} />
                  <StatCard title="Riesgo alto" value={stats.highRiskUsers} color="bg-red-600" icon={<AlertTriangle size={18} />} />
                  <StatCard title="Katas" value={stats.completedKatas} color="bg-amber-500" icon={<Brain size={18} />} />
                  <StatCard title="Incidentes" value={stats.incidents} color="bg-violet-600" icon={<Bot size={18} />} />
                  <StatCard title="Pend. auditoria" value={stats.pendingAuditQuestions} color="bg-slate-700" icon={<Save size={18} />} />
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                    <h2 className="text-lg font-bold text-slate-900 mb-4">Entrada y avance de usuarios</h2>
                    <div className="space-y-3">
                      {users.map((user) => (
                        <div key={user.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                          <div>
                            <p className="font-semibold text-slate-900">{user.full_name ?? user.email}</p>
                            <p className="text-xs text-slate-500">
                              {user.business_type ?? 'Sin negocio'} · {user.current_risk_level ?? 'sin evaluar'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-slate-900">{user.total_points ?? 0} pts</p>
                            <p className="text-xs text-slate-500">{user.belt}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                    <h2 className="text-lg font-bold text-slate-900 mb-4">Ultimas ejecuciones</h2>
                    <div className="space-y-3">
                      {latestRuns.map((run) => (
                        <div key={run.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-slate-800">{run.status}</p>
                            <span className="text-xs text-slate-500">{new Date(run.started_at).toLocaleString('es-EC')}</span>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">{run.summary ?? 'Sin resumen'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'questions' && (
              <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Configurar preguntas</h2>
                  <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                    Usa esta seccion para mantener las preguntas base del dojo. La regla operativa recomendada es
                    10 preguntas manuales por dojo/modulo y 10 preguntas generadas por IA en estado de auditoria.
                  </div>
                  <div className="space-y-4">
                    <Input label="ID" value={questionForm.id} onChange={(value) => setQuestionForm((prev) => ({ ...prev, id: value }))} />
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Rama" value={questionForm.branch} onChange={(value) => setQuestionForm((prev) => ({ ...prev, branch: value }))} />
                      <Input label="Orden" type="number" value={String(questionForm.order_num)} onChange={(value) => setQuestionForm((prev) => ({ ...prev, order_num: Number(value) }))} />
                    </div>
                    <Input label="Control ISO" value={questionForm.iso_control} onChange={(value) => setQuestionForm((prev) => ({ ...prev, iso_control: value }))} />
                    <TextArea label="Texto de la pregunta" value={questionForm.question_text} onChange={(value) => setQuestionForm((prev) => ({ ...prev, question_text: value }))} rows={4} />
                    <TextArea label="Opciones JSON" value={questionForm.options} onChange={(value) => setQuestionForm((prev) => ({ ...prev, options: value }))} rows={10} />
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={questionForm.active}
                        onChange={(event) => setQuestionForm((prev) => ({ ...prev, active: event.target.checked }))}
                      />
                      Activa para usuarios
                    </label>
                    <button
                      onClick={() => void saveQuestion()}
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                    >
                      <Save size={16} />
                      Guardar pregunta
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Ultimas preguntas</h2>
                  <div className="space-y-3 max-h-[800px] overflow-auto pr-1">
                    {questions.map((question) => (
                      <button
                        key={question.id}
                        onClick={() => setQuestionForm({
                          id: question.id,
                          branch: question.branch,
                          order_num: question.order_num ?? 1,
                          iso_control: question.iso_control ?? '',
                          question_text: question.question_text,
                          question_type: question.question_type,
                          options: JSON.stringify(question.options, null, 2),
                          active: question.active,
                        })}
                        className="w-full text-left rounded-2xl border border-slate-200 px-4 py-4 hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">{question.id} · {question.question_text}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {question.source_type ?? 'manual'} · auditoria {question.audit_status ?? 'approved'}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${question.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                            {question.active ? 'Activa' : 'Inactiva'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'sectors' && (
              <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Mantenimiento de sectores</h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Los sectores activos aparecen en el registro de nuevos usuarios.
                      </p>
                    </div>
                    <button
                      onClick={resetSectorForm}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Nuevo
                    </button>
                  </div>

                  <div className="space-y-4">
                    <Input
                      label="Codigo interno"
                      value={sectorForm.code}
                      onChange={(value) => setSectorForm((prev) => ({ ...prev, code: normalizeSectorCode(value) }))}
                    />
                    <Input
                      label="Nombre visible"
                      value={sectorForm.label}
                      onChange={(value) => setSectorForm((prev) => ({ ...prev, label: value }))}
                    />
                    <Input
                      label="Orden"
                      type="number"
                      value={String(sectorForm.display_order)}
                      onChange={(value) => setSectorForm((prev) => ({ ...prev, display_order: Number(value) || 100 }))}
                    />
                    <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={sectorForm.active}
                        onChange={(event) => setSectorForm((prev) => ({ ...prev, active: event.target.checked }))}
                      />
                      Activo para nuevos registros
                    </label>
                    <button
                      onClick={() => void saveBusinessSector()}
                      disabled={saving || !sectorForm.code || !sectorForm.label.trim()}
                      className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-950 text-white disabled:opacity-60"
                    >
                      <Save size={16} />
                      {saving ? 'Guardando...' : 'Guardar sector'}
                    </button>
                    {sectorOriginalCode && sectorOriginalCode !== sectorForm.code && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        Al guardar, los usuarios y alertas que usen `{sectorOriginalCode}` se actualizaran a `{sectorForm.code}`.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <h2 className="text-lg font-bold text-slate-900">Sectores registrados</h2>
                    <span className="text-sm text-slate-500">{businessSectors.length} sectores</span>
                  </div>
                  <div className="space-y-3">
                    {businessSectors.map((sector) => (
                      <button
                        key={sector.code}
                        onClick={() => editBusinessSector(sector)}
                        className="w-full text-left rounded-2xl border border-slate-200 p-4 hover:border-slate-400 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{sector.label}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {sector.code} · orden {sector.display_order}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${sector.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                            {sector.active ? 'Activo' : 'Inhabilitado'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'providers' && (
              <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Registrar IA</h2>
                  <div className="space-y-4">
                    <Input label="Clave" value={providerForm.provider_key} onChange={(value) => setProviderForm((prev) => ({ ...prev, provider_key: value }))} />
                    <Input label="Nombre" value={providerForm.label} onChange={(value) => setProviderForm((prev) => ({ ...prev, label: value }))} />
                    <Input label="Tipo" value={providerForm.provider_type} onChange={(value) => setProviderForm((prev) => ({ ...prev, provider_type: value }))} />
                    <Input label="Modelo" value={providerForm.model_name} onChange={(value) => setProviderForm((prev) => ({ ...prev, model_name: value }))} />
                    <TextArea label="Uso previsto" value={providerForm.purpose ?? ''} onChange={(value) => setProviderForm((prev) => ({ ...prev, purpose: value }))} rows={4} />
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={providerForm.active}
                        onChange={(event) => setProviderForm((prev) => ({ ...prev, active: event.target.checked }))}
                      />
                      Activa
                    </label>
                    <button
                      onClick={() => void saveProvider()}
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-950 text-white"
                    >
                      <Save size={16} />
                      Guardar proveedor
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">IAs registradas</h2>
                  <div className="space-y-3">
                    {providers.map((provider) => (
                      <button
                        key={provider.provider_key}
                        onClick={() => setProviderForm(provider)}
                        className="w-full text-left rounded-2xl border border-slate-200 px-4 py-4 hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">{provider.label}</p>
                            <p className="text-sm text-slate-500">{provider.provider_key} · {provider.model_name}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${provider.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                            {provider.active ? 'Activa' : 'Inactiva'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-2">{provider.purpose}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'agents' && (
              <section className="space-y-6">
                <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-sm text-cyan-950">
                  <h2 className="text-lg font-bold">Flujo IA de preguntas</h2>
                  <p className="mt-1">
                    El agente investigador genera preguntas nuevas usando el prompt configurable.
                    El agente auditor revisa esas preguntas y decide si quedan aprobadas o rechazadas.
                    Para trabajar con 10 preguntas generadas por IA, configura el investigador con
                    <strong> Preguntas IA por corrida = 10</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => void runAgent('run-incident-investigator')} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white">
                    <Play size={16} />
                    Ejecutar investigador
                  </button>
                  <button onClick={() => void runAgent('audit-generated-questions')} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500 text-white">
                    <Play size={16} />
                    Ejecutar auditor
                  </button>
                  <button onClick={() => void runAgent('run-daily-agent-workflows')} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white">
                    <Play size={16} />
                    Ejecutar dispatcher
                  </button>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  {agentConfigs.map((config) => (
                    <div key={config.id} className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">{config.name}</h2>
                          <p className="text-sm text-slate-500">{config.agent_code}</p>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(event) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? { ...item, enabled: event.target.checked } : item))}
                          />
                          Activo
                        </label>
                      </div>
                      <div className="space-y-4">
                        <Input
                          label="Nombre"
                          value={config.name}
                          onChange={(value) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? { ...item, name: value } : item))}
                        />
                        <TextArea
                          label="Descripcion"
                          value={config.description ?? ''}
                          onChange={(value) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? { ...item, description: value } : item))}
                          rows={2}
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Hora disparo"
                            type="time"
                            value={config.trigger_time.slice(0, 5)}
                            onChange={(value) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? { ...item, trigger_time: `${value}:00` } : item))}
                          />
                          <Input
                            label="Zona horaria"
                            value={config.timezone}
                            onChange={(value) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? { ...item, timezone: value } : item))}
                          />
                        </div>
                        {config.agent_code === 'incident-investigator' && (
                          <div className="grid gap-4 md:grid-cols-2">
                            <Input
                              label="Preguntas IA por corrida"
                              type="number"
                              value={String(getNumberSetting(config, 'max_questions_per_run', 10))}
                              onChange={(value) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? {
                                ...item,
                                extra_settings: {
                                  ...(item.extra_settings ?? {}),
                                  max_questions_per_run: Math.max(1, Math.min(50, Number(value) || 10)),
                                },
                              } : item))}
                            />
                            <label className="block">
                              <span className="block text-sm font-semibold text-slate-700 mb-1.5">Crear alertas desde incidentes</span>
                              <select
                                value={getBooleanSetting(config, 'create_alerts', true) ? 'true' : 'false'}
                                onChange={(event) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? {
                                  ...item,
                                  extra_settings: {
                                    ...(item.extra_settings ?? {}),
                                    create_alerts: event.target.value === 'true',
                                  },
                                } : item))}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900"
                              >
                                <option value="true">Si</option>
                                <option value="false">No</option>
                              </select>
                            </label>
                          </div>
                        )}
                        {config.agent_code === 'question-auditor' && (
                          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={getBooleanSetting(config, 'auto_activate_approved', true)}
                              onChange={(event) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? {
                                ...item,
                                extra_settings: {
                                  ...(item.extra_settings ?? {}),
                                  auto_activate_approved: event.target.checked,
                                },
                              } : item))}
                            />
                            Autoactivar preguntas aprobadas por la IA auditora
                          </label>
                        )}
                        {config.agent_code === 'sensei-question-auditor' && (
                          <div className="grid gap-4 md:grid-cols-3">
                            <Input
                              label="Timeout ms"
                              type="number"
                              value={String(getNumberSetting(config, 'timeout_ms', 12000))}
                              onChange={(value) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? {
                                ...item,
                                extra_settings: {
                                  ...(item.extra_settings ?? {}),
                                  timeout_ms: Math.max(3000, Math.min(60000, Number(value) || 12000)),
                                },
                              } : item))}
                            />
                            <Input
                              label="Tokens maximos"
                              type="number"
                              value={String(getNumberSetting(config, 'max_tokens', 1200))}
                              onChange={(value) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? {
                                ...item,
                                extra_settings: {
                                  ...(item.extra_settings ?? {}),
                                  max_tokens: Math.max(300, Math.min(4000, Number(value) || 1200)),
                                },
                              } : item))}
                            />
                            <Input
                              label="Temperatura"
                              type="number"
                              value={String(getNumberSetting(config, 'temperature', 0.1))}
                              onChange={(value) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? {
                                ...item,
                                extra_settings: {
                                  ...(item.extra_settings ?? {}),
                                  temperature: Math.max(0, Math.min(1, Number(value) || 0.1)),
                                },
                              } : item))}
                            />
                          </div>
                        )}
                        <TextArea
                          label="Prompt configurable"
                          value={config.prompt_template}
                          onChange={(value) => setAgentConfigs((prev) => prev.map((item) => item.id === config.id ? { ...item, prompt_template: value } : item))}
                          rows={8}
                        />
                        <div>
                          <p className="text-sm font-semibold text-slate-700 mb-2">IAs habilitadas</p>
                          <div className="grid gap-2 md:grid-cols-2">
                            {providers.map((provider) => {
                              const selected = (agentAssignments[config.id] ?? []).includes(provider.provider_key)
                              return (
                                <label key={provider.provider_key} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(event) => {
                                      setAgentAssignments((prev) => {
                                        const next = new Set(prev[config.id] ?? [])
                                        if (event.target.checked) next.add(provider.provider_key)
                                        else next.delete(provider.provider_key)
                                        return { ...prev, [config.id]: Array.from(next) }
                                      })
                                    }}
                                  />
                                  {provider.label}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pt-2">
                          {(() => {
                            const fnName = AGENT_FUNCTION_MAP[config.agent_code]
                            const lastRun = lastRunByAgentConfig[config.id]
                            return (
                              <>
                                {lastRun && (
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold ${
                                    lastRun.status === 'completed'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : lastRun.status === 'failed'
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    <RefreshCcw size={12} />
                                    {lastRun.status === 'completed' ? 'OK' : lastRun.status === 'failed' ? 'Fallo' : 'Corriendo'}
                                    {' '}
                                    {new Date(lastRun.started_at).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                                {fnName ? (
                                  <button
                                    onClick={() => void runAgent(fnName)}
                                    disabled={saving}
                                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-cyan-600 text-white text-sm hover:bg-cyan-700"
                                  >
                                    <Play size={14} />
                                    Probar agente
                                  </button>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-400 text-sm">
                                    <Brain size={14} />
                                    Sin implementar
                                  </span>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'audit-report' && (
              <section className="space-y-6">
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
                  <h2 className="text-lg font-bold">Correcciones realizadas por auditores IA</h2>
                  <p className="mt-1">
                    Este reporte muestra cuando una IA auditora tuvo que corregir una respuesta del Sensei
                    o una pregunta generada desde el scanner de ciberataques/ciberdelitos.
                  </p>
                </div>

                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <h2 className="text-lg font-bold text-slate-900">Ultimas correcciones</h2>
                    <span className="text-sm text-slate-500">{auditCorrections.length} registros</span>
                  </div>
                  {auditCorrections.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-500">
                      No hay correcciones registradas por auditores IA.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {auditCorrections.map((item) => (
                        <article key={`${item.source_type}-${item.record_id}`} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  item.source_type === 'sensei'
                                    ? 'bg-cyan-100 text-cyan-800'
                                    : 'bg-violet-100 text-violet-800'
                                }`}>
                                  {item.source_type === 'sensei' ? 'Sensei' : 'Scanner Web'}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {new Date(item.reviewed_at).toLocaleString('es-EC')}
                                </span>
                              </div>
                              <p className="mt-2 font-semibold text-slate-900">{item.question_text}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                Auditor: {item.auditor_provider ?? 'n/d'} {item.auditor_model ? `Â· ${item.auditor_model}` : ''}
                              </p>
                            </div>
                            <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                              Corregido
                            </span>
                          </div>

                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Original</p>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{compactText(item.original_answer_text)}</p>
                            </div>
                            <div className="rounded-2xl bg-emerald-50 p-4">
                              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Corregido</p>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{compactText(item.corrected_answer_text)}</p>
                            </div>
                          </div>

                          {item.correction_notes && (
                            <p className="mt-3 text-sm text-slate-600">
                              <strong>Notas:</strong> {item.correction_notes}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'incidents' && (
              <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Incidentes investigados</h2>
                  <div className="space-y-3">
                    {incidents.map((incident) => (
                      <div key={incident.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">{incident.title}</p>
                            <p className="text-sm text-slate-600 mt-1">{incident.summary}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            incident.severity === 'alta' || incident.severity === 'critica'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {incident.severity}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                          <span>Fecha: {incident.incident_date}</span>
                          <span>Estado: {incident.status}</span>
                          <span>IA: {incident.ai_provider_key ?? 'n/d'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Alcance operativo</h2>
                  <ul className="space-y-3 text-sm text-slate-700">
                    <li>El agente investigador toma la hora configurable desde `agent_configs.trigger_time`.</li>
                    <li>El prompt de generacion de preguntas se edita desde este centro administrativo.</li>
                    <li>El auditor valida preguntas generadas antes de activarlas al usuario final.</li>
                    <li>Las alertas graves usan rojo y las moderadas amarillo dentro de la app.</li>
                    <li>Las alertas aprobadas se enlazan a preguntas relacionadas del incidente.</li>
                  </ul>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function compactText(value?: string) {
  if (!value) return 'Sin contenido registrado.'
  return value.length > 900 ? `${value.slice(0, 900)}...` : value
}

function normalizeSectorCode(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

function StatCard({ title, value, color, icon }: { title: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
      <div className={`w-10 h-10 rounded-2xl ${color} text-white flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900"
      />
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
  rows,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900"
      />
    </label>
  )
}
