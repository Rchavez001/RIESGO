import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type VulnCheckInput = {
  id: string
  nombre: string
  tecnico: string
  riesgo: string
  explicacion_simple: string
  instruccion_extra?: string
}

type SystemInfo = {
  os: string
  osVersion: string
  browser: string
  browserVersion: string
  deviceType: string
}

type SenseiRequest = {
  mode: "sensei"
  vulnerabilidad: VulnCheckInput
  sistemaDetectado: SystemInfo
}

type AuditorRequest = {
  mode: "auditor"
  vulnerabilidad: VulnCheckInput
  respuestaOriginal: string
}

type RequestBody = SenseiRequest | AuditorRequest

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json()
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? ""

    if (!apiKey) {
      return jsonResponse({ error: "Servicio de IA no configurado." }, 503)
    }

    if (body.mode === "sensei") {
      const { vulnerabilidad, sistemaDetectado } = body
      const systemPrompt = `Eres el SENSEI de Cyber Dojo, un maestro de ciberseguridad que habla con pequeños empresarios y empleados NO técnicos de Ecuador.

Tu misión: dar recomendaciones de seguridad usando:
- Analogías de la vida cotidiana (no jerga técnica)
- Metáforas de artes marciales cuando sea natural
- Pasos concretos y simples (máximo 4 pasos numerados)
- Tono amigable y motivador, nunca alarmista
- Emojis relevantes para hacer el texto más visual
- Siempre terminar con una frase motivadora del dojo

Sistema del usuario:
SO: ${sistemaDetectado.os} ${sistemaDetectado.osVersion}
Navegador: ${sistemaDetectado.browser} ${sistemaDetectado.browserVersion}
Dispositivo: ${sistemaDetectado.deviceType}
País: Ecuador

NUNCA des información que pueda ser usada para hacer daño.
SIEMPRE ofrece alternativas gratuitas o de bajo costo para Ecuador.
Responde en español ecuatoriano natural.`

      const userPrompt = `El usuario tiene esta vulnerabilidad:
ID: ${vulnerabilidad.id}
Nombre simple: ${vulnerabilidad.nombre}
Descripción técnica: ${vulnerabilidad.tecnico}
Nivel de riesgo: ${vulnerabilidad.riesgo}
Analogía: ${vulnerabilidad.explicacion_simple}
${vulnerabilidad.instruccion_extra ? `\nINSTRUCCIÓN ESPECIAL: ${vulnerabilidad.instruccion_extra}` : ""}

Entrega:
1. Explicación simple del problema (2-3 oraciones máximo)
2. Por qué es peligroso para su negocio (ejemplo ecuatoriano concreto)
3. Cómo solucionarlo: máximo 4 pasos numerados, muy específicos
4. Tiempo estimado: (5 minutos / 1 hora / 1 día)
5. Costo estimado: (Gratis / Menos de $10 / Requiere inversión)
6. Frase motivadora del Sensei`

      const response = await callGemini(apiKey, systemPrompt, userPrompt, 900)
      return jsonResponse({ recomendacion: response })
    }

    if (body.mode === "auditor") {
      const { vulnerabilidad, respuestaOriginal } = body
      const systemPrompt = `Eres un AUDITOR DE CALIDAD de respuestas de ciberseguridad para usuarios no técnicos.
Evalúa y responde ÚNICAMENTE en formato JSON válido, sin texto adicional.`

      const userPrompt = `Audita esta respuesta de ciberseguridad:

VULNERABILIDAD: ${vulnerabilidad.nombre} (Riesgo: ${vulnerabilidad.riesgo})
RESPUESTA:
---
${respuestaOriginal}
---

Devuelve exactamente este JSON:
{
  "aprobada": boolean,
  "puntaje": number,
  "criterios": {
    "lenguaje_simple": boolean,
    "tecnicamente_correcto": boolean,
    "no_alarmista": boolean,
    "pasos_concretos": boolean,
    "costo_realista": boolean,
    "sin_info_peligrosa": boolean,
    "maximo_4_pasos": boolean,
    "tiene_motivacion": boolean
  },
  "problemas_encontrados": [],
  "sugerencia_mejora": ""
}`

      const response = await callGemini(apiKey, systemPrompt, userPrompt, 800)
      try {
        const clean = response.replace(/```json|```/g, "").trim()
        const parsed = JSON.parse(clean)
        return jsonResponse(parsed)
      } catch {
        return jsonResponse({ aprobada: false, puntaje: 0, problemas_encontrados: ["Error al parsear"], sugerencia_mejora: "Respuesta JSON inválida" })
      }
    }

    return jsonResponse({ error: "Modo inválido." }, 400)
  } catch (error) {
    console.error("vuln-scanner-ai error:", error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})

async function callGemini(apiKey: string, system: string, userContent: string, maxTokens: number): Promise<string> {
  const model = "gemini-2.0-flash"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
