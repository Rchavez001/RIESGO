import React from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import type { ScanCheck } from '../../data/scanChecks'

const RISK_LABELS: Record<string, string> = {
  critico: '🔴 CRÍTICO',
  alto: '🟠 ALTO',
  medio: '🟡 MEDIO',
  bajo: '🟢 BAJO',
}

interface VulnCardProps {
  check: ScanCheck
  passed: boolean
  onConsult?: (check: ScanCheck) => void
  index?: number
}

export function VulnCard({ check, passed, onConsult, index = 0 }: VulnCardProps) {
  return (
    <motion.div
      className={`vs-vuln-card ${passed ? 'pass' : ''}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => !passed && onConsult?.(check)}
      role={!passed ? 'button' : undefined}
      aria-label={!passed ? `Consultar al Sensei sobre: ${check.nombre}` : check.nombre}
    >
      <div className="vs-vuln-header">
        <span style={{ fontSize: '1.1rem' }}>{passed ? '✅' : '⚠️'}</span>
        <span className="vs-vuln-name">{check.nombre}</span>
        {!passed && (
          <span className={`vs-risk-pill ${check.riesgo}`}>
            {RISK_LABELS[check.riesgo]}
          </span>
        )}
        {!passed && onConsult && (
          <ChevronRight size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
        )}
      </div>
      {!passed && (
        <div className="vs-vuln-analogy">💡 {check.explicacion_simple}</div>
      )}
    </motion.div>
  )
}
