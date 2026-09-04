import React from 'react'
import { motion } from 'framer-motion'
import type { SystemInfo } from '../../services/senseiIA'

interface SystemDetectorProps {
  info: SystemInfo & { isHttps: boolean; connectionType: string; effectiveType: string; timezone?: string; language?: string; resolution?: string }
}

export function SystemDetector({ info }: SystemDetectorProps) {
  const chips = [
    { icon: '💻', label: 'Sistema operativo', value: `${info.os} ${info.osVersion}`.trim() || 'Desconocido' },
    { icon: '🌐', label: 'Navegador', value: `${info.browser} ${info.browserVersion}`.trim() },
    { icon: '📱', label: 'Tipo de dispositivo', value: info.deviceType },
    { icon: '📡', label: 'Tipo de conexión', value: labelConnection(info.connectionType) },
    { icon: '⚡', label: 'Velocidad estimada', value: labelSpeed(info.effectiveType) },
    { icon: '🔒', label: 'Protocolo', value: info.isHttps ? 'HTTPS (seguro)' : 'HTTP (inseguro)' },
    { icon: '🕐', label: 'Zona horaria', value: Intl.DateTimeFormat().resolvedOptions().timeZone },
    { icon: '🗣️', label: 'Idioma', value: navigator.language },
    { icon: '🖥️', label: 'Resolución', value: `${window.screen.width}×${window.screen.height}` },
  ]

  return (
    <motion.div
      className="vs-detector"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p style={{ color: 'var(--text-secondary)', fontSize: '.85rem', marginBottom: '.5rem' }}>
        🥋 <em>"¡Hola, aprendiz! Tu Sensei ha inspeccionado tu equipo..."</em>
      </p>
      <div className="vs-detector-grid">
        {chips.map((chip) => (
          <div key={chip.label} className="vs-info-chip">
            <span>{chip.icon}</span>
            <div>
              <span className="vs-info-label">{chip.label}</span>
              <strong>{chip.value}</strong>
            </div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: '1rem', fontSize: '.82rem', color: 'var(--neon-cyan, #00f0ff)', textAlign: 'center' }}>
        ✅ <em>"¡Perfecto! Ahora comenzamos el entrenamiento de seguridad."</em>
      </p>
    </motion.div>
  )
}

function labelConnection(type: string): string {
  const map: Record<string, string> = {
    wifi: 'WiFi',
    ethernet: 'Ethernet (cable)',
    cellular: 'Red móvil',
    bluetooth: 'Bluetooth',
    wimax: 'WiMAX',
    other: 'Otra red',
    none: 'Sin conexión',
    unknown: 'No detectada',
  }
  return map[type] ?? type
}

function labelSpeed(type: string): string {
  const map: Record<string, string> = {
    'slow-2g': '🐌 Muy lenta (2G lenta)',
    '2g': '🐢 Lenta (2G)',
    '3g': '🚶 Media (3G)',
    '4g': '🚀 Buena (4G/5G)',
  }
  return map[type] ?? 'Buena'
}
