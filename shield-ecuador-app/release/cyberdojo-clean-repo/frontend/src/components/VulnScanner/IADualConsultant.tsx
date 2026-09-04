import React from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { NeonButton } from '../CyberBushido'
import type { EstadoIA, RecomendacionIA } from '../../services/scanOrchestrator'
import type { ScanCheck } from '../../data/scanChecks'

interface IADualConsultantProps {
  check: ScanCheck
  estadoIA: EstadoIA
  resultado: RecomendacionIA | null
  onClose: () => void
}

export function IADualConsultant({ check, estadoIA, resultado, onClose }: IADualConsultantProps) {
  const steps = [
    { key: 'sensei', icon: '🥋', label: 'Sensei IA preparando consejo' },
    { key: 'auditor', icon: '🔍', label: 'Auditor IA verificando calidad' },
    { key: 'done', icon: '✅', label: 'Consejo verificado para ti' },
  ]

  const getStepState = (key: string) => {
    if (key === 'sensei') {
      if (['auditor_revisando', 'aprobada', 'fallback'].includes(estadoIA)) return 'done'
      if (estadoIA === 'sensei_pensando') return 'active'
      return 'idle'
    }
    if (key === 'auditor') {
      if (['aprobada', 'fallback'].includes(estadoIA)) return 'done'
      if (estadoIA === 'auditor_revisando') return 'active'
      return 'idle'
    }
    if (key === 'done') {
      return ['aprobada', 'fallback'].includes(estadoIA) ? 'done' : 'idle'
    }
    return 'idle'
  }

  const statusMsg: Partial<Record<EstadoIA, string>> = {
    sensei_pensando: '🥋 Tu Sensei está analizando tu situación...',
    auditor_revisando: '🔍 Un segundo experto está verificando el consejo...',
    aprobada: '✅ ¡Consejo verificado y listo para ti!',
    fallback: '⚠️ Respuesta de emergencia — el dojo siempre tiene una salida',
    error: '❌ Algo falló. El Sensei usará una respuesta básica.',
  }

  return (
    <motion.div
      className="vs-ia-panel"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.5rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--neon-cyan)', marginBottom: '.15rem' }}>
            🤖 Consulta al Sensei IA
          </div>
          <div style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>
            {check.nombre}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar consulta"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
        >
          <X size={18} />
        </button>
      </div>

      <div className="vs-pipeline" role="group" aria-label="Proceso de validación doble">
        {steps.map((step, i) => {
          const state = getStepState(step.key)
          return (
            <React.Fragment key={step.key}>
              <div className={`vs-pipeline-step ${state === 'active' ? 'active' : state === 'done' ? 'done' : ''}`}>
                <span className="vs-pipeline-icon" aria-hidden="true">
                  {state === 'active' ? <span className="vs-ninja-spin">{step.icon}</span> : step.icon}
                </span>
                <span>{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <span className="vs-pipeline-arrow" aria-hidden="true">→</span>
              )}
            </React.Fragment>
          )
        })}
      </div>

      <div className="vs-ia-status" aria-live="polite">
        {statusMsg[estadoIA] ?? ''}
      </div>

      {resultado && (
        <div>
          <div className="vs-recommendation">
            {resultado.recomendacion}
          </div>
          <div>
            {resultado.esFallback ? (
              <span className="vs-audit-badge vs-fallback-badge">⚠️ Respuesta de emergencia del dojo</span>
            ) : (
              <span className="vs-audit-badge">
                ✅ Verificado por Auditor IA · Calidad {resultado.calidad}/100
                {resultado.intentos > 1 && ` · ${resultado.intentos} intentos`}
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
