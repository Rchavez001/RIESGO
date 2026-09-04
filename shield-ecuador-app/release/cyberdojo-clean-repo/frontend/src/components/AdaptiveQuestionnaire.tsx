import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { AlertTriangle, ChevronRight, Loader, Swords } from 'lucide-react'

interface Option {
  valor: string
  texto: string
  puntaje_riesgo: number
  siguiente_pregunta: string
  alerta_inmediata?: boolean
  mensaje_alerta?: string
  explicacion_para_usuario: string
}

interface Question {
  id: string
  question_text: string
  options: Option[]
}

interface RiskResult {
  totalScore: number
  riskLevel: string
  belt: string
  vectorScores: Record<string, number>
  weakestVector: string
  weakestVectorName: string
}

const BELT_COLORS: Record<string, string> = {
  white: '#f5f5f5',
  yellow: '#fbbf24',
  orange: '#f97316',
  green: '#22c55e',
  brown: '#92400e',
  black: '#111827',
}

const RISK_COLORS: Record<string, string> = {
  bajo: '#22c55e',
  medio: '#f97316',
  alto: '#ef4444',
  critico: '#7f1d1d',
}

export function AdaptiveQuestionnaire({
  onComplete,
  initialQuestionId = 'A01',
}: {
  onComplete: (result: RiskResult) => void
  initialQuestionId?: string
}) {
  const { user } = useAuth()
  const [currentQuestionId, setCurrentQuestionId] = useState(initialQuestionId)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [responses, setResponses] = useState<{ question_id: string; selected_option: Option }[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showExplanation, setShowExplanation] = useState<string | null>(null)
  const [criticalAlert, setCriticalAlert] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    void fetchQuestion(currentQuestionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionId])

  useEffect(() => {
    setCurrentQuestionId(initialQuestionId)
    setCurrentQuestion(null)
    setResponses([])
    setShowExplanation(null)
    setCriticalAlert(null)
    setProgress(0)
    setSubmitting(false)
  }, [initialQuestionId])

  async function fetchQuestion(questionId: string) {
    if (questionId === 'FIN') {
      await submitEvaluation(responses)
      return
    }

    setLoading(true)
    setShowExplanation(null)

    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('id', questionId)
      .eq('active', true)
      .single()

    if (error || !data) {
      console.error('Error fetching question:', error)
      await submitEvaluation(responses)
      return
    }

    setCurrentQuestion(data as Question)
    setLoading(false)
  }

  async function handleAnswer(option: Option) {
    if (!currentQuestion) return
    const newResponse = { question_id: currentQuestion.id, selected_option: option }
    const updatedResponses = [...responses, newResponse]
    setResponses(updatedResponses)

    setShowExplanation(option.explicacion_para_usuario)
    setProgress(prev => Math.min(prev + 10, 90))

    if (option.alerta_inmediata && option.mensaje_alerta) {
      setCriticalAlert(option.mensaje_alerta)
    }

    setTimeout(() => {
      setCriticalAlert(null)
      if (option.siguiente_pregunta === 'FIN') {
        void submitEvaluation(updatedResponses)
      } else {
        setCurrentQuestionId(option.siguiente_pregunta)
      }
    }, option.alerta_inmediata ? 4000 : 2000)
  }

  async function submitEvaluation(finalResponses: typeof responses) {
    if (finalResponses.length === 0 || !user) return
    setSubmitting(true)
    setProgress(95)

    try {
      const { data, error } = await supabase.functions.invoke('calculate-risk', {
        body: { responses: finalResponses }
      })

      if (error) throw new Error('Error al calcular el riesgo')

      const result = data as RiskResult

      setProgress(100)
      onComplete(result)
    } catch (err) {
      console.error('Error in submitEvaluation:', err)
      window.alert('Error al finalizar la evaluacion. Intente nuevamente.')
      setSubmitting(false)
    }
  }

  if (loading && !currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <div className="dojo-seal">?</div>
        <p className="text-stone-700 text-lg text-center">El Sensei esta preparando tu proxima pregunta...</p>
        <Loader className="animate-spin text-red-800" size={24} />
      </div>
    )
  }

  if (submitting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 px-4">
        <Swords className="text-red-800" size={42} />
        <p className="text-stone-700 text-lg text-center">El Sensei esta evaluando tu nivel de riesgo...</p>
        <div className="w-full max-w-xs bg-stone-200 rounded-full h-3">
          <div
            className="bg-red-800 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  if (!currentQuestion) return null

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-6">
        <div className="flex justify-between text-sm text-stone-600 mb-1 font-semibold">
          <span>Pregunta {responses.length + 1}</span>
          <span>{responses.length} respondidas</span>
        </div>
        <div className="w-full bg-stone-200 rounded-full h-2">
          <div
            className="bg-red-800 h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(responses.length * 12, 90)}%` }}
          />
        </div>
      </div>

      {criticalAlert && (
        <div className="mb-4 p-4 bg-red-50 border-2 border-red-700 rounded-lg flex gap-3 items-start">
          <AlertTriangle className="text-red-700 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-black text-red-800">ALERTA CRITICA</p>
            <p className="text-red-700 text-sm mt-1">{criticalAlert}</p>
          </div>
        </div>
      )}

      <div className="dojo-card rounded-lg overflow-hidden">
        <div className="bg-stone-950 p-5 border-b-4 border-red-800">
          <div className="flex items-center gap-2 text-red-100 text-sm mb-2 font-semibold">
            <Swords size={16} />
            <span>Sensei pregunta</span>
          </div>
          <h2 className="text-orange-50 text-xl md:text-2xl font-bold leading-snug">
            {currentQuestion.question_text}
          </h2>
        </div>

        {showExplanation && (
          <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-amber-900 text-sm">{showExplanation}</p>
          </div>
        )}

        <div className="p-4 space-y-3">
          {currentQuestion.options.map((option, index) => (
            <button
              key={`${currentQuestion.id}-${option.valor}-${index}`}
              onClick={() => void handleAnswer(option)}
              disabled={showExplanation !== null}
              className={`w-full text-left p-4 rounded-md border-2 transition-all duration-200
                ${showExplanation !== null
                  ? 'opacity-50 cursor-not-allowed border-stone-200 bg-stone-50'
                  : 'border-stone-200 bg-white/70 hover:border-red-700 hover:bg-red-50 hover:shadow-md'
                }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-md bg-stone-950 text-orange-50 font-black text-sm flex items-center justify-center flex-shrink-0">
                  {option.valor}
                </span>
                <span className="text-stone-800 flex-1 font-medium">{option.texto}</span>
                <ChevronRight className="text-stone-400 flex-shrink-0" size={16} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="text-center text-stone-500 text-xs mt-4">
        Ciber Dojo - Evaluacion de seguridad adaptada para MIPYMEs
      </p>
    </div>
  )
}

export { BELT_COLORS, RISK_COLORS }
