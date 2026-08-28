import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type QuestionRecord = {
  id: string
  dojo_id: string | null
  question_text: string
  answer_text: string | null
  explanation: string | null
  options: Array<Record<string, unknown>>
}

type DraftAnswer = {
  answer: string
  sources: Array<Record<string, string>>
  matched_question_ids: string[]
  used_bank: boolean
  used_web: boolean
}

type AIProvider = {
  provider_key: string
  provider_type: string
  model_name: string
  active: boolean
}

type SenseiAuditResult = {
  answer: string
  auditor_provider: string
  auditor_model: string | null
  replaced: boolean
  notes: string | null
  started_at: string
  finished_at: string
  timeout_ms: number
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const questionText = String(body.question ?? "").trim()
    if (!questionText) return jsonResponse({ error: "La consulta esta vacia." }, 400)

    const user = await getUser(req)
    const vocabularyAnswer = buildVocabularyAnswer(questionText)
    if (vocabularyAnswer) {
      const draft: DraftAnswer = {
        answer: vocabularyAnswer.answer,
        sources: [{ type: "glossary", title: vocabularyAnswer.topic }],
        matched_question_ids: [],
        used_bank: false,
        used_web: false,
      }
      const audited = await auditSenseiAnswer(questionText, draft, {
        isCybersecurity: true,
        topic: vocabularyAnswer.topic,
        reason: "Pregunta de vocabulario de ciberseguridad detectada.",
      })

      const row = await insertConsultation({
        user_id: user?.id ?? null,
        question_text: questionText,
        normalized_topic: vocabularyAnswer.topic,
        is_cybersecurity: true,
        validation_reason: "Pregunta de vocabulario de ciberseguridad detectada.",
        draft_answer_text: draft.answer,
        answer_text: audited.answer,
        answer_sources: draft.sources,
        matched_question_ids: [],
        used_bank: false,
        used_web: false,
        auditor_provider: audited.auditor_provider,
        auditor_model: audited.auditor_model,
        auditor_notes: audited.notes,
        auditor_replaced_answer: audited.replaced,
        auditor_started_at: audited.started_at,
        auditor_finished_at: audited.finished_at,
        auditor_timeout_ms: audited.timeout_ms,
        status: "answered",
      })

      return jsonResponse({
        consultation_id: row?.id,
        is_cybersecurity: true,
        validation_reason: "Pregunta de vocabulario de ciberseguridad detectada.",
        answer: audited.answer,
        sources: draft.sources,
        ask_more_prompt: "Quieres otro ejemplo o una definicion de otro termino?",
      })
    }

    const validation = validateCyberTopic(questionText)

    if (!validation.isCybersecurity) {
      const row = await insertConsultation({
        user_id: user?.id ?? null,
        question_text: questionText,
        normalized_topic: validation.topic,
        is_cybersecurity: false,
        validation_reason: validation.reason,
        answer_text: "Puedo ayudarte con ciberseguridad, ciberdelitos, privacidad, fraudes digitales, contrasenas, MFA, phishing, ransomware, denuncias digitales y proteccion de dispositivos. Reformula tu pregunta hacia uno de esos temas y la reviso contigo.",
        status: "out_of_scope",
      })

      return jsonResponse({
        consultation_id: row?.id,
        is_cybersecurity: false,
        validation_reason: validation.reason,
        answer: row?.answer_text,
        ask_more_prompt: "Necesitas consultar algo mas sobre ciberseguridad o ciberdelitos?",
      })
    }

    const matchedQuestions = await searchQuestionBank(questionText)
    const webFindings = matchedQuestions.length >= 3 ? [] : await searchConfiguredWeb(questionText)
    const draft = buildDraftAnswer(questionText, matchedQuestions, webFindings)
    const audited = await auditSenseiAnswer(questionText, draft, validation)

    const row = await insertConsultation({
      user_id: user?.id ?? null,
      question_text: questionText,
      normalized_topic: validation.topic,
      is_cybersecurity: true,
      validation_reason: validation.reason,
      draft_answer_text: draft.answer,
      answer_text: audited.answer,
      answer_sources: draft.sources,
      matched_question_ids: draft.matched_question_ids,
      used_bank: draft.used_bank,
      used_web: draft.used_web,
      auditor_provider: audited.auditor_provider,
      auditor_model: audited.auditor_model,
      auditor_notes: audited.notes,
      auditor_replaced_answer: audited.replaced,
      auditor_started_at: audited.started_at,
      auditor_finished_at: audited.finished_at,
      auditor_timeout_ms: audited.timeout_ms,
      status: "answered",
    })

    return jsonResponse({
      consultation_id: row?.id,
      is_cybersecurity: true,
      validation_reason: validation.reason,
      answer: audited.answer,
      sources: draft.sources,
      ask_more_prompt: "Necesitas algo mas del Sensei?",
    })
  } catch (error) {
    console.error("ask-sensei failed:", error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})

