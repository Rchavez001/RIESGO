import React, { useCallback, useEffect, useReducer } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NeonButton } from '../CyberBushido'
import { SystemDetector } from './SystemDetector'
import { ScanProgress } from './ScanProgress'
import { SecurityReport } from './SecurityReport'
import { IADualConsultant } from './IADualConsultant'
import { detectSystemInfo, type SystemInfo } from '../../services/senseiIA'
import { obtenerRecomendacionValidada, type EstadoIA, type RecomendacionIA } from '../../services/scanOrchestrator'
import { SCAN_CHECKS, type ScanCheck } from '../../data/scanChecks'
import './vulnscanner.css'

// ── Types ──────────────────────────────────────────────────────────────────

type Fase = 'idle' | 'detecting' | 'scanning' | 'reporting' | 'consulting'

interface ScanResult {
  check: ScanCheck
  passed: boolean
}

interface PartialResult {
  id: string
  passed: boolean | null
}

interface ScanState {
  fase: Fase
  sistemaDetectado: (SystemInfo & { isHttps: boolean; connectionType: string; effectiveType: string }) | null
  progreso: number
  partialResults: PartialResult[]
  resultados: ScanResult[]
  consultaActiva: ScanCheck | null
  estadoIA: EstadoIA
  recomendacion: RecomendacionIA | null
}

type Action =
  | { type: 'START_DETECT' }
  | { type: 'SYSTEM_DETECTED'; payload: ScanState['sistemaDetectado'] }
  | { type: 'START_SCAN' }
  | { type: 'CHECK_RUNNING'; id: string }
  | { type: 'CHECK_DONE'; id: string; passed: boolean; progreso: number }
  | { type: 'SCAN_COMPLETE'; resultados: ScanResult[] }
  | { type: 'OPEN_CONSULT'; check: ScanCheck }
  | { type: 'CLOSE_CONSULT' }
  | { type: 'SET_ESTADO_IA'; estado: EstadoIA }
  | { type: 'SET_RECOMENDACION'; recomendacion: RecomendacionIA }
  | { type: 'RESET' }

const initialState: ScanState = {
  fase: 'idle',
  sistemaDetectado: null,
  progreso: 0,
  partialResults: [],
  resultados: [],
  consultaActiva: null,
  estadoIA: 'idle',
  recomendacion: null,
}

