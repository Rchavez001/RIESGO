import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, ChevronRight, Loader, Shield, Swords, XCircle } from 'lucide-react'
import { DojoCompletionCelebration, KataRewardVideo, NeonButton, SectionHeader, WARRIOR_IMAGES } from '../components/CyberBushido'
import { dojoModules } from '../data/ciberDojo'
import { supabase } from '../lib/supabase'

type DojoQuestion = {
  prompt: string
  options: string[]
  correct: number
  explanation: string
}

type QuestionOption = {
  texto?: string
  valor?: string
  correcta?: boolean
  is_correct?: boolean
}

type QuestionRow = {
  id?: string
  dojo_id?: string | null
  order_num?: number | null
  question_text: string
  options: unknown
  answer_text?: string | null
  explanation?: string | null
}

const dojoIdMap: Record<string, string> = {
  passwords: 'dojo-passwords',
  phishing: 'dojo-phishing',
  backup: 'dojo-backups',
}

const beltExamMap: Record<string, string> = {
  blanco: 'EXAM_BLANCO_AMARILLO',
  amarillo: 'EXAM_AMARILLO_NARANJA',
  naranja: 'EXAM_NARANJA_VERDE',
  verde: 'EXAM_VERDE_AZUL',
  azul: 'EXAM_AZUL_MARRON',
  marron: 'EXAM_MARRON_NEGRO',
}

