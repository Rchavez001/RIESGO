import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, Loader, MessageCircle, Send, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react'
import { NeonButton, SectionHeader, SENSEI_IMAGE_SRC } from '../components/CyberBushido'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type SenseiAnswer = {
  consultation_id?: string
  is_cybersecurity: boolean
  validation_reason: string
  answer: string
  sources?: Array<{ type: string; id?: string; title?: string }>
  ask_more_prompt: string
}

type ChatMessage = {
  role: 'student' | 'sensei'
  text: string
  meta?: string
}

export function SenseiConsultPage() {
  const { user } = useAuth()
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'sensei',
      text: 'Soy el Sensei IA. Preguntame sobre seguridad digital, ciberdelitos, mensajes falsos, contrasenas, verificacion en dos pasos, archivos bloqueados por extorsion, privacidad, fraudes bancarios o conceptos que aparezcan en el dojo.',
    },
  ])
  const [lastAnswer, setLastAnswer] = useState<SenseiAnswer | null>(null)
  const [needsMore, setNeedsMore] = useState<boolean | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)

  async function askSensei(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setQuestion('')
    setNeedsMore(null)
    setFeedbackSent(false)
    setLastAnswer(null)
    setMessages((current) => [...current, { role: 'student', text: trimmed }])

    try {
      const { data, error } = await supabase.functions.invoke('ask-sensei', {
        body: { question: trimmed },
      })

      if (error) throw error

      const answer = data as SenseiAnswer
      setLastAnswer(answer)
      setMessages((current) => [
        ...current,
        {
          role: 'sensei',
          text: `${answer.answer}\n\n${answer.ask_more_prompt}`,
          meta: answer.validation_reason,
        },
      ])
    } catch (error) {
      console.error('Error asking Sensei:', error)
      const fallback = await localSenseiAnswer(trimmed)
      setLastAnswer(fallback)
      setMessages((current) => [
        ...current,
        {
          role: 'sensei',
          text: `${fallback.answer}\n\n${fallback.ask_more_prompt}`,
          meta: fallback.validation_reason,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function sendFeedback(helpful: boolean) {
    if (!lastAnswer?.consultation_id || !user || feedbackSent) {
      setFeedbackSent(true)
      return
    }

    const sentiment = analyzeSentiment(feedbackText, helpful)
    const { error } = await supabase
      .from('sensei_consultations')
      .update({
        feedback_helpful: helpful,
        feedback_text: feedbackText.trim() || null,
        sentiment_label: sentiment.label,
        sentiment_score: sentiment.score,
      })
      .eq('id', lastAnswer.consultation_id)
      .eq('user_id', user.id)

    if (error) console.error('Error saving Sensei feedback:', error)
    setFeedbackSent(true)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <SectionHeader eyebrow="// CONSULTA GUIADA" title="Sensei IA" kanji="問" />
      <div className="sensei-consult-layout">
        <section className="sensei-chat-panel glass-panel">
          <div className="sensei-chat-head">
            <Bot className="text-cyan-300" />
            <div>
              <span className="mono-label">VALIDA - RESPONDE - REVISA</span>
              <h2>Consulta dudas de ciberseguridad</h2>
            </div>
          </div>

          <div className="sensei-chat-log">
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`sensei-message ${message.role}`}>
                <div className="sensei-message-icon">
                  {message.role === 'sensei' ? <Bot size={18} /> : <MessageCircle size={18} />}
                </div>
                <div>
                  {message.meta && <span className="mono-label">{message.meta}</span>}
                  <p>{message.text}</p>
                </div>
              </article>
            ))}
            {loading && (
              <article className="sensei-message sensei">
                <div className="sensei-message-icon"><Loader className="animate-spin" size={18} /></div>
                <p>El Sensei valida si el tema es de seguridad digital, consulta el banco de preguntas y revisa la respuesta antes de enviarla...</p>
              </article>
            )}
          </div>

          <form className="sensei-ask-form" onSubmit={askSensei}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ejemplo: me llego un WhatsApp del banco pidiendo un codigo, que hago?"
              rows={3}
            />
            <NeonButton type="submit" color="cyan" variant="outline" className="justify-center">
              <Send size={16} />
              Preguntar
            </NeonButton>
          </form>
        </section>

        <aside className="sensei-feedback-panel glass-panel">
          <img src={SENSEI_IMAGE_SRC} alt="Sensei IA de Ciber Dojo" />
          <h2>Despues de responder</h2>
          <p>El Sensei registra la consulta para que Central Admin vea temas frecuentes, respuestas utiles y sentimiento del alumno.</p>

          {lastAnswer && (
            <div className="sensei-followup">
              <span className="mono-label">Necesitas algo mas?</span>
              <div className="sensei-choice-row">
                <button className={needsMore === true ? 'active' : ''} onClick={() => setNeedsMore(true)}>Si</button>
                <button className={needsMore === false ? 'active' : ''} onClick={() => setNeedsMore(false)}>No</button>
              </div>

              {needsMore === false && !feedbackSent && (
                <div className="sensei-feedback-box">
                  <label>
                    Fue de ayuda?
                    <textarea
                      value={feedbackText}
                      onChange={(event) => setFeedbackText(event.target.value)}
                      placeholder="Opcional: cuentanos si te ayudo o que falto."
                      rows={4}
                    />
                  </label>
                  <div className="sensei-choice-row">
                    <button onClick={() => void sendFeedback(true)}><ThumbsUp size={16} /> Si ayudo</button>
                    <button onClick={() => void sendFeedback(false)}><ThumbsDown size={16} /> No ayudo</button>
                  </div>
                </div>
              )}

              {feedbackSent && (
                <div className="sensei-saved">
                  <ShieldCheck size={18} />
                  Gracias. Tu respuesta quedo registrada para analisis estadistico.
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </motion.div>
  )
}

async function localSenseiAnswer(question: string): Promise<SenseiAnswer> {
  const isCyber = validateCyberTopic(question)
  if (!isCyber) {
    return {
      is_cybersecurity: false,
      validation_reason: 'Tema fuera del alcance del dojo.',
      answer: 'Puedo responder solo sobre ciberseguridad, ciberdelitos, privacidad, fraude digital, contrasenas, MFA, phishing, ransomware o proteccion de dispositivos.',
      ask_more_prompt: 'Necesitas consultar algo mas sobre ciberseguridad o ciberdelitos?',
    }
  }

  // Check for vocabulary-style questions first (¿Qué es X?, qué significa X, definir X)
  const vocab = detectVocabularyQuestion(question)
  if (vocab) {
    const def = glossaryDefinition(vocab)
    if (def) {
      return {
        is_cybersecurity: true,
        validation_reason: 'Pregunta de vocabulario detectada.',
        answer: `Definición breve para «${vocab}»: ${def}`,
        ask_more_prompt: 'Quieres otra definición o un ejemplo práctico?',
      }
    }
  }

  const { data } = await supabase
    .from('questions')
    .select('id, question_text, answer_text, explanation, options')
    .eq('active', true)
    .eq('audit_status', 'approved')
    .limit(80)

  const rows = (data ?? []) as Array<{
    id: string
    question_text: string
    answer_text?: string | null
    explanation?: string | null
    options?: Array<{ texto?: string; correcta?: boolean }>
  }>

  const tokens = normalize(question).split(/\s+/).filter((token) => token.length >= 4)
  const match = rows
    .map((row) => ({
      row,
      score: tokens.reduce((score, token) => score + (normalize(`${row.question_text} ${row.answer_text ?? ''} ${row.explanation ?? ''}`).includes(token) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)[0]?.row

  const recommendation = actionRecommendation(question)
  const answer = match
    ? `Respuesta corta: ${recommendation || correctOptionText(match.options) || match.answer_text}. ${match.explanation ?? ''}`
    : 'No encontre una coincidencia directa en el banco, pero aplica esta regla: no compartas codigos ni claves, verifica por canal oficial, guarda evidencias y cambia credenciales desde un dispositivo seguro si ya interactuaste.'

  return {
    is_cybersecurity: true,
    validation_reason: 'Tema aceptado por reglas locales de ciberseguridad.',
    answer,
    sources: match ? [{ type: 'question_bank', id: match.id, title: match.question_text }] : [],
    ask_more_prompt: 'Necesitas algo mas del Sensei?',
  }
}

function validateCyberTopic(value: string) {
  const text = normalize(value)
  return ['ciber', 'phishing', 'contrasena', 'contraseña', 'mfa', 'codigo', 'clave', 'fraude', 'estafa', 'banco', 'ransomware', 'malware', 'whatsapp', 'correo', 'privacidad', 'denuncia'].some((keyword) => text.includes(normalize(keyword)))
}

function actionRecommendation(value: string) {
  const text = normalize(value)
  if ((text.includes('codigo') || text.includes('clave') || text.includes('token')) && (text.includes('whatsapp') || text.includes('banco') || text.includes('llamada') || text.includes('mensaje'))) {
    return 'no compartas el codigo ni la clave; corta la conversacion y contacta al banco o servicio por su aplicacion, web o telefono oficial'
  }
  if (text.includes('enlace') || text.includes('link') || text.includes('correo') || text.includes('phishing')) {
    return 'no abras el enlace ni adjuntos; entra por la web o aplicacion oficial y reporta el mensaje'
  }
  if (text.includes('ransomware') || text.includes('rescate') || text.includes('archivos bloqueados')) {
    return 'aisla el equipo de la red, documenta evidencias, no pagues el rescate y busca respaldo limpio'
  }
  return ''
}

function correctOptionText(options?: Array<{ texto?: string; correcta?: boolean }>) {
  if (!Array.isArray(options)) return ''
  return (options.find((option) => option.correcta)?.texto ?? options[0]?.texto ?? '')
}

function analyzeSentiment(text: string, helpful: boolean) {
  const value = normalize(text)
  const positive = ['gracias', 'claro', 'ayudo', 'excelente', 'bien', 'util', 'entendi', 'perfecto']
  const negative = ['malo', 'confuso', 'no ayudo', 'no entendi', 'falta', 'incorrecto', 'pesimo']
  const score = positive.reduce((total, word) => total + (value.includes(word) ? 1 : 0), helpful ? 0.65 : 0.25)
    - negative.reduce((total, word) => total + (value.includes(word) ? 1 : 0), 0)

  if (score >= 0.5) return { label: 'positivo', score: Math.min(1, score) }
  if (score <= -0.2) return { label: 'negativo', score: Math.max(-1, score) }
  return { label: 'neutral', score: 0 }
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function detectVocabularyQuestion(value: string) {
  const text = normalize(value)
    .replace(/[¿?¡!.,:;]/g, ' ')
    .replace(/\bautentificacion\b/g, 'autenticacion')
    .replace(/\s+/g, ' ')
    .trim()
  if (glossaryDefinition(text)) return text
  const known = [
    'doble factor',
    'autenticacion de dos factores',
    'verificacion en dos pasos',
    'mfa',
    '2fa',
    'phishing',
    'ransomware',
    'malware',
    'token',
    'codigo temporal',
  ].find((term) => text.includes(term))
  if (known) return known
  // common patterns: que es, qué es, que significa, definir
  const m = text.match(/(?:que es|que significa|que quiere decir|definir|definicion de|explicame|como funciona)\s+(?:el|la|un|una)?\s*(.+)/i)
  if (m && m[1]) return m[1].replace(/\b(de|del|para|en)\b/g, ' ').replace(/\s+/g, ' ').trim()
  // if the question is a single word (term), treat as vocab
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length === 1 && tokens[0].length >= 3) return tokens[0]
  return null
}

function glossaryDefinition(term: string) {
  const t = normalize(term)
    .replace(/\bautentificacion\b/g, 'autenticacion')
    .replace(/\bdoble factor de autenticacion\b/g, 'doble factor')
    .trim()
  const G: Record<string, string> = {
    phishing: 'Técnica de engaño donde un atacante se hace pasar por una entidad confiable para obtener credenciales o datos personales.',
    ransomware: 'Tipo de software malicioso que cifra archivos y exige un pago para restaurarlos.',
    mfa: 'Autenticación de múltiples factores: usar dos o más pruebas (ej. contraseña + código) para verificar identidad.',
    'verificacion en dos pasos': 'Mecanismo que añade un segundo factor para confirmar la identidad del usuario.',
    'contraseña': 'Secreto conocido solo por el usuario que sirve para autenticarse en un sistema.',
    'contraseña segura': 'Una clave larga y única, idealmente generada por un gestor, que combina letras, números y símbolos.',
    'phishing sms': 'Phishing que ocurre por mensajes de texto (smishing).',
    'token': 'Código temporal usado como segundo factor o para verificar transacciones.',
    'mfa token': 'Token usado dentro de un segundo factor de autenticación.',
  }
  return G[t] || G[t.replace(/s$/, '')] || ''
}
