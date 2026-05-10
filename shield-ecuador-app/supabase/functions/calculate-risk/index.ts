import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ResponseItem {
  question_id: string
  selected_option: {
    valor: string
    [key: string]: unknown
  }
}

interface QuestionRecord {
  id: string
  options: Array<{
    valor: string
    puntaje_riesgo: number
    siguiente_pregunta?: string
  }>
}

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

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')

    if (!token) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return jsonResponse({ error: 'Invalid session' }, 401)
    }

    const { responses } = await req.json() as { responses: ResponseItem[] }

    if (!Array.isArray(responses) || responses.length === 0 || responses.length > 100) {
      return jsonResponse({ error: 'Invalid responses array' }, 400)
    }

    const questionIds = Array.from(new Set(responses.map((response) => response.question_id)))
    if (questionIds.some((id) => !/^[A-Z][0-9]{2,3}$/.test(id))) {
      return jsonResponse({ error: 'Invalid question id' }, 400)
    }

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, options')
      .in('id', questionIds)
      .eq('active', true)

    if (questionsError) throw questionsError

    const questionsById = new Map((questions as QuestionRecord[] ?? []).map((question) => [question.id, question]))

    let totalScore = 0
    const vectorScores: Record<string, number> = {}
    const normalizedResponses: Array<{ question_id: string; selected_option: { valor: string; puntaje_riesgo: number; siguiente_pregunta?: string } }> = []

    for (const response of responses) {
      const question = questionsById.get(response.question_id)
      if (!question) {
        return jsonResponse({ error: `Question not found or inactive: ${response.question_id}` }, 400)
      }

      const selectedValue = String(response.selected_option?.valor ?? '')
      const option = question.options.find((item) => item.valor === selectedValue)
      if (!option || !Number.isFinite(option.puntaje_riesgo)) {
        return jsonResponse({ error: `Invalid option for question: ${response.question_id}` }, 400)
      }

      const score = Number(option.puntaje_riesgo)
      totalScore += score

      const branch = response.question_id.charAt(0)
      vectorScores[branch] = (vectorScores[branch] ?? 0) + score
      normalizedResponses.push({
        question_id: response.question_id,
        selected_option: {
          valor: option.valor,
          puntaje_riesgo: score,
          siguiente_pregunta: option.siguiente_pregunta,
        },
      })
    }

    const { riskLevel, belt } = classifyRisk(totalScore)
    const { weakestVector, weakestVectorName } = getWeakestVector(vectorScores)

    const result = {
      totalScore,
      riskLevel,
      belt,
      vectorScores,
      weakestVector,
      weakestVectorName,
      questionsAnswered: normalizedResponses.length,
    }

    const userId = authData.user.id

    const { error: evaluationError } = await supabase.from('evaluations').insert({
      user_id: userId,
      total_score: result.totalScore,
      risk_level: result.riskLevel,
      belt_awarded: result.belt,
      vector_scores: result.vectorScores,
      responses: normalizedResponses,
    })
    if (evaluationError) throw evaluationError

    const { error: userUpdateError } = await supabase.from('users').update({
      belt: result.belt,
      current_risk_level: result.riskLevel,
      total_points: result.totalScore,
      last_evaluation_at: new Date().toISOString(),
    }).eq('id', userId)
    if (userUpdateError) throw userUpdateError

    return jsonResponse(result)
  } catch (error) {
    console.error('Error in calculate-risk:', error)
    return jsonResponse({ error: 'Unable to calculate risk' }, 500)
  }
})

function classifyRisk(totalScore: number) {
  if (totalScore >= 86) return { riskLevel: 'critico', belt: 'white' }
  if (totalScore >= 56) return { riskLevel: 'alto', belt: 'yellow' }
  if (totalScore >= 26) return { riskLevel: 'medio', belt: 'orange' }
  if (totalScore >= 11) return { riskLevel: 'bajo', belt: 'green' }
  return { riskLevel: 'bajo', belt: 'brown' }
}

function getWeakestVector(vectorScores: Record<string, number>) {
  let weakestVector = ''
  let maxVectorScore = 0
  for (const [branch, score] of Object.entries(vectorScores)) {
    if (score > maxVectorScore) {
      maxVectorScore = score
      weakestVector = branch
    }
  }

  const vectorNames: Record<string, string> = {
    A: 'Seguridad de dispositivos',
    B: 'Contrasenas y autenticacion',
    C: 'Proteccion contra phishing',
    I: 'Uso de tecnologia',
  }

  return {
    weakestVector,
    weakestVectorName: vectorNames[weakestVector] ?? weakestVector,
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
