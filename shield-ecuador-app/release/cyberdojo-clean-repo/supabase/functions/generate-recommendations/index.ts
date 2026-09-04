// supabase/functions/generate-recommendations/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { riskProfile, businessType } = await req.json()

    if (!riskProfile || !businessType) {
      return new Response(
        JSON.stringify({ error: 'riskProfile and businessType are required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 1. Generar hash para cache
    const queryHash = await generateHash(JSON.stringify(riskProfile))

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Verificar cache
    const { data: cached } = await supabase
      .from('recommendations_cache')
      .select('*')
      .eq('query_hash', queryHash)
      .single()

    if (cached) {
      await supabase
        .from('recommendations_cache')
        .update({
          hit_count: cached.hit_count + 1,
          last_hit_at: new Date().toISOString()
        })
        .eq('id', cached.id)

      return new Response(
        JSON.stringify({
          recommendations: JSON.parse(cached.recommendation_text),
          source: 'cache',
          ai_used: cached.ai_used
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 3. Obtener config de AI
    const { data: aiConfig } = await supabase
      .from('ai_configs')
      .select('*')
      .eq('active', true)
      .single()

    if (!aiConfig) {
      throw new Error('No AI config found')
    }

    // 4. Llamar a AI con cadena de fallback
    let recommendations: string
    let aiUsed: string

    try {
      recommendations = await callDeepSeek(riskProfile, businessType, aiConfig)
      aiUsed = 'deepseek'
    } catch (err1) {
      console.log('DeepSeek failed, trying Kimi...', err1)
      try {
        recommendations = await callKimi(riskProfile, businessType, aiConfig)
        aiUsed = 'kimi'
      } catch (err2) {
        console.log('Kimi failed, trying Claude...', err2)
        recommendations = await callClaude(riskProfile, businessType, aiConfig)
        aiUsed = 'claude'
      }
    }

    // 5. Guardar en cache
    await supabase
      .from('recommendations_cache')
      .insert({
        query_hash: queryHash,
        risk_profile: riskProfile,
        recommendation_text: recommendations,
        ai_used: aiUsed
      })

    return new Response(
      JSON.stringify({
        recommendations: JSON.parse(recommendations),
        source: 'ai',
        ai_used: aiUsed
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    console.error('Error in generate-recommendations:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})

async function generateHash(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32)
}

async function callDeepSeek(
  riskProfile: unknown,
  businessType: string,
  config: { primary_timeout_ms: number; temperature: number; max_tokens: number }
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.primary_timeout_ms)

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: getSystemPrompt(businessType) },
          { role: 'user', content: JSON.stringify(riskProfile) }
        ],
        temperature: config.temperature,
        max_tokens: config.max_tokens
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`DeepSeek HTTP error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0].message.content

  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

async function callKimi(
  riskProfile: unknown,
  businessType: string,
  config: { fallback_timeout_ms: number; temperature: number; max_tokens: number }
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.fallback_timeout_ms)

  try {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('KIMI_API_KEY')}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [
          { role: 'system', content: getSystemPrompt(businessType) },
          { role: 'user', content: JSON.stringify(riskProfile) }
        ],
        temperature: config.temperature,
        max_tokens: config.max_tokens
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Kimi HTTP error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0].message.content

  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

async function callClaude(
  riskProfile: unknown,
  businessType: string,
  config: { fallback_timeout_ms: number; max_tokens: number }
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.fallback_timeout_ms)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: config.max_tokens,
        system: getSystemPrompt(businessType),
        messages: [
          { role: 'user', content: JSON.stringify(riskProfile) }
        ]
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Claude HTTP error: ${response.status}`)
    }

    const data = await response.json()
    return data.content[0].text

  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

function getSystemPrompt(businessType: string): string {
  return `Eres un asesor de ciberseguridad para pequeños negocios en Ecuador.
Tu público son ${businessType}s. Usa español sencillo, máximo 8º grado de escolaridad.

INSTRUCCIONES ESTRICTAS:
1. Responde SOLO basado en el perfil de riesgo proporcionado.
2. Si no tienes certeza de una recomendación específica para Ecuador, di EXACTAMENTE: "Para este caso te sugiero consultar con un técnico validado en la app."
3. NUNCA inventes nombres de bancos, leyes, URLs, números de teléfono o nombres de personas.
4. NUNCA des consejos que puedan poner en riesgo al usuario.
5. Sé breve: máximo 3 párrafos.
6. Siempre incluye una acción concreta que el usuario pueda hacer HOY.

FORMATO DE SALIDA (JSON estricto, sin texto adicional):
{
  "nivel_riesgo": "bajo|medio|alto|critico",
  "explicacion": "texto simple explicando por qué",
  "acciones_inmediatas": ["acción 1", "acción 2", "acción 3"],
  "recomienda_experto": true|false,
  "mensaje_experto": "texto si recomienda_experto es true"
}`
}