async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
  if (!token) return null
  const { data } = await supabase.auth.getUser(token)
  return data.user ?? null
}

function validateCyberTopic(text: string) {
  const value = normalize(text)
  const keywords = [
    "ciber", "phishing", "smishing", "vishing", "ransomware", "malware", "virus",
    "contrasena", "contraseña", "mfa", "2fa", "doble factor", "autenticacion",
    "banco", "fraude", "estafa", "whatsapp", "correo", "enlace", "datos",
    "privacidad", "red social", "wifi", "wi-fi", "backup", "respaldo",
    "actualizacion", "vulnerabilidad", "incidente", "denuncia", "fiscalia",
    "ecucert", "arcotel", "suplantacion", "identidad", "codigo", "clave",
    "token", "otp", "jwt", "credencial", "credenciales", "llave digital",
    "api key", "apikey", "sesion", "cookie", "certificado digital",
  ]
  const matched = keywords.filter((keyword) => value.includes(normalize(keyword)))

  return {
    isCybersecurity: matched.length > 0,
    topic: matched.slice(0, 3).join(", ") || "fuera de alcance",
    reason: matched.length > 0
      ? `Tema aceptado por relacion con: ${matched.slice(0, 3).join(", ")}.`
      : "La consulta no menciona seguridad digital, ciberdelitos, fraude digital ni proteccion de datos.",
  }
}

