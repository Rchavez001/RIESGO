// Shared between run-news-agent (fetch+generate in one pg_cron/Puter.js cycle)
// and quiz-generator (Phase 5: on-demand, takes an already-extracted sources
// payload and only does the AI generation step). Extracted verbatim from
// run-news-agent once quiz-generator needed the same Vault-backed,
// timeout-aware, multi-provider-type fallback chain — kept in one place so
// the two functions can't drift out of sync on how a provider is called.

import { isPrivateIpv4, publicHttpUrlProblem } from './url-guard.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.11.0'
import mammoth from 'https://esm.sh/mammoth@1.8.0'

export interface ImageAttachment {
  data: string // base64, no data: prefix
  mimeType: string
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export interface GeneratedQuestion {
  dojo_id?: string
  question_text: string
  answer_text: string
  wrong_answers?: string[]
  explanation: string
  difficulty?: number
  source_url: string
  source_title?: string
}

export interface GeneratedKataCase {
  question_text: string
  answer_text: string
  wrong_answers?: string[]
  explanation: string
  difficulty?: number
}

export interface GeneratedKata {
  dojo_id?: string
  title: string
  cases: GeneratedKataCase[]
  source_url: string
  source_title?: string
}

export const RESPONSE_FORMAT_SPEC = {
  generated_questions: [{
    dojo_id: 'string (uno de los ids de dojos recibidos)',
    question_text: 'string',
    answer_text: 'string (la respuesta correcta)',
    wrong_answers: ['string', 'string', 'string'],
    explanation: 'string',
    difficulty: '1 a 5',
    source_url: 'string (una de las urls recibidas)',
    source_title: 'string (titulo del articulo de donde salio)',
  }],
  generated_katas: [{
    dojo_id: 'string (uno de los ids de dojos recibidos)',
    title: 'string',
    source_url: 'string',
    source_title: 'string',
    cases: [{ question_text: 'string', answer_text: 'string', wrong_answers: ['string'], explanation: 'string', difficulty: '1 a 5' }],
  }],
}

export interface ProviderAttempt {
  provider_key: string
  status: 'success' | 'error' | 'timeout'
  latency_ms: number
  error: string | null
}

export class ProviderChainError extends Error {
  attempts: ProviderAttempt[]
  constructor(message: string, attempts: ProviderAttempt[]) {
    super(message)
    this.attempts = attempts
  }
}

export class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getStatus(error: unknown) {
  return error instanceof HttpError ? error.status : 500
}

export function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

// Tries agent_provider_assignments in priority order (Vault-backed keys),
// recording every attempt — success, error, or timeout — so a failed run
// always shows exactly what was tried and why, never just a final error.
export async function runProviderChain(
  agentConfigId: string,
  promptTemplate: string,
  payload: Record<string, unknown>,
  images: ImageAttachment[] = [],
) {
  const { data: assignments } = await supabase
    .from('agent_provider_assignments')
    .select('priority, timeout_seconds, ai_providers(provider_key, provider_type, model_name, base_url, api_key_secret_id, default_timeout_seconds, active)')
    .eq('agent_config_id', agentConfigId)
    .eq('active', true)
    .order('priority', { ascending: true })

  const chain = (assignments ?? [])
    .map((a) => {
      const provider = Array.isArray(a.ai_providers) ? a.ai_providers[0] : a.ai_providers
      if (!provider || !provider.active) return null
      return { ...provider, timeout_seconds: a.timeout_seconds ?? provider.default_timeout_seconds ?? 30 }
    })
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  if (chain.length === 0) {
    throw new ProviderChainError('No hay proveedores de IA activos asignados a este agente.', [])
  }

  const attempts: ProviderAttempt[] = []

  for (const provider of chain) {
    const startedAt = Date.now()
    try {
      if (!provider.api_key_secret_id) {
        throw new Error('Este proveedor no tiene una clave guardada en Vault.')
      }
      const { data: apiKey, error: secretError } = await supabase.rpc('get_decrypted_secret', { secret_id: provider.api_key_secret_id })
      if (secretError || !apiKey) throw new Error('No se pudo leer la clave del proveedor desde Vault.')

      const content = await callProviderGeneric(provider, apiKey, promptTemplate, payload, images)
      attempts.push({ provider_key: provider.provider_key, status: 'success', latency_ms: Date.now() - startedAt, error: null })
      return { content, providerKey: provider.provider_key, attempts }
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError'
      attempts.push({
        provider_key: provider.provider_key,
        status: isAbort ? 'timeout' : 'error',
        latency_ms: Date.now() - startedAt,
        error: (error as Error).message,
      })
    }
  }

  throw new ProviderChainError('Todos los proveedores fallaron.', attempts)
}

// Generic enough to cover any OpenAI-compatible chat_completion endpoint
// (DeepSeek, Kimi/Moonshot, Groq, OpenRouter, Mistral, ...) via base_url,
// plus the two shapes that aren't OpenAI-compatible: Anthropic's messages
// API and Google's generateContent API.
export async function callProviderGeneric(
  provider: { provider_key: string; provider_type: string; model_name: string; base_url: string | null; timeout_seconds: number },
  apiKey: string,
  promptTemplate: string,
  payload: Record<string, unknown>,
  images: ImageAttachment[] = [],
): Promise<string> {
  const timeoutMs = Math.max(1, provider.timeout_seconds) * 1000

  if (provider.provider_type === 'messages') {
    const url = provider.base_url || 'https://api.anthropic.com/v1/messages'
    const content = [
      ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.data } })),
      { type: 'text', text: JSON.stringify(payload) },
    ]
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: provider.model_name,
        max_tokens: 4000,
        temperature: 0.2,
        system: promptTemplate,
        messages: [{ role: 'user', content }],
      }),
    }, timeoutMs)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    const data = await response.json()
    return data.content?.[0]?.text ?? '{}'
  }

  if (provider.provider_type === 'generative_language') {
    const base = provider.base_url || 'https://generativelanguage.googleapis.com/v1beta'
    const url = `${base}/models/${provider.model_name}:generateContent?key=${apiKey}`
    const parts = [
      ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
      { text: JSON.stringify(payload) },
    ]
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: `${promptTemplate}\n\nResponde unicamente con JSON valido, sin texto adicional ni bloques de codigo.` }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 4000, temperature: 0.2, responseMimeType: 'application/json' },
      }),
    }, timeoutMs)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  }

  // Default: OpenAI-compatible chat_completion.
  const url = provider.base_url || 'https://api.openai.com/v1/chat/completions'
  const userContent = images.length === 0
    ? JSON.stringify(payload)
    : [
      { type: 'text', text: JSON.stringify(payload) },
      ...images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } })),
    ]
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: provider.model_name,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: promptTemplate },
        { role: 'user', content: userContent },
      ],
    }),
  }, timeoutMs)
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? '{}'
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export interface SourceResult {
  url: string
  name: string
  ok: boolean
  error?: string
  text?: string
}

