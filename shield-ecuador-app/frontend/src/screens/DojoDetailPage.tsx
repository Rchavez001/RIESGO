import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BeltBadge, NeonButton, SectionHeader } from '../components/CyberBushido'
import { CompanionPicker } from '../components/DojoCompanion'
import { LearningFeedback, LearningTerms } from '../components/LearningHelpers'
import { learningCall, learningDojos, LearningState } from '../services/learning'
import { useAuth } from '../contexts/AuthContext'

const GUEST_QUESTION_LIMIT = 10

export function DojoDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const dojo = learningDojos.find(d => d.id === id)
  const [state, setState] = useState<LearningState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const inFlight = useRef(false)
  const isGuest = Boolean(user?.is_anonymous)
  const promptRef = useRef<HTMLHeadingElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const shownQuestion = useRef<string | null>(null)
  const justAnswered = useRef(false)
  useEffect(() => {
    const generation = ++request.current
    setState(null); setError('')
    if (!dojo || !user) return
    setBusy(true)
    learningCall<LearningState>('learning_state', { p_dojo: dojo.id })
      .then(value => { if (request.current === generation) setState(value) })
      .catch(e => { if (request.current === generation) setError(e.message) })
      .finally(() => { if (request.current === generation) setBusy(false) })
    return () => { request.current = generation + 1 }
  }, [dojo, user])
  const questionId = state?.question?.id
  const answeredNow = state?.selected !== null && state?.selected !== undefined
  useEffect(() => {
    // A new question replaces the old one in place: without this the page stays scrolled at the
    // bottom (where "Continuar" was) and keyboard/screen-reader focus points at a removed button.
    if (!questionId) return
    if (shownQuestion.current && shownQuestion.current !== questionId) {
      const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      promptRef.current?.scrollIntoView({ block: 'start', behavior })
      promptRef.current?.focus({ preventScroll: true })
    }
    shownQuestion.current = questionId
  }, [questionId])
  useEffect(() => {
    // After picking an answer the explanation is what matters: bring it into view and announce it.
    if (!answeredNow || !justAnswered.current) return
    justAnswered.current = false
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    feedbackRef.current?.scrollIntoView({ block: 'center', behavior })
    feedbackRef.current?.focus({ preventScroll: true })
  }, [answeredNow, questionId])

  async function act(name: string, args: Record<string, unknown>) {
    if (inFlight.current) return
    inFlight.current = true
    const generation = request.current
    setBusy(true); setError('')
    if (name === 'learning_answer') justAnswered.current = true
    try {
      const value = await learningCall<LearningState>(name, args)
      if (generation === request.current) setState(value)
    } catch (e) {
      if (generation === request.current) setError((e as Error).message)
    } finally {
      inFlight.current = false
      if (generation === request.current) setBusy(false)
    }
  }
  if (!dojo) return <div className="learning-page"><div className="glass-panel learning-intro" role="alert"><p>No encontramos este dojo.</p><NeonButton color="cyan" variant="outline" onClick={() => navigate('/dojos')}>Volver a dojos</NeonButton></div></div>
  const q = state?.question
  const answered = state?.selected !== null && state?.selected !== undefined
  return <div className="learning-page">
    <SectionHeader eyebrow="ENTRENAMIENTO · A TU RITMO" title={dojo.title} kanji="道" />
    <div className={`learning-intro glass-panel${state && state.answered > 0 ? ' is-secondary' : ''}`}><BeltBadge level={dojo.belt} />
      <p>Practica 30 preguntas para preparar tu examen. Equivocarte también ayuda a aprender. Puedes salir y continuar desde donde te quedaste.</p></div>
    {isGuest && <p className="learning-guest-note" role="note">Estás en modo invitado: puedes practicar hasta {GUEST_QUESTION_LIMIT} preguntas de este dojo y tu avance no se guarda. <Link to="/registro">Regístrate gratis</Link> para conservarlo, desbloquear más dojos y seguir sin límite.</p>}
    {error && <div role="alert" className="combat-feedback"><p>{error}</p><NeonButton onClick={() => act('learning_state', { p_dojo: dojo.id })} disabled={busy}>Recuperar mi avance</NeonButton></div>}
    {!state && busy && <p role="status">Recuperando tu última pregunta…</p>}
    {state && q && <div className="combat-layout learning-layout">
      <aside className="combat-panel learning-companion"><p className="mono-label">TU COMPAÑERO DE PRÁCTICA</p>
        <CompanionPicker />
        <p>No hay límite de tiempo. Lee con calma y elige lo que harías.</p></aside>
      <section className="combat-panel question-card glass-panel" aria-busy={busy}>
        <div className="hero-badge">Pregunta {state.cursor + 1} de {isGuest ? GUEST_QUESTION_LIMIT : 30} · {q.topic}</div>
        <progress className="learning-progress" value={state.answered} max={isGuest ? GUEST_QUESTION_LIMIT : 30} aria-label={`${state.answered} preguntas respondidas de ${isGuest ? GUEST_QUESTION_LIMIT : 30}`} />
        <p className="learning-save">{busy ? 'Guardando…' : isGuest ? `${state.answered} de ${GUEST_QUESTION_LIMIT} respuestas de prueba, sin guardar` : `${state.answered} de 30 respuestas guardadas en tu cuenta`}</p>
        <h2 className="learning-prompt" ref={promptRef} tabIndex={-1}>{q.prompt}</h2><LearningTerms item={q} />
        <div className="answer-grid">{q.options.map((option, index) => <button key={`${q.id}-${index}`}
          className={`answer-option btn-katana ${answered && index === q.correct ? 'correct' : answered && index === state.selected ? 'wrong' : ''}`}
          disabled={busy || answered} onClick={() => act('learning_answer', { p_dojo: dojo.id, p_question: q.id, p_answer: index })}>
          <span>{'ABCD'[index]}. {option}</span>{answered && index === q.correct && <strong>Respuesta recomendada</strong>}
          {answered && index === state.selected && <small>Tu respuesta</small>}
        </button>)}</div>
        {answered && <div ref={feedbackRef} tabIndex={-1} className="learning-feedback-anchor"><LearningFeedback item={q} selected={state.selected!} /></div>}
        <div className="learning-actions">
          {answered && isGuest && state.answered >= GUEST_QUESTION_LIMIT ? (
            <div className="glass-panel combat-feedback" role="status">
              <h3>Regístrate para tener la experiencia completa</h3>
              <p>Como invitado ya practicaste {GUEST_QUESTION_LIMIT} preguntas. Crea una cuenta gratis para seguir con las 30 de este dojo, desbloquear el resto, el kata y el Sensei — toma menos de un minuto.</p>
              <NeonButton color="gold" onClick={() => navigate('/registro')}>Regístrate gratis</NeonButton>
            </div>
          ) : answered && state.cursor < 29 && <NeonButton color="cyan" disabled={busy}
            onClick={() => act('learning_next', { p_dojo: dojo.id, p_question: q.id })}>Ya leí la explicación · Continuar</NeonButton>}
          {state.complete && <div role="status"><h3>Completaste las 30 preguntas</h3>
            <p>Ya puedes presentar tu kata: cinco casos, con el último más desafiante. Necesitas cuatro aciertos para aprobar.</p>
            <NeonButton color="gold" disabled={busy} onClick={() => navigate(`/kata/${dojo.exam_code}`)}>Presentar mi examen</NeonButton></div>}
          <NeonButton color="cyan" variant="ghost" onClick={() => navigate('/dojos')}>Salir del dojo</NeonButton>
        </div>
      </section>
    </div>}
  </div>
}
