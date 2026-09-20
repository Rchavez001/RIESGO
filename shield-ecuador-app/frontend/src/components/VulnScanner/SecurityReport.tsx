import React from 'react'
import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { NeonButton } from '../CyberBushido'
import { BeltDisplay } from './BeltDisplay'
import { VulnCard } from './VulnCard'
import { BELT_SYSTEM, assignBelt } from '../../data/vulnerableVersions'
import type { ScanCheck } from '../../data/scanChecks'
import type { SystemInfo } from '../../services/senseiIA'

interface ScanResult {
  check: ScanCheck
  passed: boolean
}

interface SecurityReportProps {
  results: ScanResult[]
  sistema: SystemInfo
  onConsult: (check: ScanCheck) => void
  onRescan: () => void
}

function calculateScore(results: ScanResult[]): number {
  if (!results.length) return 0
  const WEIGHTS: Record<string, number> = { critico: 20, alto: 12, medio: 7, bajo: 4 }
  let total = 0
  let max = 0
  for (const r of results) {
    const w = WEIGHTS[r.check.riesgo] ?? 5
    max += w
    if (r.passed) total += w
  }
  return Math.round((total / max) * 100)
}

function exportReport(results: ScanResult[], sistema: SystemInfo, score: number, beltName: string): void {
  const belt = BELT_SYSTEM[beltName]
  const failed = results.filter((r) => !r.passed)
  const passed = results.filter((r) => r.passed)
  const date = new Date().toLocaleString('es-EC')

  const lines = [
    "╔══════════════════════════════════════════╗",
    "║   🥋 REPORTE DEL SENSEI                 ║",
    "║   Ciber Dojo — Análisis de Seguridad    ║",
    "╚══════════════════════════════════════════╝",
    "",
    `Fecha: ${date}`,
    `Sistema: ${sistema.os} ${sistema.osVersion} · ${sistema.browser} ${sistema.browserVersion}`,
    `Dispositivo: ${sistema.deviceType}`,
    "",
    `Puntuación: ${score}/100  ${belt?.emoji} CINTURÓN ${beltName.toUpperCase()}`,
    `"${belt?.mensaje}"`,
    "",
    "━".repeat(44),
    "",
    `✅ LO QUE HACES BIEN (${passed.length} cosas):`,
    ...passed.map((r) => `  ✅ ${r.check.nombre}`),
    "",
    `⚠️ LO QUE DEBES MEJORAR (${failed.length} cosas):`,
    ...failed.map((r) => {
      const urgency = r.check.riesgo === 'critico' ? '🔴 [URGENTE]' : r.check.riesgo === 'alto' ? '🟠 [PRONTO]' : '🟡 [DESPUÉS]'
      return `  ${urgency}  ${r.check.nombre}`
    }),
    "",
    "━".repeat(44),
    "",
    "INSTASEG © Raúl Chávez Drouet — Ciber Dojo v1.0",
  ]

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `reporte-ciber-dojo-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

export function SecurityReport({ results, sistema, onConsult, onRescan }: SecurityReportProps) {
  const score = calculateScore(results)
  const beltName = assignBelt(score)
  const failed = results.filter((r) => !r.passed)
  const passed = results.filter((r) => r.passed)

  return (
    <motion.div
      className="vs-report"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="vs-report-header">
        <h2 className="vs-report-title" data-autofocus tabIndex={-1}>🥋 REPORTE DEL SENSEI</h2>
        <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginBottom: '.5rem' }}>
          Comprobaciones orientativas del navegador. No es un análisis completo del equipo.
        </div>

        <BeltDisplay beltName={beltName} score={score} animate />

        <p style={{ fontSize: '.9rem', color: 'var(--text-primary)', marginTop: '1rem', maxWidth: '420px', margin: '1rem auto 0' }}>
          {failed.length === 0
            ? 'Estas comprobaciones no detectaron señales pendientes. Esto no garantiza que el equipo esté libre de amenazas.'
            : `Hay ${failed.length} comprobaciones para revisar. Algunas dependen de la información que el navegador permite consultar.`}
        </p>
      </div>

      <div className="vs-report-body">
        {failed.length > 0 && (
          <>
            <div className="vs-section-title">⚠️ Lo que debes mejorar ({failed.length})</div>
            {failed.map((r, i) => (
              <VulnCard key={r.check.id} check={r.check} passed={false} onConsult={onConsult} index={i} />
            ))}
          </>
        )}

        {passed.length > 0 && (
          <>
            <div className="vs-section-title">✅ Lo que haces bien ({passed.length})</div>
            {passed.map((r, i) => (
              <VulnCard key={r.check.id} check={r.check} passed index={i} />
            ))}
          </>
        )}
      </div>

      <div className="vs-report-actions">
        <NeonButton color="cyan" variant="outline" onClick={() => onConsult(failed[0]?.check ?? results[0]?.check)}>
          🤖 Consultar al Sensei IA
        </NeonButton>
        <NeonButton
          color="gold"
          variant="ghost"
          onClick={() => exportReport(results, sistema, score, beltName)}
        >
          <Download size={15} style={{ display: 'inline', marginRight: '.35rem' }} />
          Descargar reporte
        </NeonButton>
        <NeonButton color="red" variant="ghost" onClick={onRescan}>
          🔄 Nuevo escaneo
        </NeonButton>
      </div>
    </motion.div>
  )
}
