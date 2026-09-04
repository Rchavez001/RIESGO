import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Severity = 'baja' | 'media' | 'alta' | 'critica'

interface IncidentFeedItem {
  title: string
  summary: string
  severity: Severity
  source_name?: string
  source_url?: string
}

interface GeneratedQuestionOption {
  valor: string
  texto: string
  puntaje_riesgo: number
  siguiente_pregunta: string
  explicacion_para_usuario: string
  alerta_inmediata?: boolean
  mensaje_alerta?: string
}

interface GeneratedQuestion {
  branch: 'A' | 'B' | 'C' | 'I'
  iso_control?: string
  question_text: string
  options: GeneratedQuestionOption[]
  incident_title?: string
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const requester = await requireAdminOrScheduler(req)
    const body = await req.json().catch(() => ({}))
    const targetDate = body.target_date ?? previousDate()
    const suppliedFeed = Array.isArray(body.incident_feed) ? body.incident_feed as IncidentFeedItem[] : []

    const { data: config } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('agent_code', 'incident-investigator')
      .single()

    if (!config || !config.enabled) {
      throw new Error('Incident investigator agent is disabled or missing')
    }

    const { data: assignments } = await supabase
      .from('agent_provider_assignments')
      .select('priority, provider_key, ai_providers(provider_key, provider_type, model_name, active)')
      .eq('agent_config_id', config.id)
      .eq('active', true)
      .order('priority', { ascending: true })

    const providers = (assignments ?? [])
      .map((assignment) => assignment.ai_providers)
      .filter(Boolean)

    if (providers.length === 0) {
      throw new Error('No AI providers assigned to incident investigator')
    }

    const { data: runRecord } = await supabase
      .from('agent_runs')
      .insert({
        agent_config_id: config.id,
        run_date: targetDate,
        input_payload: { targetDate, suppliedFeedCount: suppliedFeed.length },
        triggered_by: body.triggered_by ?? requester,
      })
      .select()
      .single()

    const incidentFeed = suppliedFeed.length > 0
      ? suppliedFeed
      : await buildIncidentFeedFromAlerts(targetDate)

    const aiResponse = await runWithFallback(providers, config.prompt_template, {
      target_date: targetDate,
      incident_feed: incidentFeed,
      instructions: {
        max_questions_per_run: config.extra_settings?.max_questions_per_run ?? 10,
        response_format: {
          incidents: [
            {
              title: 'string',
              summary: 'string',
              severity: 'baja|media|alta|critica',
              source_name: 'string',
              source_url: 'string'
            }
          ],
          generated_questions: [
            {
              branch: 'A|B|C|I',
              iso_control: 'string',
              question_text: 'string',
              incident_title: 'string',
              options: [
                {
                  valor: 'A',
                  texto: 'string',
                  puntaje_riesgo: 0,
                  siguiente_pregunta: 'FIN',
                  explicacion_para_usuario: 'string'
                }
              ]
            }
          ]
        }
      }
    })

    const parsed = parseJsonResponse(aiResponse.content)
    const incidents = Array.isArray(parsed.incidents) ? parsed.incidents as IncidentFeedItem[] : incidentFeed
    const generatedQuestions = Array.isArray(parsed.generated_questions)
      ? parsed.generated_questions as GeneratedQuestion[]
      : []

    const relatedQuestionIds: string[] = []
    const relatedQuestionsByIncidentTitle = new Map<string, string[]>()
    const incidentIdsByTitle = new Map<string, string>()

    for (const incident of incidents) {
      const { data: savedIncident } = await supabase
        .from('incident_investigations')
        .insert({
          incident_date: targetDate,
          title: incident.title,
          summary: incident.summary,
          severity: incident.severity,
          source_name: incident.source_name,
          source_url: incident.source_url,
          ai_provider_key: aiResponse.providerKey,
          raw_payload: incident,
          status: generatedQuestions.length > 0 ? 'preguntas_generadas' : 'detectado',
        })
        .select()
        .single()

      if (savedIncident) {
        incidentIdsByTitle.set(incident.title, savedIncident.id)
      }
    }

    let orderCounter = 100
    for (const question of generatedQuestions) {
      const questionId = buildQuestionId(question.branch, orderCounter)
      orderCounter += 1
      const relatedIncidentId = question.incident_title
        ? incidentIdsByTitle.get(question.incident_title) ?? null
        : null

      const { error: insertQuestionError } = await supabase
        .from('questions')
        .insert({
          id: questionId,
          branch: question.branch,
          order_num: orderCounter,
          iso_control: question.iso_control ?? 'A.6.1',
          question_text: question.question_text,
          question_type: 'unica_opcion',
          options: normalizeOptions(question.options),
          active: false,
          source_type: 'incident_investigation',
          generated_from_incident_id: relatedIncidentId,
          generation_prompt_version: `${config.updated_at ?? config.created_at}`,
          audit_status: 'pending',
        })

      if (!insertQuestionError) {
        relatedQuestionIds.push(questionId)
        if (question.incident_title) {
          const questionIds = relatedQuestionsByIncidentTitle.get(question.incident_title) ?? []
          relatedQuestionsByIncidentTitle.set(question.incident_title, [...questionIds, questionId])
        }
      }
    }

    for (const [title, incidentId] of incidentIdsByTitle.entries()) {
      const questionIdsForIncident = relatedQuestionsByIncidentTitle.get(title) ?? []

      await supabase
        .from('incident_investigations')
        .update({
          generated_question_ids: questionIdsForIncident,
        })
        .eq('id', incidentId)
    }

