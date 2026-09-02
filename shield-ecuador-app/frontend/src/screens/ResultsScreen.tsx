import React from 'react'
import { Shield, RotateCcw, Swords } from 'lucide-react'

interface RiskResult {
  totalScore: number
  riskLevel: string
  belt: string
  vectorScores: Record<string, number>
  weakestVector: string
  weakestVectorName: string
}

interface ResultsScreenProps {
  result: RiskResult
  onContinue: () => void
}

const BELT_MARK: Record<string, string> = {
  white: 'I',
  yellow: 'II',
  orange: 'III',
  green: 'IV',
  brown: 'V',
  black: 'VI',
}

const BELT_LABEL: Record<string, string> = {
  white: 'Cinturon Blanco - Principiante',
  yellow: 'Cinturon Amarillo - En progreso',
  orange: 'Cinturon Naranja - Consciente',
  green: 'Cinturon Verde - Protegido',
  brown: 'Cinturon Cafe - Avanzado',
  black: 'Cinturon Negro - Maestro',
}

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; message: string }> = {
  bajo: {
    label: 'Riesgo Bajo',
    color: 'text-emerald-800 bg-emerald-100 border-emerald-200',
    bg: 'bg-emerald-800',
    message: 'Excelente. Tu negocio tiene buenas practicas de seguridad. Sigue entrenando para mantener este nivel.',
  },
  medio: {
    label: 'Riesgo Medio',
    color: 'text-amber-900 bg-amber-100 border-amber-200',
    bg: 'bg-amber-700',
    message: 'Hay areas que mejorar. Completa los Katas recomendados para reducir tu riesgo.',
  },
  alto: {
    label: 'Riesgo Alto',
    color: 'text-red-800 bg-red-100 border-red-200',
    bg: 'bg-red-800',
    message: 'Tu negocio necesita atencion urgente. Actua hoy en las recomendaciones prioritarias.',
  },
  critico: {
    label: 'Riesgo Critico',
    color: 'text-red-100 bg-stone-950 border-red-800',
    bg: 'bg-stone-950',
    message: 'Atencion inmediata requerida. Tu negocio esta muy expuesto. Contacta un tecnico hoy.',
  },
}

export function ResultsScreen({ result, onContinue }: ResultsScreenProps) {
  const config = RISK_CONFIG[result.riskLevel] ?? RISK_CONFIG['medio']
  const belt = result.belt

  return (
    <div className="dojo-page pb-8">
      <div className={`${config.bg} text-orange-50 px-4 pt-8 pb-16 border-b-4 border-red-900`}>
        <div className="max-w-2xl mx-auto text-center">
          <Shield className="mx-auto mb-4 opacity-80" size={34} />
          <p className="text-xs uppercase tracking-[0.22em] text-orange-100/80 font-bold">Examen finalizado</p>
          <h1 className="dojo-display text-4xl mt-2">Rango del Dojo</h1>
          <p className="text-orange-100/80 text-sm mt-2">Perfil de riesgo basado en buenas practicas de seguridad</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-10">
        <div className="dojo-card rounded-lg overflow-hidden">
          <div className="p-6 text-center border-b border-stone-900/10">
            <div className="mx-auto mb-4 w-20 h-20 rounded-md border-2 border-stone-900/20 bg-white/70 flex items-center justify-center text-3xl font-black text-stone-950">
              {BELT_MARK[belt]}
            </div>
            <h2 className="text-xl font-black text-stone-950">{BELT_LABEL[belt]}</h2>
            <span className={`inline-block mt-3 px-4 py-1.5 rounded-full border font-bold text-sm ${config.color}`}>
              {config.label}
            </span>
          </div>

          <div className="p-5 border-b border-stone-900/10 grid gap-4 sm:grid-cols-2">
            <div className="dojo-panel rounded-md p-4">
              <p className="text-sm text-stone-600 font-semibold">Puntaje de riesgo</p>
              <p className="text-4xl font-black text-stone-950">{result.totalScore}</p>
              <p className="text-xs text-stone-500">(menor es mejor)</p>
            </div>
            <div className="dojo-panel rounded-md p-4">
              <p className="text-sm text-stone-600 font-semibold">Area mas debil</p>
              <p className="font-black text-stone-950">{result.weakestVectorName || 'Sin datos'}</p>
            </div>
          </div>

          <div className="p-5 border-b border-stone-900/10">
            <div className="flex gap-3">
              <Swords className="text-red-800 flex-shrink-0" size={24} />
              <p className="text-stone-700 text-sm leading-relaxed">{config.message}</p>
            </div>
          </div>

          {Object.keys(result.vectorScores).length > 0 && (
            <div className="p-5 border-b border-stone-900/10">
              <h3 className="font-black text-stone-950 text-sm mb-3">Detalle por area</h3>
              <div className="space-y-3">
                {Object.entries(result.vectorScores).map(([branch, score]) => {
                  const labels: Record<string, string> = {
                    A: 'Dispositivos',
                    B: 'Contrasenas',
                    C: 'Mensajes falsos',
                    I: 'Tecnologia',
                  }
                  const maxScore = 20
                  const pct = Math.min((score / maxScore) * 100, 100)
                  return (
                    <div key={branch}>
                      <div className="flex justify-between text-xs text-stone-600 mb-1 font-semibold">
                        <span>{labels[branch] ?? branch}</span>
                        <span>{score} pts</span>
                      </div>
                      <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-700 ${
                            score >= 15 ? 'bg-red-700' :
                            score >= 8 ? 'bg-amber-500' :
                            'bg-emerald-600'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="p-5 space-y-3">
            <button
              onClick={onContinue}
              className="dojo-btn w-full py-3 rounded-md font-bold"
            >
              Ver mis Katas recomendados
            </button>
            <button
              onClick={onContinue}
              className="dojo-btn-secondary w-full py-2.5 rounded-md text-sm font-bold flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} />
              Volver al Dashboard
            </button>
          </div>
        </div>
      </div>

      <p className="text-center text-stone-500 text-xs mt-6">
        Evaluacion basada en buenas practicas de seguridad adaptadas para MIPYMEs ecuatorianas
      </p>
    </div>
  )
}