function scanReducer(state: ScanState, action: Action): ScanState {
  switch (action.type) {
    case 'START_DETECT':
      return { ...state, fase: 'detecting' }
    case 'SYSTEM_DETECTED':
      return { ...state, sistemaDetectado: action.payload }
    case 'START_SCAN':
      return { ...state, fase: 'scanning', progreso: 0, partialResults: [], resultados: [] }
    case 'CHECK_RUNNING':
      return {
        ...state,
        partialResults: state.partialResults.some((r) => r.id === action.id)
          ? state.partialResults.map((r) => r.id === action.id ? { ...r, passed: null } : r)
          : [...state.partialResults, { id: action.id, passed: null }],
      }
    case 'CHECK_DONE':
      return {
        ...state,
        progreso: action.progreso,
        partialResults: state.partialResults.map((r) =>
          r.id === action.id ? { ...r, passed: action.passed } : r,
        ),
      }
    case 'SCAN_COMPLETE':
      return { ...state, fase: 'reporting', resultados: action.resultados, progreso: 100 }
    case 'OPEN_CONSULT':
      return { ...state, fase: 'consulting', consultaActiva: action.check, estadoIA: 'idle', recomendacion: null }
    case 'CLOSE_CONSULT':
      return { ...state, fase: 'reporting', consultaActiva: null, estadoIA: 'idle', recomendacion: null }
    case 'SET_ESTADO_IA':
      return { ...state, estadoIA: action.estado }
    case 'SET_RECOMENDACION':
      return { ...state, recomendacion: action.recomendacion }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function VulnScanner() {
  const [state, dispatch] = useReducer(scanReducer, initialState, () => {
    const saved = localStorage.getItem('_vs_last_report')
    return saved ? { ...initialState } : initialState
  })

  const runScan = useCallback(async () => {
    if (!state.sistemaDetectado) return
    dispatch({ type: 'START_SCAN' })

    const results: ScanResult[] = []
    const ctx = state.sistemaDetectado as unknown as Parameters<typeof SCAN_CHECKS[0]['verificar']>[0]

    for (let i = 0; i < SCAN_CHECKS.length; i++) {
      const check = SCAN_CHECKS[i]
      dispatch({ type: 'CHECK_RUNNING', id: check.id })

      await new Promise((r) => setTimeout(r, 180 + Math.random() * 220))

      let passed = false
      try {
        passed = Boolean(await check.verificar(ctx as any))
      } catch {
        passed = false
      }

      const progreso = Math.round(((i + 1) / SCAN_CHECKS.length) * 100)
      dispatch({ type: 'CHECK_DONE', id: check.id, passed, progreso })
      results.push({ check, passed })
    }

    localStorage.setItem('_vs_last_report', JSON.stringify({ date: Date.now(), results: results.map((r) => ({ id: r.check.id, passed: r.passed })) }))
    dispatch({ type: 'SCAN_COMPLETE', resultados: results })
  }, [state.sistemaDetectado])

  const handleDetect = useCallback(() => {
    dispatch({ type: 'START_DETECT' })
    const info = detectSystemInfo()
    dispatch({ type: 'SYSTEM_DETECTED', payload: info })
  }, [])

  const handleConsult = useCallback(
    async (check: ScanCheck) => {
      if (!state.sistemaDetectado) return
      dispatch({ type: 'OPEN_CONSULT', check })

      const resultado = await obtenerRecomendacionValidada(
        check,
        state.sistemaDetectado,
        (estado) => dispatch({ type: 'SET_ESTADO_IA', estado }),
      )
      dispatch({ type: 'SET_RECOMENDACION', recomendacion: resultado })
    },
    [state.sistemaDetectado],
  )

  return (
    <div className="vs-page">
      <AnimatePresence mode="wait">
        {state.fase === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <WelcomeCard onStart={handleDetect} />
          </motion.div>
        )}

        {state.fase === 'detecting' && (
          <motion.div key="detecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {state.sistemaDetectado && (
              <>
                <SystemDetector info={state.sistemaDetectado} />
                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                  <NeonButton color="red" onClick={runScan}>
                    ⚔️ Comenzar escaneo de seguridad
                  </NeonButton>
                </div>
              </>
            )}
          </motion.div>
        )}

        {state.fase === 'scanning' && (
          <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ScanProgress results={state.partialResults} progreso={state.progreso} />
          </motion.div>
        )}

        {(state.fase === 'reporting' || state.fase === 'consulting') && (
          <motion.div key="reporting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SecurityReport
              results={state.resultados}
              sistema={state.sistemaDetectado!}
              onConsult={handleConsult}
              onRescan={() => dispatch({ type: 'RESET' })}
            />

            {state.fase === 'consulting' && state.consultaActiva && (
              <div style={{ marginTop: '1.5rem' }}>
                <IADualConsultant
                  check={state.consultaActiva}
                  estadoIA={state.estadoIA}
                  resultado={state.recomendacion}
                  onClose={() => dispatch({ type: 'CLOSE_CONSULT' })}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Welcome Card ───────────────────────────────────────────────────────────

function WelcomeCard({ onStart }: { onStart: () => void }) {
  return (
    <div className="vs-welcome">
      <div className="vs-welcome-title">🥋 BIENVENIDO AL DOJO DE SEGURIDAD DIGITAL</div>
      <div className="vs-welcome-subtitle">
        "Así como el karate protege el cuerpo, la ciberseguridad protege tu negocio." — Sensei Dojo
      </div>

      <p style={{ color: 'var(--text-primary)', marginBottom: '1.5rem', fontSize: '.9rem', lineHeight: 1.7 }}>
        En los próximos minutos voy a revisar tu equipo, como un médico revisa tu salud. Al final tendrás:
      </p>

      <div className="vs-welcome-features">
        <div className="vs-feature-item">🎯 Tu nivel de seguridad actual</div>
        <div className="vs-feature-item">⚠️ Las puertas abiertas que debes cerrar</div>
        <div className="vs-feature-item">🤖 Consejos personalizados del Sensei IA</div>
        <div className="vs-feature-item">📊 Tu cinturón digital de seguridad</div>
      </div>

      <div className="vs-welcome-meta">
        <span>⏱️ Tiempo estimado: 2–3 minutos</span>
        <span>💰 Costo: GRATIS</span>
        <span>🔒 Sin datos personales enviados</span>
      </div>

      <NeonButton color="red" onClick={onStart}>
        ⚔️ INICIAR DIAGNÓSTICO
      </NeonButton>
    </div>
  )
}
