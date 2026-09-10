import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BeltBadge, NeonButton, SectionHeader } from '../components/CyberBushido'
import { CompanionPicker } from '../components/DojoCompanion'
import { LearningFeedback, LearningTerms } from '../components/LearningHelpers'
import { learningCall, learningDojos, LearningState } from '../services/learning'
import { useAuth } from '../contexts/AuthContext'

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
  async function act(name: string, args: Record<string, unknown>) {
    if (inFlight.current) return
    inFlight.current = true
    const generation = request.current
    setBusy(true); setError('')
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
  if (!dojo) return <div className="glass-panel p-8">No encontramos este dojo. <button onClick={() => navigate('/dojos')}>Volver a dojos</button></div>
  const q = state?.question
  const answered = state?.selected !== null && state?.selected !== undefined
  return <div className="learning-page">
    <SectionHeader eyebrow="ENTRENAMIENTO · A TU RITMO" title={dojo.title} kanji="道" />
    <div className="learning-intro glass-panel"><BeltBadge level={dojo.belt} />
      <p>Practica 30 preguntas para preparar tu examen. Equivocarte también ayuda a aprender. Puedes salir y continuar desde donde te quedaste.</p></div>
    {error && <div role="alert" className="combat-feedback"><p>{error}</p><NeonButton onClick={() => act('learning_state', { p_dojo: dojo.id })} disabled={busy}>Recuperar mi avance</NeonButton></div>}
    {!user && <p>Inicia sesión para guardar tu avance.</p>}
    {!state && busy && <p role="status">Recuperando tu última pregunta…</p>}
    {state && q && <div className="combat-layout learning-layout">
      <aside className="combat-panel learning-companion"><p className="mono-label">TU COMPAÑERO DE PRÁCTICA</p>
        <CompanionPicker />
        <p>No hay límite de tiempo. Lee con calma y elige lo que harías.</p></aside>
      <section className="combat-panel question-card glass-panel" aria-busy={busy}>
        <div className="hero-badge">Pregunta {state.cursor + 1} de 30 · {q.topic}</div>
        <progress className="learning-progress" value={state.answered} max={30} aria-label={`${state.answered} preguntas respondidas de 30`} />
        <p className="learning-save">{busy ? 'Guardando…' : `${state.answered} de 30 respuestas guardadas en tu cuenta`}</p>
        <h2 className="learning-prompt">{q.prompt}</h2><LearningTerms item={q} />
        <div className="answer-grid">{q.options.map((option, index) => <button key={`${q.id}-${index}`}
          className={`answer-option btn-katana ${answered && index === q.correct ? 'correct' : answered && index === state.selected ? 'wrong' : ''}`}
          disabled={busy || answered} onClick={() => act('learning_answer', { p_dojo: dojo.id, p_question: q.id, p_answer: index })}>
          <span>{'ABCD'[index]}. {option}</span>{answered && index === q.correct && <strong>Respuesta recomendada</strong>}
          {answered && index === state.selected && <small>Tu respuesta</small>}
        </button>)}</div>
        {answered && <LearningFeedback item={q} selected={state.selected!} />}
        <div className="learning-actions">
          {answered && state.cursor < 29 && <NeonButton color="cyan" disabled={busy}
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
