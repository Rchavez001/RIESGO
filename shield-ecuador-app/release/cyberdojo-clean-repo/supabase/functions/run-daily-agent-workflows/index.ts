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
    await requireAdminOrScheduler(req)
    const body = await req.json().catch(() => ({}))
    const now = body.current_time
      ? new Date(body.current_time)
      : new Date()

    const { data: configs } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('enabled', true)

    const dueAgents = (configs ?? []).filter((config) => isDue(config.trigger_time, config.timezone, now))

    const AGENT_FUNCTION_MAP: Record<string, string> = {
      'incident-investigator': 'run-incident-investigator',
      'question-auditor': 'audit-generated-questions',
    }

    const results: Array<Record<string, unknown>> = []
    for (const config of dueAgents) {
      const functionName = AGENT_FUNCTION_MAP[config.agent_code]

      if (!functionName) {
        console.warn(`No edge function mapped for agent_code: ${config.agent_code}`)
        results.push({
          agent_code: config.agent_code,
          function_name: null,
          error: 'No hay funcion implementada para este agente.',
          data: null,
        })
        continue
      }

      const invokeResult = await supabase.functions.invoke(functionName, {
        body: { triggered_by: 'scheduler-dispatcher' },
        headers: buildInternalHeaders(),
      })

      results.push({
        agent_code: config.agent_code,
        function_name: functionName,
        error: invokeResult.error?.message ?? null,
        data: invokeResult.data ?? null,
      })
    }

    return new Response(JSON.stringify({
      checked_at: now.toISOString(),
      triggered_agents: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error in run-daily-agent-workflows:', error)
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
    .select('role')
    .eq('id', authData.user.id)
    .single()

  if (profile?.role !== 'admin') throw new HttpError('Admin role required', 403)
  return 'admin'
}

function buildInternalHeaders() {
  const cronSecret = Deno.env.get('CRON_SECRET')
  return cronSecret ? { 'x-cron-secret': cronSecret } : undefined
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

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isDue(triggerTime: string, timezone: string, now: Date) {
  const [hours, minutes] = triggerTime.split(':').map(Number)
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const localHour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const localMinute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')

  return localHour === hours && localMinute >= minutes && localMinute < (minutes + 10)
}