const MAX_SOURCE_BYTES = 512 * 1024
const MAX_REDIRECTS = 3

// Fetches an administrator-configured URL without being an SSRF proxy: only public http(s) hosts (also after each
// redirect, which is followed by hand), resolved addresses must be public, and the body is capped.
async function fetchPublicPage(startUrl: string, timeoutMs: number): Promise<Response> {
  let url = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const problem = publicHttpUrlProblem(url)
    if (problem) throw new Error(problem)
    try {
      const host = new URL(url).hostname
      const addresses = await Deno.resolveDns(host, 'A').catch(() => [] as string[])
      if (addresses.some(isPrivateIpv4)) throw new Error('El dominio apunta a una dirección privada.')
    } catch (error) {
      if ((error as Error).message.startsWith('El dominio')) throw error
    }
    const response = await fetchWithTimeout(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'CiberDojoNewsAgent/1.0 (+https://ciberdojo.app)' },
    }, timeoutMs)
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      url = new URL(response.headers.get('location')!, url).toString()
      continue
    }
    return response
  }
  throw new Error('Demasiadas redirecciones.')
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < maxBytes) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    total += value.length
  }
  await reader.cancel().catch(() => {})
  const all = new Uint8Array(Math.min(total, maxBytes))
  let offset = 0
  for (const chunk of chunks) {
    const room = all.length - offset
    if (room <= 0) break
    all.set(chunk.subarray(0, room), offset)
    offset += Math.min(chunk.length, room)
  }
  return new TextDecoder('utf-8').decode(all)
}

export async function fetchSource(source: { url: string; name: string }): Promise<SourceResult> {
  try {
    const response = await fetchPublicPage(source.url, 15000)

    if (!response.ok) {
      return { url: source.url, name: source.name, ok: false, error: `HTTP ${response.status}` }
    }

    const html = await readCapped(response, MAX_SOURCE_BYTES)
    const text = htmlToPlainText(html).slice(0, 6000)
    return { url: source.url, name: source.name, ok: true, text }
  } catch (error) {
    return { url: source.url, name: source.name, ok: false, error: (error as Error).message }
  }
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
}

export function isImageFile(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS[ext] ?? null
}

// Extracts plain text from an uploaded document's raw bytes based on its
// file extension. Images are NOT handled here — they're kept as bytes and
// attached directly to the AI call instead (see ImageAttachment), since a
// vision-capable model reading the image directly beats OCR both in effort
// and in quality for this use case.
export async function extractTextFromFile(bytes: Uint8Array, fileName: string): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') {
    return new TextDecoder('utf-8').decode(bytes)
  }

  if (ext === 'pdf') {
    const pdf = await getDocumentProxy(bytes)
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  }

  if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer: bytes })
    return value
  }

  throw new Error(`Tipo de archivo no soportado: .${ext}. Usa .txt, .md, .csv, .json, .pdf, .docx, o una imagen (.png/.jpg/.webp).`)
}