async function searchQuestionBank(query: string) {
  const { data, error } = await supabase
    .from("questions")
    .select("id, dojo_id, question_text, answer_text, explanation, options")
    .eq("active", true)
    .eq("audit_status", "approved")
    .limit(300)

  if (error) throw error

  const queryTokens = tokenize(query)
  return ((data ?? []) as QuestionRecord[])
    .map((row) => ({ row, score: scoreQuestion(queryTokens, row) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.row)
}

function buildDraftAnswer(questionText: string, matches: QuestionRecord[], webFindings: Array<Record<string, string>>): DraftAnswer {
  if (matches.length === 0) {
    return {
      answer: [
        "Sensei valida que el tema pertenece a ciberseguridad, pero no encontro una coincidencia directa en el banco de preguntas.",
        "Recomendacion: no compartas claves, codigos temporales ni datos bancarios; verifica por canales oficiales; guarda evidencias si hay fraude; cambia credenciales desde un dispositivo confiable; y denuncia si hubo dano economico o acceso indebido.",
        "Si puedes, agrega mas contexto: canal usado, mensaje recibido, enlace, aplicacion involucrada y si ya entregaste algun dato.",
      ].join("\n\n"),
      sources: webFindings.length > 0 ? webFindings : [{ type: "fallback", title: "Buenas practicas generales Ciber Dojo" }],
      matched_question_ids: [],
      used_bank: false,
      used_web: webFindings.length > 0,
    }
  }

  const best = matches[0]
  const correct = correctOptionText(best.options) || best.answer_text || ""
  const recommendation = actionRecommendation(questionText)
  const sourceLines = matches.slice(0, 3).map((match, index) => {
    const answer = correctOptionText(match.options) || match.answer_text || "verificar por canal oficial"
    return `${index + 1}. ${match.question_text} Respuesta base: ${answer}. ${match.explanation ?? ""}`
  })

  return {
    answer: [
      "Sensei confirma que tu duda es de ciberseguridad/ciberdelito.",
      `Respuesta corta: ${recommendation || correct || "verifica por un canal oficial antes de actuar"}.`,
      best.explanation ? `Por que: ${best.explanation}` : "",
      "Aplicacion practica: detente, no hagas clic ni compartas codigos, valida con el canal oficial, guarda evidencias y cambia credenciales desde un equipo seguro si ya interactuaste.",
      `Base del dojo:\n${sourceLines.join("\n")}`,
    ].filter(Boolean).join("\n\n"),
    sources: [
      ...matches.slice(0, 5).map((match) => ({
      type: "question_bank",
      id: match.id,
      title: match.question_text,
      })),
      ...webFindings,
    ],
    matched_question_ids: matches.map((match) => match.id),
    used_bank: true,
    used_web: webFindings.length > 0,
  }
}

async function searchConfiguredWeb(query: string) {
  const endpoint = Deno.env.get("WEB_SEARCH_ENDPOINT")
  if (!endpoint) return []

  try {
    const url = new URL(endpoint)
    url.searchParams.set("q", query)
    const response = await fetch(url, {
      headers: Deno.env.get("WEB_SEARCH_API_KEY")
        ? { "Authorization": `Bearer ${Deno.env.get("WEB_SEARCH_API_KEY")}` }
        : undefined,
    })

    if (!response.ok) return []
    const payload = await response.json()
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.results) ? payload.results : []
    return items.slice(0, 3).map((item: Record<string, unknown>) => ({
      type: "web",
      title: String(item.title ?? item.name ?? "Resultado web"),
      url: String(item.url ?? item.link ?? ""),
      snippet: String(item.snippet ?? item.summary ?? ""),
    }))
  } catch (error) {
    console.error("Configured web search failed:", error)
    return []
  }
}

function actionRecommendation(questionText: string) {
  const text = normalize(questionText)
  if ((text.includes("codigo") || text.includes("clave") || text.includes("token")) && (text.includes("whatsapp") || text.includes("banco") || text.includes("llamada") || text.includes("mensaje"))) {
    return "no compartas el codigo ni la clave; corta la conversacion y contacta al banco o servicio por su aplicacion, web o telefono oficial"
  }
  if (text.includes("whatsapp") && (text.includes("banco") || text.includes("prestamo") || text.includes("credito"))) {
    return "desconfia del WhatsApp, no entregues datos ni dinero y verifica directamente con la entidad autorizada"
  }
  if (text.includes("enlace") || text.includes("link") || text.includes("correo") || text.includes("phishing")) {
    return "no abras el enlace ni adjuntos; entra por la web o aplicacion oficial y reporta el mensaje"
  }
  if (text.includes("ransomware") || text.includes("rescate") || text.includes("archivos bloqueados")) {
    return "aisla el equipo de la red, documenta evidencias, no pagues el rescate y busca respaldo limpio"
  }
  if (text.includes("contrasena") || text.includes("contraseña")) {
    return "usa contrasenas diferentes, activa MFA y cambia credenciales desde un dispositivo confiable si sospechas filtracion"
  }
  return ""
}

function buildVocabularyAnswer(questionText: string) {
  const term = detectVocabularyQuestion(questionText)
  if (!term) return null

  const entry = glossaryDefinition(term)
  if (!entry) return null

  return {
    topic: entry.title,
    answer: [
      `Definicion: ${entry.title} es ${entry.definition}`,
      `Ejemplo: ${entry.example}`,
      `Para que sirve: ${entry.purpose}`,
      `Consejo del Sensei: ${entry.advice}`,
    ].join("\n\n"),
  }
}

function detectVocabularyQuestion(value: string) {
  const text = normalize(value)
    .replace(/[¿?¡!.,:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const direct = glossaryDefinition(text)
  if (direct) return text

  const patterns = [
    /(?:que es|que significa|que quiere decir|definir|definicion de|explicame|explique|como funciona)\s+(?:el|la|los|las|un|una)?\s*(.+)/,
    /(?:me puedes explicar|puedes explicar)\s+(?:el|la|los|las|un|una)?\s*(.+)/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const candidate = cleanupVocabularyTerm(match?.[1] ?? "")
    if (candidate && glossaryDefinition(candidate)) return candidate
  }

  const knownTerms = [
    "doble factor", "autenticacion de dos factores", "autentificacion de dos factores",
    "verificacion en dos pasos", "2fa", "mfa", "phishing", "ransomware", "malware",
    "smishing", "vishing", "token", "codigo temporal", "gestor de contrasenas",
    "contrasena segura", "backup", "respaldo", "cifrado", "suplantacion de identidad",
  ]

  return knownTerms.find((term) => text.includes(term)) ?? null
}

function cleanupVocabularyTerm(value: string) {
  return value
    .replace(/\b(de|del|para|en|digital|ciberseguridad|ciberseguridad\/ciberdelito)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function glossaryDefinition(term: string) {
  const normalized = normalize(term)
    .replace(/\bautentificacion\b/g, "autenticacion")
    .replace(/\bdoble factor de autenticacion\b/g, "doble factor")
    .replace(/\bdoble factor autenticacion\b/g, "doble factor")
    .replace(/\bautenticacion multifactor\b/g, "mfa")
    .trim()

  const entries: Record<string, { title: string; definition: string; example: string; purpose: string; advice: string }> = {
    "doble factor": {
      title: "doble factor de autenticacion",
      definition: "una proteccion que pide dos pruebas para entrar a una cuenta: algo que sabes, como tu contrasena, y algo que tienes o eres, como un codigo temporal, una app autenticadora, una llave fisica o tu huella.",
      example: "primero escribes tu contrasena del correo y luego confirmas con un codigo de una app como Google Authenticator, Microsoft Authenticator o un mensaje temporal.",
      purpose: "si alguien roba tu contrasena, todavia necesita el segundo factor para entrar.",
      advice: "activalo en correo, banco, redes sociales y sistemas del negocio; evita compartir codigos por WhatsApp o llamadas.",
    },
    "autenticacion de dos factores": {
      title: "autenticacion de dos factores",
      definition: "lo mismo que doble factor: combinar dos verificaciones para confirmar que realmente eres tu.",
      example: "contrasena + codigo temporal, contrasena + notificacion en el telefono, o contrasena + llave de seguridad.",
      purpose: "reducir el riesgo de acceso no autorizado aunque la contrasena se filtre.",
      advice: "prefiere app autenticadora o llave fisica cuando sea posible; SMS es mejor que nada, pero puede ser menos seguro.",
    },
    "verificacion en dos pasos": {
      title: "verificacion en dos pasos",
      definition: "un metodo de inicio de sesion que agrega un segundo paso despues de la contrasena.",
      example: "despues de poner tu clave, el servicio te pide aprobar desde tu celular.",
      purpose: "dificultar que un atacante entre solo con una clave robada.",
      advice: "guarda codigos de recuperacion en un lugar seguro y no los compartas.",
    },
    "2fa": {
      title: "2FA",
      definition: "la abreviatura en ingles de autenticacion de dos factores.",
      example: "clave + codigo de seis digitos generado por una app.",
      purpose: "confirmar tu identidad con dos barreras distintas.",
      advice: "habilitalo en las cuentas mas importantes del negocio.",
    },
    "mfa": {
      title: "MFA",
      definition: "autenticacion multifactor: usar dos o mas factores para verificar identidad.",
      example: "contrasena, app autenticadora y huella digital.",
      purpose: "dar mas seguridad que una sola contrasena.",
      advice: "para cuentas administrativas, usa MFA siempre.",
    },
    "phishing": {
      title: "phishing",
      definition: "un engaño donde alguien se hace pasar por una entidad confiable para robar claves, codigos o dinero.",
      example: "un correo falso del banco que te lleva a una pagina parecida a la real.",
      purpose: "el atacante busca que actues rapido sin verificar.",
      advice: "no uses enlaces del mensaje; entra por la app o pagina oficial.",
    },
    "ransomware": {
      title: "ransomware",
      definition: "un programa malicioso que bloquea o cifra archivos y pide dinero para liberarlos.",
      example: "la computadora muestra una nota de rescate y los documentos ya no abren.",
      purpose: "extorsionar a la victima.",
      advice: "aisla el equipo, revisa respaldos limpios y no pagues sin asesoria.",
    },
    "malware": {
      title: "malware",
      definition: "software malicioso diseñado para dañar, espiar o tomar control de un equipo.",
      example: "un archivo adjunto que instala un programa espia.",
      purpose: "robar informacion, interrumpir operaciones o abrir acceso al atacante.",
      advice: "mantén equipos actualizados y evita instalar archivos desconocidos.",
    },
    "smishing": {
      title: "smishing",
      definition: "phishing realizado por SMS o mensajes de texto.",
      example: "un SMS dice que tu paquete esta retenido y pide abrir un enlace.",
      purpose: "llevarte a una pagina falsa o pedir datos.",
      advice: "verifica desde la web oficial del servicio.",
    },
    "vishing": {
      title: "vishing",
      definition: "fraude por llamada telefonica donde intentan obtener datos, claves o codigos.",
      example: "alguien llama diciendo ser del banco y pide el codigo que llego al celular.",
      purpose: "convencerte de entregar informacion sensible.",
      advice: "cuelga y llama al numero oficial de la institucion.",
    },
    "token": {
      title: "token",
      definition: "una credencial o llave digital, a veces tambien fisica, que sirve para verificar identidad, otorgar permisos, mantener una sesion o reemplazar datos sensibles para protegerlos.",
      example: "un codigo de seis digitos para entrar a banca en linea, un token de sesion que mantiene abierta una app, un JWT para una API o una llave fisica de seguridad.",
      purpose: "permitir acceso o confirmar acciones sin exponer siempre la contrasena o el dato sensible original.",
      advice: "trata los tokens como contrasenas: no los compartas, no los publiques en capturas o repositorios y revocalos si sospechas filtracion.",
    },
    "codigo temporal": {
      title: "codigo temporal",
      definition: "un codigo que dura poco tiempo y sirve para confirmar una accion o inicio de sesion.",
      example: "un codigo que cambia cada 30 segundos en una app autenticadora.",
      purpose: "evitar que una clave robada sea suficiente para entrar.",
      advice: "si alguien te lo pide por chat o llamada, probablemente es fraude.",
    },
    "gestor de contrasenas": {
      title: "gestor de contrasenas",
      definition: "una aplicacion que guarda y genera contrasenas largas y unicas.",
      example: "Bitwarden, 1Password o el gestor integrado del navegador bien protegido.",
      purpose: "no reutilizar claves ni depender de memoria o notas inseguras.",
      advice: "protege el gestor con una clave maestra fuerte y MFA.",
    },
    "contrasena segura": {
      title: "contrasena segura",
      definition: "una clave larga, unica y dificil de adivinar.",
      example: "una frase larga o una clave generada por un gestor.",
      purpose: "reducir el riesgo de adivinacion o reutilizacion.",
      advice: "no uses datos personales ni la misma clave en varios servicios.",
    },
    "backup": {
      title: "backup o respaldo",
      definition: "una copia de seguridad de informacion importante.",
      example: "copias automaticas de facturas y base de clientes en un lugar separado.",
      purpose: "recuperar operaciones si hay borrado, daño, robo o ransomware.",
      advice: "prueba la restauracion; un backup no probado es una esperanza, no una garantia.",
    },
    "respaldo": {
      title: "respaldo o backup",
      definition: "una copia de seguridad de informacion importante.",
      example: "copias automaticas de facturas y base de clientes en un lugar separado.",
      purpose: "recuperar operaciones si hay borrado, daño, robo o ransomware.",
      advice: "mantén al menos una copia desconectada o protegida contra cambios.",
    },
    "cifrado": {
      title: "cifrado",
      definition: "una tecnica que convierte informacion en un formato ilegible sin la clave correcta.",
      example: "un disco cifrado protege archivos si se pierde la laptop.",
      purpose: "proteger confidencialidad.",
      advice: "guarda las claves de recuperacion en un lugar seguro.",
    },
    "suplantacion de identidad": {
      title: "suplantacion de identidad",
      definition: "cuando alguien se hace pasar por otra persona o entidad para engañar.",
      example: "un perfil falso de soporte tecnico pide tus datos de acceso.",
      purpose: "ganar confianza para robar informacion o dinero.",
      advice: "verifica por canales oficiales antes de entregar datos o ejecutar pagos.",
    },
  }

  return entries[normalized]
    || entries[normalized.replace(/^el |^la |^un |^una /, "")]
    || null
}

async function auditSenseiAnswer(
  question: string,
  draft: DraftAnswer,
  validation: { isCybersecurity: boolean; topic: string; reason: string },
): Promise<SenseiAuditResult> {
  const startedAt = new Date().toISOString()
  const fallbackTimeout = 12000

  try {
    const config = await loadSenseiAuditorConfig()
    if (!config || !config.enabled || config.providers.length === 0) {
      return localAuditResult(draft, "local-rules", startedAt, fallbackTimeout)
    }

    const timeoutMs = getNumber(config.extra_settings?.timeout_ms, fallbackTimeout)
    const payload = {
      question,
      validation,
      draft_answer: draft.answer,
      sources: draft.sources,
      matched_question_ids: draft.matched_question_ids,
      rules: [
        "La pregunta puede ser de terminologia de ciberseguridad aunque no diga explicitamente ciberseguridad.",
        "Si un termino es ambiguo, responder desde el punto de vista de ciberseguridad.",
        "Si el borrador usa una respuesta base que no define el concepto, corregirlo.",
        "No responder temas fuera de ciberseguridad; indicar que debe reformularse.",
      ],
    }

    for (const provider of config.providers) {
      if (!provider.active) continue
      try {
        const content = await callAuditProvider(provider, config.prompt_template, payload, {
          timeoutMs,
          temperature: getNumber(config.extra_settings?.temperature, 0.1),
          maxTokens: getNumber(config.extra_settings?.max_tokens, 1200),
        })
        const parsed = parseJsonResponse(content)
        const answer = typeof parsed.answer === "string" && parsed.answer.trim()
          ? parsed.answer.trim()
          : draft.answer
        const replace = Boolean(parsed.replace && answer !== draft.answer)
        return {
          answer,
          auditor_provider: provider.provider_key,
          auditor_model: provider.model_name,
          replaced: replace,
          notes: typeof parsed.notes === "string" ? parsed.notes : null,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          timeout_ms: timeoutMs,
        }
      } catch (error) {
        console.error(`Sensei auditor failed with ${provider.provider_key}:`, error)
      }
    }

    return localAuditResult(draft, "all-auditors-failed", startedAt, timeoutMs)
  } catch (error) {
    console.error("Sensei audit configuration failed:", error)
    return localAuditResult(draft, "audit-config-error", startedAt, fallbackTimeout)
  }
}

async function loadSenseiAuditorConfig() {
  const { data: config, error } = await supabase
    .from("agent_configs")
    .select("*")
    .eq("agent_code", "sensei-question-auditor")
    .maybeSingle()

  if (error) throw error
  if (!config) return null

  const { data: assignments, error: assignmentsError } = await supabase
    .from("agent_provider_assignments")
    .select("priority, provider_key, ai_providers(provider_key, provider_type, model_name, active)")
    .eq("agent_config_id", config.id)
    .eq("active", true)
    .order("priority", { ascending: true })

  if (assignmentsError) throw assignmentsError

  const providers = ((assignments ?? []) as Array<{ ai_providers: AIProvider | AIProvider[] | null }>)
    .map((assignment) => Array.isArray(assignment.ai_providers) ? assignment.ai_providers[0] : assignment.ai_providers)
    .filter(Boolean) as AIProvider[]

  return {
    enabled: Boolean(config.enabled),
    prompt_template: String(config.prompt_template ?? ""),
    extra_settings: (config.extra_settings ?? {}) as Record<string, unknown>,
    providers,
  }
}

async function callAuditProvider(
  provider: AIProvider,
  promptTemplate: string,
  payload: Record<string, unknown>,
  options: { timeoutMs: number; temperature: number; maxTokens: number },
) {
  if (provider.provider_key === "deepseek" || provider.provider_key === "kimi") {
    const endpoint = provider.provider_key === "deepseek"
      ? "https://api.deepseek.com/v1/chat/completions"
      : "https://api.moonshot.ai/v1/chat/completions"
    const apiKey = provider.provider_key === "deepseek"
      ? Deno.env.get("DEEPSEEK_API_KEY")
      : Deno.env.get("KIMI_API_KEY")

    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey ?? ""}`,
      },
      body: JSON.stringify({
        model: provider.model_name,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: promptTemplate },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    }, options.timeoutMs)

    if (!response.ok) throw new Error(`${provider.provider_key} error ${response.status}: ${await response.text()}`)
    const data = await response.json()
    return data.choices?.[0]?.message?.content ?? "{}"
  }

  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: provider.model_name,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      system: promptTemplate,
      messages: [
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  }, options.timeoutMs)

  if (!response.ok) throw new Error(`${provider.provider_key} error ${response.status}: ${await response.text()}`)
  const data = await response.json()
  return data.content?.[0]?.text ?? "{}"
}

function localAuditResult(draft: DraftAnswer, provider: string, startedAt: string, timeoutMs: number): SenseiAuditResult {
  return {
    answer: draft.answer,
    auditor_provider: provider,
    auditor_model: null,
    replaced: false,
    notes: "Respuesta entregada sin correccion de auditor IA configurable.",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    timeout_ms: timeoutMs,
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function parseJsonResponse(content: string) {
  const trimmed = content.trim()
  const normalized = trimmed.startsWith("```")
    ? trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "")
    : trimmed
  return JSON.parse(normalized)
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

async function insertConsultation(payload: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("sensei_consultations")
    .insert(payload)
    .select("id, answer_text")
    .single()

  if (error) {
    console.error("Could not log sensei consultation:", error)
    return null
  }
  return data
}

function scoreQuestion(queryTokens: string[], row: QuestionRecord) {
  const text = normalize([
    row.question_text,
    row.answer_text ?? "",
    row.explanation ?? "",
    JSON.stringify(row.options ?? []),
  ].join(" "))
  return queryTokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0)
}

function correctOptionText(options: Array<Record<string, unknown>>) {
  if (!Array.isArray(options)) return ""
  const option = options.find((item) => item.correcta === true || item.is_correct === true) ?? options[0]
  return String(option?.texto ?? option?.valor ?? "")
}

function tokenize(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 24)
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
