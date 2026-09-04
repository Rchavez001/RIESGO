import React from 'react'
import { motion } from 'framer-motion'
import { SCAN_CHECKS } from '../../data/scanChecks'

interface ScanResult {
  id: string
  passed: boolean | null
}

interface ScanProgressProps {
  results: ScanResult[]
  progreso: number
}

const CAPA_ICONS: Record<string, string> = {
  RED: '⚔️',
  SO: '🛡️',
  NAVEGADOR: '🔍',
  USUARIO: '👤',
}

export function ScanProgress({ results, progreso }: ScanProgressProps) {
  const getStatus = (id: string) => {
    const r = results.find((x) => x.id === id)
    if (!r) return 'pending'
    if (r.passed === null) return 'running'
    return r.passed ? 'pass' : 'fail'
  }

  const statusLabel: Record<string, string> = {
    pending: '⏳',
    running: '🔄',
    pass: '✅',
    fail: '⚠️',
  }

  const statusBadge: Record<string, string> = {
    pending: 'Esperando',
    running: 'Analizando...',
    pass: 'Seguro',
    fail: 'Atención',
  }

  return (
    <motion.div
      className="vs-scan-box"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.5rem' }}>
        <span className="vs-ninja-spin" aria-hidden="true" style={{ fontSize: '1.4rem' }}>⭐</span>
        <span style={{ color: 'var(--neon-cyan)', fontSize: '.9rem' }}>
          🥋 <em>"El Sensei está inspeccionando tu equipo..."</em>
        </span>
      </div>

      <div className="vs-progress-bar-wrap" role="progressbar" aria-valuenow={progreso} aria-valuemin={0} aria-valuemax={100}>
        <div className="vs-progress-bar" style={{ width: `${progreso}%` }} />
      </div>
      <div style={{ textAlign: 'right', fontSize: '.75rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        {progreso}%
      </div>

      {SCAN_CHECKS.map((check) => {
        const status = getStatus(check.id)
        return (
          <div key={check.id} className={`vs-check-row ${status === 'running' ? 'scanning' : ''}`}>
            <span className="vs-check-status" aria-hidden="true">{statusLabel[status]}</span>
            <span className="vs-check-label">
              {CAPA_ICONS[check.capa]} {check.nombre}
            </span>
            <span className={`vs-check-badge ${status}`}>{statusBadge[status]}</span>
          </div>
        )
      })}
    </motion.div>
  )
}
