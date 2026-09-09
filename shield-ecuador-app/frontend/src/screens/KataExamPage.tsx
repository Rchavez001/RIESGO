import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BeltAwardCelebration, BeltBadge, NeonButton, SectionHeader } from '../components/CyberBushido'
import { LearningFeedback, LearningTerms } from '../components/LearningHelpers'
import { learningCall, learningDojos, LearningExam } from '../services/learning'
import { useAuth } from '../contexts/AuthContext'

export function KataExamPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user, refreshProfile } = useAuth()
  const dojo = learningDojos.find(d => d.exam_code === code)
  const [exam, setExam] = useState<LearningExam | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [celebrate, setCelebrate] = useState(false)
  const generation = useRef(0)
  const inFlight = useRef(false)
  useEffect(() => {
    const current = ++generation.current
    setExam(null); setSelected(null); setError(''); setCelebrate(false)
    if (!dojo || !user) return
    setBusy(true)
    learningCall<LearningExam>('learning_start_exam', { p_code: dojo.exam_code })
      .then(value => { if (generation.current === current) setExam(value) })
      .catch(e => { if (generation.current === current) setError(e.message) })
      .finally(() => { if (generation.current === current) setBusy(false) })
    return () => { generation.current = current + 1 }
  }, [dojo, user])
  async function act(name: string, args: Record<string, unknown>) {
    if (inFlight.current) return
    inFlight.current = true
    const current = generation.current
    setBusy(true); setError('')
    try {
      const value = await learningCall<LearningExam>(name, args)
      if (current !== generation.current) return
      setExam(value); setSelected(null)
      if (value.finished && value.passed) { setCelebrate(dojo?.rank !== 6); void refreshProfile() }
    } catch (e) {
      if (current === generation.current) setError((e as Error).message)
    } finally {
      inFlight.current = false
      if (current === generation.current) setBusy(false)
    }
  }
  if (!dojo) return <div className="glass-panel p-8">No encontramos este examen. <button onClick={() => navigate('/dojos')}>Volver a dojos</button></div>
  const index = exam ? Object.keys(exam.answers).length : 0
  const item = exam?.cases[index]
  return <div className="learning-page">
    <SectionHeader eyebrow="KATA · PON EN PRÁCTICA LO APRENDIDO" title={dojo.rank === 6 ? 'Kata final del cinturón negro' : `Examen del cinturón ${dojo.belt}`} kanji="型" />
    {celebrate && exam && <BeltAwardCelebration currentBelt={dojo.belt}
      awardedBelt={learningDojos[Math.min(6, dojo.rank + 1)].belt} score={exam.score ?? 0} total={5} onContinue={() => setCelebrate(false)} />}
    <div className="learning-intro glass-panel"><BeltBadge level={dojo.belt} />
      <p>Cinco casos, sin límite de tiempo. El último combina más decisiones. Se aprueba con al menos 75 %: cuatro de cinco aciertos (80 %). Al terminar podrás revisar todas las explicaciones.</p></div>
    {error && <div role="alert" className="combat-feedback"><p>{error}</p><NeonButton disabled={busy}
      onClick={() => act('learning_start_exam', { p_code: dojo.exam_code })}>Recuperar examen</NeonButton></div>}
    {!user && <p>Inicia sesión para presentar tu examen.</p>}
    {busy && !exam && <p role="status">Comprobando tu entrenamiento y preparando los cinco casos…</p>}
    {exam && !exam.finished && item && <section className="exam-card glass-panel" aria-busy={busy}>
      <p className="hero-badge">Caso {index + 1} de 5{index === 4 ? ' · Desafío final' : ''}</p>
      <progress className="learning-progress" value={index} max={5} aria-label="Casos enviados" />
      <h2 className="learning-prompt">{item.prompt}</h2><LearningTerms item={item} />
      <div className="answer-grid">{item.options.map((option, i) => <button key={`${item.id}-${i}`}
        aria-pressed={selected === i} disabled={busy} className={`answer-option ${selected === i ? 'learning-selected' : ''}`}
        onClick={() => setSelected(i)}>{'ABCD'[i]}. {option}</button>)}</div>
      <p>Puedes cambiar tu elección antes de enviarla. Una vez enviada, queda guardada.</p>
      <NeonButton color="cyan" disabled={busy || selected === null}
        onClick={() => act('learning_exam_answer', { p_attempt: exam.id, p_case: item.id, p_answer: selected })}>
        {busy ? 'Guardando respuesta…' : index === 4 ? 'Enviar y ver resultado' : 'Enviar y continuar'}</NeonButton>
    </section>}
    {exam?.finished && <section className="exam-card glass-panel">
      <h2>{exam.passed ? (dojo.rank === 6 ? '¡Completaste la ruta del dojo!' : '¡Aprobaste tu kata!') : 'Sigamos practicando'}</h2>
      <p>Acertaste {exam.score} de 5 casos ({(exam.score ?? 0) * 20} %). Tu resultado está guardado.</p>
      <p>{exam.passed ? 'Lleva estas decisiones a tu vida diaria y comparte lo aprendido con paciencia.' : 'Equivocarte aquí te permite aprender sin arriesgar tu dinero ni tus datos. Revisa las explicaciones y vuelve a intentarlo cuando te sientas listo.'}</p>
      <h3>Revisa los cinco casos</h3>
      {exam.cases.map((q, i) => <article className="learning-review" key={q.id}>
        <h4>Caso {i + 1} · {q.topic}</h4><p className="learning-prompt">{q.prompt}</p>
        <p>Elegiste: {q.options[exam.answers[q.id]]}</p><LearningFeedback item={q} selected={exam.answers[q.id]} /><LearningTerms item={q} />
      </article>)}
      {!exam.passed && <NeonButton color="gold" disabled={busy} onClick={() => act('learning_start_exam', { p_code: dojo.exam_code, p_retry: true })}>Practicar con otro examen</NeonButton>}
    </section>}
    <div className="learning-actions"><NeonButton color="cyan" variant="ghost" onClick={() => navigate(`/dojo/${dojo.id}`)}>Volver al entrenamiento</NeonButton>
      <NeonButton color="cyan" variant="ghost" onClick={() => navigate('/dojos')}>Volver a dojos</NeonButton></div>
  </div>
}
