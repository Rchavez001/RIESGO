import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SectionHeader } from '../components/CyberBushido'
import { learningCall } from '../services/learning'

interface QuestionPayload {
  index: number
  question_id: string
  prompt: string
  options: string[]
  time_limit_seconds: number
}

interface StartResult {
  match_id: string
  question: QuestionPayload
  score_so_far: number
  remaining_seconds: number
  answered_so_far: number
  total_questions: number
}

interface AnswerResult {
  correct: boolean
  correct_index: number
  explanation: string
  has_next: boolean
  finished: boolean
}

// The per-question clock lives on the server: it starts when a question is opened (championship_start_match),
// keeps running if the page is reloaded, and a late answer is graded wrong there. This countdown is a
// deadline-based display of that clock (it stays correct in background tabs, unlike a 1 s setTimeout chain).
export function ChampionshipMatchPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const [question, setQuestion] = useState<QuestionPayload | null>(null)
  const [total, setTotal] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<AnswerResult | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [finished, setFinished] = useState(false)
  const [fatal, setFatal] = useState('')
  const [nextError, setNextError] = useState('')
  const [busy, setBusy] = useState(false)
  const submittingRef = useRef(false)
  const deadline = useRef(0)
  const promptRef = useRef<HTMLHeadingElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)

  const open = useCallback(async () => {
    if (!matchId) return
    const d = await learningCall<StartResult>('championship_start_match', { p_match_id: matchId })
    deadline.current = Date.now() + d.remaining_seconds * 1000
    setTimeLeft(d.remaining_seconds)
    setTotal(d.total_questions)
    setAnsweredCount(d.answered_so_far)
    setSelected(null)
    setFeedback(null)
    setQuestion(d.question)
    submittingRef.current = false
  }, [matchId])

  useEffect(() => {
    open().catch((e) => setFatal(e instanceof Error ? e.message : 'No pudimos iniciar el combate.'))
  }, [open])

  const submitAnswer = useCallback(async (answerIndex: number) => {
    if (!matchId || submittingRef.current) return
    submittingRef.current = true
    setBusy(true)
    try {
      const result = await learningCall<AnswerResult>('championship_answer_question', { p_match_id: matchId, p_answer_index: answerIndex })
      setFeedback(result)
      setAnsweredCount((n) => n + 1)
      if (result.correct) setCorrectCount((n) => n + 1)
      if (result.finished) setFinished(true)
    } catch (e) {
      submittingRef.current = false
      setFatal(e instanceof Error ? e.message : 'No pudimos enviar tu respuesta.')
    } finally {
      setBusy(false)
    }
  }, [matchId])

  useEffect(() => {
    if (!question || feedback) return
    const tick = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))
      setTimeLeft(left)
      if (left <= 0) { window.clearInterval(tick); void submitAnswer(-1) }
    }, 250)
    return () => window.clearInterval(tick)
  }, [question, feedback, submitAnswer])

  useEffect(() => {
    // The explanation is what matters right after answering; a new question needs the reader at its top.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (feedback && !finished) { feedbackRef.current?.focus({ preventScroll: true }); feedbackRef.current?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }) }
  }, [feedback, finished])
  useEffect(() => {
    if (question && !feedback && question.index > 0) { promptRef.current?.focus({ preventScroll: true }); promptRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }) }
  }, [question, feedback])
  useEffect(() => { if (finished) doneRef.current?.focus({ preventScroll: true }) }, [finished])

  const goToNext = async () => {
    setNextError('')
    setBusy(true)
    try { await open() } catch (e) { setNextError(e instanceof Error ? e.message : 'No pudimos abrir la siguiente pregunta.') } finally { setBusy(false) }
  }

  if (fatal) {
    return (
      <div className="learning-page champ-page">
        <SectionHeader eyebrow="CAMPEONATO" title="Tu combate" kanji="優" />
        <div className="glass-panel" role="alert"><p>{fatal}</p></div>
        <button type="button" className="cinema-button" onClick={() => navigate('/campeonato')}>Volver al campeonato</button>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="learning-page champ-page">
        <SectionHeader eyebrow="CAMPEONATO" title="Combate completado" kanji="優" />
        <div className="glass-panel">
          <h2 ref={doneRef} tabIndex={-1}>¡Terminaste tu combate!</h2>
          <p>Respondiste correctamente {correctCount} de {answeredCount} preguntas.</p>
          <p className="muted">El resultado final se decide cuando ambos participantes terminan.</p>
          <button type="button" className="cinema-button" onClick={() => navigate('/campeonato')}>Volver al campeonato</button>
        </div>
      </div>
    )
  }

  if (!question) {
    return (
      <div className="learning-page champ-page">
        <SectionHeader eyebrow="CAMPEONATO" title="Tu combate" kanji="優" />
        <p role="status">Cargando tu combate…</p>
      </div>
    )
  }

  const urgent = !feedback && timeLeft <= 10
  return (
    <div className="learning-page champ-page">
      <SectionHeader eyebrow="CAMPEONATO" title="Tu combate" kanji="優" />
      <div className="glass-panel">
        <p className="cinema-eyebrow">PREGUNTA {question.index + 1}{total ? ` DE ${total}` : ''}</p>
        {total > 0 && <progress className="learning-progress" value={question.index} max={total} aria-label="Preguntas respondidas" />}
        <div className={`champ-timer${urgent ? ' urgent' : ''}`} role="timer" aria-label="Tiempo restante">
          <span>{feedback ? 'Respuesta enviada' : <>Tiempo restante: <strong>{timeLeft} s</strong></>}</span>
          {!feedback && <span className="champ-timer-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (timeLeft / question.time_limit_seconds) * 100)}%` }} /></span>}
        </div>
        {/* Screen readers hear the clock only at the moments that matter, not every second. */}
        <p className="sr-only" role="status">{!feedback && (timeLeft === 10 || timeLeft === 5) ? `Quedan ${timeLeft} segundos.` : ''}</p>
        <h2 className="learning-prompt" ref={promptRef} tabIndex={-1}>{question.prompt}</h2>
        <div className="answer-grid">
          {question.options.map((opt, i) => {
            const isCorrect = Boolean(feedback) && i === feedback!.correct_index
            const isMine = Boolean(feedback) && selected === i
            return (
              <button
                key={i}
                type="button"
                className={`answer-option${isCorrect ? ' correct' : isMine ? ' wrong' : ''}`}
                disabled={busy || Boolean(feedback)}
                onClick={() => { setSelected(i); void submitAnswer(i) }}
              >
                {'ABCD'[i]}. {opt}
                {isCorrect && <strong> · ✓ Respuesta correcta</strong>}
                {isMine && !isCorrect && <strong> · ✕ Tu respuesta</strong>}
                {isMine && isCorrect && <strong> · Tu respuesta</strong>}
              </button>
            )
          })}
        </div>
        {feedback && (
          <div className="glass-panel champ-feedback" ref={feedbackRef} tabIndex={-1}>
            <p><strong>{feedback.correct ? '✓ Correcto' : selected === null ? '✕ Se acabó el tiempo' : '✕ Incorrecto'}</strong></p>
            <p className="muted">{feedback.explanation}</p>
            {nextError && <p role="alert">{nextError}</p>}
            {feedback.has_next && <button type="button" className="cinema-button" disabled={busy} onClick={() => void goToNext()}>Siguiente pregunta</button>}
            {feedback.has_next && <p className="muted">El tiempo de la siguiente pregunta empieza cuando la abres.</p>}
          </div>
        )}
        {!feedback && <p className="muted">Si recargas o sales, el tiempo de esta pregunta sigue corriendo.</p>}
      </div>
    </div>
  )
}