export function DojoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dojo = useMemo(() => dojoModules.find((item) => item.id === id) ?? dojoModules[0], [id])
  const [heroIndex, setHeroIndex] = useState(() => {
    const saved = Number(localStorage.getItem('ciberdojo_hero_index'))
    return Number.isInteger(saved) && saved >= 0 && saved < WARRIOR_IMAGES.length ? saved : 0
  })
  const heroImage = WARRIOR_IMAGES[heroIndex]

  function selectHero(index: number) {
    const wrapped = ((index % WARRIOR_IMAGES.length) + WARRIOR_IMAGES.length) % WARRIOR_IMAGES.length
    setHeroIndex(wrapped)
    try { localStorage.setItem('ciberdojo_hero_index', String(wrapped)) } catch (_) {}
  }
  const fallbackQuestion = useMemo<DojoQuestion>(() => dojo.questions[0] ?? {
    prompt: 'Este kata esta en preparacion. Que debe hacer un guerrero digital antes de avanzar?',
    options: ['Improvisar', 'Documentar controles y validar evidencias', 'Desactivar alertas', 'Compartir claves'],
    correct: 1,
    explanation: 'La disciplina del dojo exige evidencia y validacion antes de avanzar.',
  }, [dojo])

  const [questions, setQuestions] = useState<DojoQuestion[]>([fallbackQuestion])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [enemyHp, setEnemyHp] = useState(100)
  const [heroHp, setHeroHp] = useState(100)
  const [feedback, setFeedback] = useState('')
  const [answered, setAnswered] = useState(false)
  const [loadingQuestions, setLoadingQuestions] = useState(true)
  const [correctAnswers, setCorrectAnswers] = useState(0)
  const [showCompletion, setShowCompletion] = useState(false)
  const [pendingReward, setPendingReward] = useState<'continue' | 'exam' | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)

  const question = questions[questionIndex] ?? fallbackQuestion
  const isLastQuestion = questionIndex >= questions.length - 1

  useEffect(() => {
    let active = true

    async function loadQuestions() {
      setLoadingQuestions(true)
      setQuestions([fallbackQuestion])
      setQuestionIndex(0)
      setFeedback('')
      setAnswered(false)
      setEnemyHp(100)
      setHeroHp(100)
      setCorrectAnswers(0)
      setShowCompletion(false)
      setSelectedAnswer(null)

      const centralDojoId = dojoIdMap[dojo.id] ?? `dojo-${dojo.id}`
      const { data, error } = await supabase
        .from('questions')
        .select('id, dojo_id, question_text, options, answer_text, explanation, order_num, audit_status, active')
        .eq('dojo_id', centralDojoId)
        .eq('active', true)
        .in('audit_status', ['approved', 'auditada', 'aprobada'])
        .order('order_num', { ascending: true })

      if (!active) return

      if (error) {
        console.error('Error loading dojo questions:', error)
        setQuestions([fallbackQuestion])
      } else {
        const normalized = (data ?? []).map((row) => normalizeQuestion(row as QuestionRow)).filter(Boolean) as DojoQuestion[]
        setQuestions(normalized.length > 0 ? normalized : [fallbackQuestion])
      }

      setLoadingQuestions(false)
    }

    void loadQuestions()

    return () => {
      active = false
    }
  }, [dojo.id, fallbackQuestion])

  function answer(index: number) {
    if (answered) return
    setAnswered(true)
    setSelectedAnswer(index)

    if (isLastQuestion) {
      window.setTimeout(() => setShowCompletion(true), 650)
    }

    if (index === question.correct) {
      const damage = Math.ceil(100 / Math.max(questions.length, 1))
      setEnemyHp((hp) => Math.max(0, hp - damage))
      setCorrectAnswers((current) => current + 1)
      setFeedback(`+${dojo.xp} XP - Golpe limpio. ${question.explanation}`)
    } else {
      setHeroHp((hp) => Math.max(0, hp - 25))
      setFeedback(`-1 VIDA - ${question.explanation}`)
    }
  }

  function nextQuestion() {
    if (isLastQuestion) {
      setEnemyHp(0)
      setShowCompletion(true)
      return
    }

    setQuestionIndex((current) => current + 1)
    setFeedback('')
    setAnswered(false)
    setSelectedAnswer(null)
  }

  function finishDojo() {
    const perfectScore = correctAnswers === questions.length
    const examCode = beltExamMap[dojo.requiredBelt]

    if (perfectScore && examCode) {
      navigate(`/kata/${examCode}`)
      return
    }

    navigate('/dojos')
  }

  function goToDojos() {
    navigate('/dojos')
  }

  function goToBeltExam() {
    const examCode = beltExamMap[dojo.requiredBelt]
    if (examCode) {
      navigate(`/kata/${examCode}`)
      return
    }
    navigate('/dojos')
  }

  function resolvePendingReward() {
    const action = pendingReward
    setPendingReward(null)
    if (action === 'exam') goToBeltExam()
    else goToDojos()
  }

  if (loadingQuestions) {
    return (
      <div className="cyber-page grid place-items-center min-h-96">
        <div className="text-center glass-panel p-8">
          <Loader className="animate-spin mx-auto text-cyan-300" size={34} />
          <p className="mono-label mt-4">CARGANDO PREGUNTAS DEL DOJO</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      {showCompletion && (
        <DojoCompletionCelebration
          perfect={correctAnswers === questions.length}
          correct={correctAnswers}
          total={questions.length}
          onContinue={() => { setShowCompletion(false); setPendingReward('continue') }}
          onExam={beltExamMap[dojo.requiredBelt] ? () => { setShowCompletion(false); setPendingReward('exam') } : undefined}
        />
      )}
      {pendingReward && (
        <KataRewardVideo src="/kata-victoria.mp4" onClose={resolvePendingReward} />
      )}
      <SectionHeader eyebrow={`KATA #${String(dojo.number).padStart(3, '0')} - ${dojo.isoControl}`} title={dojo.title} kanji="門" />
      <div className="combat-layout combat-animate">
        <aside className="combat-panel">
          <div className="mono-label">TU PERSONAJE</div>
          <div className="fighter-picker">
            <button
              type="button"
              className="fighter-nav-btn"
              aria-label="Personaje anterior"
              onClick={() => selectHero(heroIndex - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <motion.div
              className="fighter"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onDragEnd={(_, info) => {
                if (info.offset.x < -40) selectHero(heroIndex + 1)
                else if (info.offset.x > 40) selectHero(heroIndex - 1)
              }}
            >
              <motion.img
                key={heroIndex}
                src={heroImage}
                alt="Tu guerrero"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              />
            </motion.div>
            <button
              type="button"
              className="fighter-nav-btn"
              aria-label="Siguiente personaje"
              onClick={() => selectHero(heroIndex + 1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="fighter-dots" role="tablist" aria-label="Elegir personaje">
            {WARRIOR_IMAGES.map((_, index) => (
              <button
                key={index}
                type="button"
                className={`fighter-dot ${index === heroIndex ? 'active' : ''}`}
                aria-label={`Personaje ${index + 1}`}
                aria-current={index === heroIndex}
                onClick={() => selectHero(index)}
              />
            ))}
          </div>
          <div className="mono-label">HP</div>
          <div className="hp-track"><div className="hp-fill" style={{ width: `${heroHp}%` }} /></div>
          <div className="mono-label">CHI</div>
          <div className="hp-track"><div className="xp-fill" style={{ width: '72%' }} /></div>
        </aside>

        <section className="combat-panel question-card glass-panel">
          <div className="hero-badge">{dojo.category} - Pregunta {questionIndex + 1} de {questions.length}</div>
          <h2 className="mt-5">{question.prompt}</h2>
          <div className="answer-grid">
            {question.options.map((option, index) => {
              const isCorrect = answered && index === question.correct
              const isWrong = answered && selectedAnswer === index && index !== question.correct
              return (
              <button
                key={`${questionIndex}-${option}`}
                className={`answer-option btn-katana ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
                onClick={() => answer(index)}
                disabled={answered}
              >
                <span>{String.fromCharCode(65 + index)} - {option}</span>
                {isCorrect && <CheckCircle2 className="answer-status-icon" size={20} />}
                {isWrong && <XCircle className="answer-status-icon" size={20} />}
              </button>
              )
            })}
          </div>
          {feedback && <div className="combat-feedback">{feedback}</div>}
          {answered && enemyHp > 0 && (
            <div className="mt-5">
              <NeonButton color="cyan" variant="outline" onClick={nextQuestion}>
                {isLastQuestion ? 'FINALIZAR KATA' : 'SIGUIENTE PREGUNTA'}
              </NeonButton>
            </div>
          )}
          {enemyHp === 0 && (
            <div className="mt-5 dojo-complete-actions">
              <div className="combat-feedback success">
                {correctAnswers === questions.length
                  ? 'Dojo perfecto. Puedes presentar el examen para subir de cinturon.'
                  : `Completaste el dojo con ${correctAnswers} de ${questions.length} respuestas correctas. Repasa antes del examen.`}
              </div>
              <NeonButton color="gold" variant="outline" onClick={finishDojo}>
                {correctAnswers === questions.length ? 'IR AL EXAMEN DE CINTURON' : 'VOLVER A DOJOS'}
              </NeonButton>
            </div>
          )}
        </section>

        <aside className="combat-panel">
          <div className="mono-label">ADVERSARIO</div>
          <div className="fighter glow-red">
            <img src={dojo.enemyImage} alt={dojo.enemy} />
          </div>
          <h3 className="font-bold text-xl">{dojo.enemy}</h3>
          <div className="mono-label mt-4">HP ENEMIGO</div>
          <div className="hp-track"><div className="hp-fill enemy" style={{ width: `${enemyHp}%` }} /></div>
          <div className="flex gap-2 text-red-300 mt-4"><Swords /><Shield /></div>
        </aside>
      </div>
    </motion.div>
  )
}

function normalizeQuestion(row: QuestionRow): DojoQuestion | null {
  const rawOptions = Array.isArray(row.options) ? row.options as QuestionOption[] : []

  if (!row.question_text || rawOptions.length === 0) return null

  const normalizedOptions = buildDisplayOptions(rawOptions, row)
  if (normalizedOptions.length < 2) return null

  const correctIndex = normalizedOptions.findIndex((option) => option.correct)
  return {
    prompt: simplifyForCitizens(row.question_text),
    options: normalizedOptions.map((option) => option.text),
    correct: correctIndex >= 0 ? correctIndex : 0,
    explanation: simplifyForCitizens(row.explanation || row.answer_text || 'Respuesta registrada. Continua con la siguiente pregunta del kata.'),
  }
}

function buildDisplayOptions(rawOptions: QuestionOption[], row: QuestionRow) {
  const correctRaw = rawOptions.find((option) => option.correcta === true || option.is_correct === true) ?? rawOptions[0]
  const correctText = simplifyForCitizens(correctRaw?.texto ?? correctRaw?.valor ?? row.answer_text ?? 'Verificar por canal oficial')
  const dojoId = row.dojo_id ?? ''
  const questionSeed = stableSeed(`${dojoId}-${row.order_num ?? row.id ?? row.question_text}`)
  const distractorPool = getDistractorPool(dojoId, questionSeed)
  const used = new Set<string>([normalizeOptionKey(correctText)])
  const options = [{ text: correctText, correct: true }]

  rawOptions
    .filter((option) => !(option.correcta === true || option.is_correct === true))
    .map((option) => simplifyForCitizens(option.texto ?? option.valor ?? ''))
    .forEach((text) => {
      if (!text || isWeakDistractor(text)) return
      const key = normalizeOptionKey(text)
      if (used.has(key)) return
      used.add(key)
      options.push({ text, correct: false })
    })

  for (const text of distractorPool) {
    if (options.length >= 4) break
    const simplified = simplifyForCitizens(text)
    const key = normalizeOptionKey(simplified)
    if (used.has(key)) continue
    used.add(key)
    options.push({ text: simplified, correct: false })
  }

  while (options.length < 4) {
    const fallback = `Opcion de riesgo ${options.length + 1}`
    options.push({ text: fallback, correct: false })
  }

  return rotateCorrectPosition(options.slice(0, 4), questionSeed)
}

function rotateCorrectPosition(options: Array<{ text: string; correct: boolean }>, seed: number) {
  const correct = options.find((option) => option.correct) ?? options[0]
  const distractors = options.filter((option) => !option.correct)
  const correctPosition = seed % Math.min(options.length, 4)
  const result: Array<{ text: string; correct: boolean }> = []

  for (let index = 0; index < options.length; index++) {
    if (index === correctPosition) {
      result.push(correct)
    } else {
      result.push(distractors.shift() ?? correct)
    }
  }

  return result
}

function getDistractorPool(dojoId: string, seed: number) {
  const pools: Record<string, string[]> = {
    'dojo-phishing': [
      'Responder al mensaje para confirmar si es real',
      'Abrir el enlace porque el logo se ve conocido',
      'Descargar el archivo adjunto antes de verificar',
      'Enviar tus datos para evitar el bloqueo anunciado',
      'Reenviar el correo a otros companeros sin revisarlo',
      'Llamar al numero que aparece dentro del mismo mensaje',
      'Pagar rapido porque el mensaje dice que es urgente',
      'Ignorar la direccion del remitente y confiar en el asunto',
      'Usar el enlace acortado sin revisar la pagina oficial',
      'Compartir el codigo de verificacion que llego por SMS',
    ],
    'dojo-passwords': [
      'Usar la misma contrasena en todas las cuentas',
      'Guardar claves en una nota visible del escritorio',
      'Compartir la clave maestra con todo el equipo',
      'Desactivar la verificacion en dos pasos por comodidad',
      'Crear claves cortas con el nombre del negocio',
      'Enviar contrasenas por chat sin proteccion',
      'Mantener cuentas de exempleados activas',
      'Reutilizar claves antiguas cuando se olvidan',
    ],
    'dojo-backups': [
      'Guardar la unica copia en el mismo computador',
      'No probar la restauracion hasta que ocurra un incidente',
      'Conectar siempre el disco de respaldo al equipo principal',
      'Esperar al fin de mes para respaldar informacion critica',
      'Borrar versiones anteriores sin validar la copia nueva',
      'Confiar solo en una captura de pantalla como respaldo',
      'No documentar quien puede recuperar la informacion',
      'Pagar el rescate antes de revisar las copias disponibles',
    ],
  }
  const pool = pools[dojoId] ?? [
    'Actuar rapido sin verificar',
    'Compartir datos sensibles por mensaje',
    'Ignorar alertas del sistema',
    'Desactivar controles de seguridad',
    'No reportar el incidente al responsable',
    'Confiar en enlaces recibidos por terceros',
  ]

  return [...pool.slice(seed % pool.length), ...pool.slice(0, seed % pool.length)]
}

function isWeakDistractor(value: string) {
  const normalized = normalizeOptionKey(value)
  return normalized.includes('distractor pendiente')
    || normalized.includes('pendiente de configurar')
    || normalized.includes('desactivar controles de seguridad temporalmente')
    || normalized.includes('compartir claves o datos de entrada para resolver mas rapido')
    || normalized.includes('compartir credenciales para resolver mas rapido')
}

function normalizeOptionKey(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stableSeed(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function simplifyForCitizens(value: string) {
  return value
    .replace(/\bMFA\b/gi, 'verificacion en dos pasos')
    .replace(/\b2FA\b/gi, 'verificacion en dos pasos')
    .replace(/\bphishing\b/gi, 'mensaje falso para robar datos')
    .replace(/\bransomware\b/gi, 'bloqueo de archivos para pedir dinero')
    .replace(/\bbackup(s)?\b/gi, 'copia de seguridad')
    .replace(/\bcredenciales\b/gi, 'claves o datos de entrada')
    .replace(/\bdominio\b/gi, 'direccion de la pagina')
    .replace(/\bmalware\b/gi, 'programa malicioso')
    .replace(/\bURL\b/g, 'direccion web')
}
