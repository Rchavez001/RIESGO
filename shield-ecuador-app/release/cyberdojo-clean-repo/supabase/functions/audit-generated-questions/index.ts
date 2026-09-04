import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { data: config } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('agent_code', 'question-auditor')
      .single()

    if (!config || !config.enabled) {
      throw new Error('Question auditor agent is disabled or missing')
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

    const { data: runRecord } = await supabase
      .from('agent_runs')
      .insert({
        agent_config_id: config.id,
        run_date: new Date().toISOString().slice(0, 10),
        input_payload: { limit: body.limit ?? 20 },
        triggered_by: body.triggered_by ?? requester,
      })
      .select()
      .single()

    const { data: pendingQuestions } = await supabase
      .from('questions')
      .select('id, branch, question_text, options, generated_from_incident_id, audit_status')
      .eq('audit_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(body.limit ?? 20)

    if (!pendingQuestions || pendingQuestions.length === 0) {
      await supabase
        .from('agent_runs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          summary: 'No hay preguntas pendientes por auditar.',
          output_payload: { audited: 0 },
        })
        .eq('id', runRecord?.id)

      return jsonResponse({ audited: 0, approved: 0, rejected: 0 })
    }

    const aiResponse = await runWithFallback(
      providers,
      config.prompt_template,
      {
        instructions: {
          output_format: {
            audits: [
              {
                question_id: 'string',
                status: 'approved|rejected',
                notes: 'string',
                suggested_improvement: 'string',
                corrected_question_text: 'string optional',
                corrected_options: 'array optional',
                corrected_explanation: 'string optional'
              }
            ]
          }
        },
        questions: pendingQuestions,
      }
    )

    const parsed = parseJsonResponse(aiResponse.content)
    const audits = Array.isArray(parsed.audits) ? parsed.audits : []

    let approved = 0
    let rejected = 0
    const autoActivateApproved = config.extra_settings?.auto_activate_approved !== false

    for (const audit of audits) {
      const status = audit.status === 'approved' ? 'approved' : 'rejected'
      if (status === 'approved') approved += 1
      else rejected += 1

      const question = pendingQuestions.find((item) => item.id === audit.question_id)
      const hasCorrectedQuestion = typeof audit.corrected_question_text === 'string' && audit.corrected_question_text.trim()
      const hasCorrectedOptions = Array.isArray(audit.corrected_options) && audit.corrected_options.length > 0
      const hasCorrectedExplanation = typeof audit.corrected_explanation === 'string' && audit.corrected_explanation.trim()
      const hasCorrection = Boolean(hasCorrectedQuestion || hasCorrectedOptions || hasCorrectedExplanation || audit.suggested_improvement)
      const now = new Date().toISOString()
      const correctedPayload = hasCorrection ? {
        question_text: hasCorrectedQuestion ? audit.corrected_question_text.trim() : question?.question_text,
        options: hasCorrectedOptions ? audit.corrected_options : question?.options,
        explanation: hasCorrectedExplanation ? audit.corrected_explanation.trim() : null,
        suggested_improvement: audit.suggested_improvement ?? null,
      } : null

      const updatePayload: Record<string, unknown> = {
        audit_status: status,
        audit_notes: audit.notes ?? audit.suggested_improvement ?? null,
        reviewed_at: now,
        audit_reviewed_at: now,
        audit_provider: aiResponse.providerKey,
        audit_model: aiResponse.modelName,
        audit_replaced_content: hasCorrection,
        audit_original_payload: question ? {
          id: question.id,
          branch: question.branch,
          question_text: question.question_text,
          options: question.options,
          generated_from_incident_id: question.generated_from_incident_id,
        } : null,
        audit_corrected_payload: correctedPayload,
        active: status === 'approved' && autoActivateApproved,
        source_type: status === 'approved' ? 'audited_generated' : 'incident_investigation',
      }

      if (status === 'approved' && hasCorrectedQuestion) {
        updatePayload.question_text = audit.corrected_question_text.trim()
      }
      if (status === 'approved' && hasCorrectedOptions) {
        updatePayload.options = audit.corrected_options
      }
      if (status === 'approved' && hasCorrectedExplanation) {
        updatePayload.explanation = audit.corrected_explanation.trim()
      }

      await supabase
        .from('questions')
        .update(updatePayload)
        .eq('id', audit.question_id)
        .eq('audit_status', 'pending')

      if (status === 'approved') {
        if (question?.generated_from_incident_id) {
          await upsertIncidentAlert(
            question.generated_from_incident_id,
            question.id,
            hasCorrectedQuestion ? audit.corrected_question_text.trim() : question.question_text,
          )

          await supabase
            .from('incident_investigations')
            .update({ status: 'auditado' })
            .eq('id', question.generated_from_incident_id)
        }
      }
    }

    await supabase
      .from('agent_runs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        summary: `Auditadas ${audits.length} preguntas. Aprobadas: ${approved}. Rechazadas: ${rejected}.`,
        output_payload: {
          audited: audits.length,
          approved,
          rejected,
          provider_key: aiResponse.providerKey,
          model_name: aiResponse.modelName,
        },
      })
      .eq('id', runRecord?.id)

    await supabase
      .from('agent_configs')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', config.id)

    return jsonResponse({
      audited: audits.length,
      approved,
      rejected,
      provider_key: aiResponse.providerKey,
      model_name: aiResponse.modelName,
    })
  } catch (error) {
    console.error('Error in audit-generated-questions:', error)
    return jsonResponse({ error: (error as Error).message }, getStatus(error))
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

async function upsertIncidentAlert(incidentId: string, questionId: string, questionText: string) {
  const { data: incident } = await supabase
    .from('incident_investigations')
    .select('*')
    .eq('id', incidentId)
    .single()

  if (!incident) return

  const { data: existingAlert } = await supabase
    .from('alerts')
    .select('id, related_question_ids')
    .eq('related_incident_id', incidentId)
    .single()

  const relatedIds = Array.from(new Set([...(existingAlert?.related_question_ids ?? []), questionId]))

  const payload = {
    title: `Incidente investigado: ${incident.title}`,
    description: `${incident.summary} Pregunta recomendada: ${questionText}`,
    threat_type: 'incidente_investigado',
    severity: incident.severity === 'alta' || incident.severity === 'critica' ? 'alta' : 'media',
    source: incident.source_name ?? 'Agente investigador',
    source_url: incident.source_url ?? null,
    related_question_ids: relatedIds,
    related_incident_id: incidentId,
    source_agent: 'question-auditor',
    active: true,
  }

  if (existingAlert) {
    await supabase.from('alerts').update(payload).eq('id', existingAlert.id)
  } else {
    await supabase.from('alerts').insert(payload)
  }
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
      return { content, providerKey: provider.provider_key, modelName: provider.model_name }
    } catch (error) {
      lastError = error as Error
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
        max_tokens: 1200,
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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 1200,
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
