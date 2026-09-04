import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Loader, XCircle } from 'lucide-react'
import { BeltAwardCelebration, BeltBadge, NeonButton, SectionHeader } from '../components/CyberBushido'
import { beltPath, BeltLevel } from '../data/ciberDojo'
import { useAuth } from '../contexts/AuthContext'
import { useDojoStore } from '../store/dojoStore'
import { supabase } from '../lib/supabase'

type ExamStep = {
  question: string
  term?: string
  term_explanation?: string
  options: string[]
  correct: number
  explanation: string
}

type KataExam = {
  id: string
  kata_code: string
  name: string
  description: string | null
  teaching: string | null
  estimated_minutes: number | null
  required_belt: string | null
  points_reward: number | null
  steps: ExamStep[]
}

const beltMap: Record<string, BeltLevel> = {
  white: 'blanco',
  yellow: 'amarillo',
  orange: 'naranja',
  green: 'verde',
  blue: 'azul',
  brown: 'marron',
  black: 'negro',
}

export function KataExamPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user, refreshProfile } = useAuth()
  const [exam, setExam] = useState<KataExam | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stepIndex, setStepIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [showCelebrate, setShowCelebrate] = useState(false)

  useEffect(() => {
    let active = true

    async function loadExam() {
      setLoading(true)
      setError('')

      const { data, error: loadError } = await supabase
        .from('katas')
        .select('id, kata_code, name, description, teaching, estimated_minutes, required_belt, points_reward, steps')
        .eq('kata_code', code ?? '')
        .eq('active', true)
        .single()

      if (!active) return

      if (loadError || !data) {
        setError('No encontre este examen de cinturon.')
        setExam(null)
      } else {
        setExam({ ...(data as Omit<KataExam, 'steps'> & { steps: unknown }), steps: normalizeSteps(data.steps) })
      }

      setLoading(false)
    }

    void loadExam()

    return () => {
      active = false
    }
  }, [code])

  const step = exam?.steps[stepIndex]
  const score = useMemo(() => selectedAnswers.reduce((acc, answer, index) => {
    return acc + (answer === exam?.steps[index]?.correct ? 1 : 0)
  }, 0), [exam?.steps, selectedAnswers])
  const total = exam?.steps.length ?? 0
  const passed = total > 0 && score / total >= 0.75
  const finished = exam !== null && selectedAnswers.length === total
  const currentBelt = beltMap[exam?.required_belt ?? 'white'] ?? 'blanco'
  const awardedBelt = getNextBelt(currentBelt)

  function answer(index: number) {
    if (!step || selected !== null) return

    setSelected(index)
    setSelectedAnswers((current) => [...current, index])
  }

  function next() {
    if (!exam) return
    if (stepIndex >= exam.steps.length - 1) return
    setStepIndex((current) => current + 1)
    setSelected(null)
  }

  async function finish() {
    if (!exam || !user) {
      navigate('/dojos')
      return
    }

    setSaving(true)
    try {
      const { data, error: completeError } = await supabase.functions.invoke('complete-kata', {
        body: {
          kata_code: exam.kata_code,
          selected_answers: selectedAnswers,
        },
      })

      if (completeError) throw completeError

      if (data?.passed) {
        if (refreshProfile) await refreshProfile()
        const { setBelt } = useDojoStore.getState()
        setBelt(awardedBelt as any)
        setShowCelebrate(true)
        try { playCelebrateSound() } catch (e) {}
        await new Promise((r) => window.setTimeout(r, 2800))
      }

      setSaving(false)
      if (data?.passed) {
        // hide celebration and navigate after a short pause
        window.setTimeout(() => {
          setShowCelebrate(false)
          navigate('/dojos')
        }, 900)
      } else {
        navigate('/dojos')
      }
    } catch (err) {
      console.error('Error completing kata:', err)
      setSaving(false)
      window.alert('No se pudo guardar el resultado del kata. Intenta nuevamente.')
    }
  }

  function continueAfterAward() {
    setShowCelebrate(false)
    navigate('/dojos')
  }

function playCelebrateSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    o.connect(g)
    g.connect(ctx.destination)
    g.gain.value = 0.0001
    const now = ctx.currentTime
    g.gain.linearRampToValueAtTime(0.12, now + 0.01)
    o.start(now)
    o.frequency.exponentialRampToValueAtTime(1320, now + 0.18)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
    o.stop(now + 0.5)
  } catch (e) {
    console.warn('Audio not available:', e)
  }
}

  if (loading) {
    return (
      <div className="cyber-page grid place-items-center min-h-96">
        <div className="text-center glass-panel p-8">
          <Loader className="animate-spin mx-auto text-cyan-300" size={34} />
          <p className="mono-label mt-4">CARGANDO EXAMEN DE CINTURON</p>
        </div>
      </div>
    )
  }

  if (error || !exam || !step) {
    return (
      <div className="glass-panel p-8">
        <SectionHeader eyebrow="// KATA DE CINTURON" title="Examen no disponible" kanji="型" />
        <p className="text-slate-200">{error || 'Este examen aun no tiene preguntas.'}</p>
        <div className="mt-5">
          <NeonButton color="cyan" variant="outline" onClick={() => navigate('/dojos')}>Volver a Dojos</NeonButton>
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Dev: quick test button to trigger celebration when ?dev_test=celebrate is present */}
      {typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('dev_test') === 'celebrate' && (
        <button id="devTriggerCelebrate" onClick={() => { setShowCelebrate(true); try { playCelebrateSound() } catch(e){}; window.setTimeout(() => { setShowCelebrate(false); navigate('/dojos') }, 2600) }} style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 1200, padding: '10px 12px', borderRadius: 8, background: '#0f172a', color: 'white' }}>
          Probar animación
        </button>
      )}
      {false && showCelebrate && (
        <div className="celebrate-overlay">
          <div className="celebrate-card">
            <CheckCircle2 size={48} />
            <h2>¡Felicidades, has aprobado!</h2>
            <p>Has demostrado tu habilidad en el Dojo. Sigue así.</p>
          </div>
          <div className="confetti-layer">
            {Array.from({ length: 18 }).map((_, i) => (
              <motion.span key={i} className="confetti" initial={{ y: -40, opacity: 0 }} animate={{ y: 400, opacity: 1, rotate: 360 }} transition={{ delay: i * 0.04, duration: 1.6 }} />
            ))}
          </div>
        </div>
      )}
      <SectionHeader eyebrow="// KATA DE ASCENSO" title={exam.name} kanji="型" />
      {showCelebrate && (
        <BeltAwardCelebration
          currentBelt={currentBelt}
          awardedBelt={awardedBelt}
          score={score}
          total={total}
          onContinue={continueAfterAward}
        />
      )}
      <div className="exam-layout">
        <aside className="exam-side glass-panel">
          <span className="mono-label">CINTURON REQUERIDO</span>
          <BeltBadge level={currentBelt} />
          <p>{exam.description}</p>
          <div className="exam-stat">
            <strong>{exam.estimated_minutes ?? 15} min</strong>
            <span>duracion estimada</span>
          </div>
          <div className="exam-stat">
            <strong>{exam.points_reward ?? 0} XP</strong>
            <span>si apruebas</span>
          </div>
          <p className="exam-note">{exam.teaching}</p>
        </aside>

        <section className="exam-card glass-panel">
          {!finished ? (
            <>
              <div className="exam-progress">
                <span>Pregunta {stepIndex + 1} de {total}</span>
                <strong>{score}/{selectedAnswers.length} correctas</strong>
              </div>
              {step.term && (
                <div className="term-box">
                  <span>{step.term}</span>
                  <p>{step.term_explanation}</p>
                </div>
              )}
              <h2>{step.question}</h2>
              <div className="answer-grid">
                {step.options.map((option, index) => {
                  const isCorrect = index === step.correct
                  const isSelected = selected === index
                  const stateClass = selected === null ? '' : isCorrect ? 'correct' : isSelected ? 'wrong' : ''
                  return (
                    <button
                      key={`${stepIndex}-${option}`}
                      className={`answer-option btn-katana ${stateClass}`}
                      onClick={() => answer(index)}
                      disabled={selected !== null}
                    >
                      {String.fromCharCode(65 + index)} - {option}
                    </button>
                  )
                })}
              </div>
              {selected !== null && (
                <div className={`combat-feedback ${selected === step.correct ? 'success' : 'danger'}`}>
                  {selected === step.correct ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  <span>{step.explanation}</span>
                </div>
              )}
              {selected !== null && (
                <div className="mt-5">
                  <NeonButton color="cyan" variant="outline" onClick={next}>
                    {stepIndex >= total - 1 ? 'VER RESULTADO' : 'SIGUIENTE PREGUNTA'}
                  </NeonButton>
                </div>
              )}
            </>
          ) : (
            <div className="exam-result">
              <span className="mono-label">RESULTADO DEL KATA</span>
              <h2>{passed ? 'Aprobado' : 'Necesita repasar'}</h2>
              <p>Respondiste {score} de {total} correctamente. Para aprobar necesitas al menos 75%.</p>
              <NeonButton color={passed ? 'gold' : 'cyan'} variant="outline" onClick={finish}>
                {saving ? 'GUARDANDO...' : 'FINALIZAR'}
              </NeonButton>
            </div>
          )}
        </section>
      </div>
    </motion.div>
  )
}

function getNextBelt(current: BeltLevel): BeltLevel {
  const index = beltPath.findIndex((belt) => belt.level === current)
  if (index < 0) return 'amarillo'
  return beltPath[Math.min(index + 1, beltPath.length - 1)].level
}

function normalizeSteps(value: unknown): ExamStep[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<ExamStep>
      if (!row.question || !Array.isArray(row.options) || row.options.length < 2) return null
      return {
        question: row.question,
        term: row.term,
        term_explanation: row.term_explanation,
        options: row.options.map(String),
        correct: typeof row.correct === 'number' ? row.correct : 0,
        explanation: row.explanation || 'Respuesta registrada.',
      }
    })
    .filter(Boolean) as ExamStep[]
}