    await supabase
      .from('agent_runs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        summary: `Incidentes: ${incidents.length}. Preguntas generadas: ${relatedQuestionIds.length}.`,
        output_payload: {
          incidents_count: incidents.length,
          question_ids: relatedQuestionIds,
          provider_key: aiResponse.providerKey,
        },
      })
      .eq('id', runRecord?.id)

    await supabase
      .from('agent_configs')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', config.id)

    return jsonResponse({
      target_date: targetDate,
      provider_key: aiResponse.providerKey,
      incidents_count: incidents.length,
      generated_question_ids: relatedQuestionIds,
    })
  } catch (error) {
    const message = (error as Error).message
    console.error('Error in run-incident-investigator:', error)
    return jsonResponse({ error: message }, getStatus(error))
  }
})

async function requireAdminOrScheduler(req: Request) {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
    return 'scheduler'
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError('Missing authorization header', 401)

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) throw new HttpError('Invalid session', 401)

  const { data: profile } = await supabase
    .from('users')
    .select('role, email')
    .eq('id', authData.user.id)
    .single()

  if (profile?.role !== 'admin') throw new HttpError('Admin role required', 403)
  return profile.email ?? authData.user.id
}

class HttpError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function getStatus(error: unknown) {
  return error instanceof HttpError ? error.status : 500
}

async function buildIncidentFeedFromAlerts(targetDate: string): Promise<IncidentFeedItem[]> {
  const start = `${targetDate}T00:00:00.000Z`
  const end = `${targetDate}T23:59:59.999Z`
  const { data } = await supabase
    .from('alerts')
    .select('title, description, severity, source, source_url')
    .gte('published_at', start)
    .lte('published_at', end)
    .order('published_at', { ascending: false })

  if (!data || data.length === 0) {
    return [{
      title: `Sin feed externo para ${targetDate}`,
      summary: 'No se cargaron incidentes externos. Usa esta corrida para validar configuracion del agente.',
      severity: 'media',
      source_name: 'Sistema',
    }]
  }

  return data.map((alert) => ({
    title: alert.title,
    summary: alert.description,
    severity: normalizeSeverity(alert.severity),
    source_name: alert.source ?? undefined,
    source_url: alert.source_url ?? undefined,
  }))
}

async function runWithFallback(
  providers: Array<{ provider_key: string; provider_type: string; model_name: string; active: boolean }>,
  promptTemplate: string,
  payload: Record<string, unknown>
) {
  let lastError: Error | null = null

  for (const provider of providers) {
    if (!provider.active) continue
    try {
      const content = await callProvider(provider.provider_key, provider.model_name, promptTemplate, payload)
      return { content, providerKey: provider.provider_key }
    } catch (error) {
      lastError = error as Error
      console.error(`Provider ${provider.provider_key} failed`, error)
    }
  }

  throw lastError ?? new Error('All providers failed')
}

async function callProvider(
  providerKey: string,
  modelName: string,
  promptTemplate: string,
  payload: Record<string, unknown>
): Promise<string> {
  if (providerKey === 'deepseek') {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`
      },
      body: JSON.stringify({
        model: modelName,
        temperature: 0.1,
        max_tokens: 1400,
        messages: [
          { role: 'system', content: promptTemplate },
          { role: 'user', content: JSON.stringify(payload) }
        ]
      }),
    })

    if (!response.ok) throw new Error(`DeepSeek error ${response.status}`)
    const data = await response.json()
    return data.choices[0].message.content
  }

  if (providerKey === 'kimi') {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('KIMI_API_KEY')}`
      },
      body: JSON.stringify({
        model: modelName,
        temperature: 0.1,
        max_tokens: 1400,
        messages: [
          { role: 'system', content: promptTemplate },
          { role: 'user', content: JSON.stringify(payload) }
        ]
      }),
    })

    if (!response.ok) throw new Error(`Kimi error ${response.status}`)
    const data = await response.json()
    return data.choices[0].message.content
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 1400,
      system: promptTemplate,
      messages: [
        { role: 'user', content: JSON.stringify(payload) }
      ]
    }),
  })

  if (!response.ok) throw new Error(`Claude error ${response.status}`)
  const data = await response.json()
  return data.content[0].text
}

function normalizeOptions(options: GeneratedQuestionOption[]) {
  return options.map((option, index) => ({
    valor: option.valor || String.fromCharCode(65 + index),
    texto: option.texto,
    puntaje_riesgo: option.puntaje_riesgo ?? 0,
    siguiente_pregunta: option.siguiente_pregunta ?? 'FIN',
    explicacion_para_usuario: option.explicacion_para_usuario ?? option.texto,
    alerta_inmediata: option.alerta_inmediata ?? false,
    mensaje_alerta: option.mensaje_alerta ?? null,
  }))
}

function buildQuestionId(branch: string, orderCounter: number) {
  return `${branch}${Date.now().toString().slice(-4)}${orderCounter}`
}

function normalizeSeverity(value: string): Severity {
  if (value === 'critica' || value === 'alta' || value === 'media' || value === 'baja') {
    return value
  }
  return 'media'
}

function previousDate() {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - 1)
  return now.toISOString().slice(0, 10)
}

function parseJsonResponse(content: string) {
  const trimmed = content.trim()
  const normalized = trimmed.startsWith('```')
    ? trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '')
    : trimmed
  return JSON.parse(normalized)
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