export function parseJsonResponse(content: string) {
  const trimmed = content.trim()
  const normalized = trimmed.startsWith('```')
    ? trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '')
    : trimmed
  return JSON.parse(normalized)
}

// Moodle's rule #7 for multiple-choice questions: don't let the correct answer fall in the same
// position every time (an easy pattern a test-taker learns to exploit) — Fisher-Yates before
// assigning A/B/C/D letters, so the answer built at index 0 above doesn't always end up as "A".
export function shuffleOptions<T>(options: T[]): T[] {
  const shuffled = [...options]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function buildOptions(correctAnswer: string, wrongAnswers?: string[]) {
  const fallbackWrong = [
    'Ignorar la alerta y continuar operando igual',
    'Compartir credenciales para resolver mas rapido',
    'Desactivar controles de seguridad temporalmente',
  ]
  const wrong = (wrongAnswers && wrongAnswers.length > 0 ? wrongAnswers : fallbackWrong).slice(0, 3)
  const letters = ['A', 'B', 'C', 'D']
  const all = shuffleOptions([{ texto: correctAnswer, correcta: true }, ...wrong.map((texto) => ({ texto, correcta: false }))])
  return all.map((option, index) => ({ valor: letters[index] ?? String(index), ...option }))
}

export function clampDifficulty(value: unknown) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 1
  return Math.min(5, Math.max(1, Math.round(num)))
}

// Shared insert loop: writes generated_questions/generated_katas into
// `questions` as audit_status='pending', active=false — nothing reaches
// learners without a human approving it first, regardless of which function
// (run-news-agent's cycle or quiz-generator's on-demand call) produced them.
export async function insertGeneratedContent(params: {
  generatedQuestions: GeneratedQuestion[]
  generatedKatas: GeneratedKata[]
  extractedAt: string
}) {
  const { generatedQuestions, generatedKatas, extractedAt } = params
  const insertedQuestionIds: string[] = []
  let orderCounter = Date.now() % 100000

  for (const question of generatedQuestions) {
    const id = `news-${orderCounter}-${Math.random().toString(36).slice(2, 6)}`
    orderCounter += 1
    const { error } = await supabase.from('questions').insert({
      id,
      branch: question.dojo_id ?? null,
      dojo_id: question.dojo_id ?? null,
      order_num: orderCounter,
      question_text: question.question_text,
      question_type: 'escenario',
      options: buildOptions(question.answer_text, question.wrong_answers),
      active: false,
      source_type: 'news_generated',
      audit_status: 'pending',
      difficulty: clampDifficulty(question.difficulty),
      kata_label: question.source_title ? `Noticia: ${question.source_title}` : 'Noticia',
      answer_text: question.answer_text,
      explanation: question.explanation,
      source_url: question.source_url,
      source_title: question.source_title ?? null,
      extracted_at: extractedAt,
      editable: true,
    })
    if (!error) insertedQuestionIds.push(id)
    else console.error('No se pudo insertar pregunta de noticia:', error)
  }

  for (const kata of generatedKatas) {
    const kataLabel = kata.title || 'Kata de noticia'
    for (const [index, kataCase] of kata.cases.entries()) {
      const id = `news-kata-${orderCounter}-${index}`
      orderCounter += 1
      const { error } = await supabase.from('questions').insert({
        id,
        branch: kata.dojo_id ?? null,
        dojo_id: kata.dojo_id ?? null,
        order_num: index + 1,
        question_text: kataCase.question_text,
        question_type: 'escenario',
        options: buildOptions(kataCase.answer_text, kataCase.wrong_answers),
        active: false,
        source_type: 'news_generated',
        audit_status: 'pending',
        difficulty: clampDifficulty(kataCase.difficulty),
        kata_label: kataLabel,
        answer_text: kataCase.answer_text,
        explanation: kataCase.explanation,
        source_url: kata.source_url,
        source_title: kata.source_title ?? null,
        extracted_at: extractedAt,
        editable: true,
      })
      if (!error) insertedQuestionIds.push(id)
      else console.error('No se pudo insertar caso de kata de noticia:', error)
    }
  }

  return insertedQuestionIds
}

export async function requireAdminOrScheduler(req: Request) {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
    return 'scheduler'
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError('Missing authorization header', 401)

  // The central-admin-app is gated by HTTP Basic Auth at its own edge and
  // proxies every Supabase call (including this one) using the service role
  // key rather than a per-user session — there's no Supabase Auth user
  // behind an admin-panel click to look up. Supabase's own gateway already
  // verifies this token's signature before this code runs (verify_jwt), so
  // trusting the decoded role claim here grants no privilege the caller
  // didn't already have — it just distinguishes "the trusted admin panel /
  // service role called me" from an arbitrary caller.
  if (decodeJwtRole(token) === 'service_role') {
    return 'central-admin'
  }

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

function decodeJwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(payload.length + (4 - payload.length % 4) % 4, '=')
    const decoded = JSON.parse(atob(padded))
    return typeof decoded.role === 'string' ? decoded.role : null
  } catch {
    return null
  }
}
