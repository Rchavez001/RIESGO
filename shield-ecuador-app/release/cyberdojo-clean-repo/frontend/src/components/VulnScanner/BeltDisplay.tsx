import React from 'react'
import { motion } from 'framer-motion'
import { BELT_SYSTEM } from '../../data/vulnerableVersions'

interface BeltDisplayProps {
  beltName: string
  score: number
  animate?: boolean
}

export function BeltDisplay({ beltName, score, animate = true }: BeltDisplayProps) {
  const belt = BELT_SYSTEM[beltName] ?? BELT_SYSTEM.blanco
  const isNegro = beltName === 'negro'
  const beltColor = isNegro ? '#374151' : belt.color

  return (
    <div className="vs-belt-wrap">
      <motion.div
        initial={animate ? { scale: 0.7, opacity: 0 } : undefined}
        animate={animate ? { scale: 1, opacity: 1 } : undefined}
        transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.2 }}
      >
        <div className="vs-score-ring" style={{ borderColor: beltColor, color: beltColor }}>
          <span className="vs-score-number">{score}</span>
          <span className="vs-score-label">/ 100</span>
        </div>
      </motion.div>

      <motion.div
        className="vs-belt-strip"
        style={{ width: 160, borderColor: beltColor, background: beltColor + '22' }}
        initial={animate ? { scaleX: 0 } : undefined}
        animate={animate ? { scaleX: 1 } : undefined}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <div
          className="vs-belt-knot"
          style={{ borderColor: beltColor, background: beltColor }}
        />
      </motion.div>

      <motion.div
        initial={animate ? { opacity: 0, y: 8 } : undefined}
        animate={animate ? { opacity: 1, y: 0 } : undefined}
        transition={{ delay: 0.5 }}
        style={{ textAlign: 'center' }}
      >
        <div className="vs-belt-level" style={{ color: beltColor }}>
          {belt.emoji} CINTURÓN {beltName.toUpperCase()}
        </div>
        <div className="vs-belt-msg">{belt.mensaje}</div>
      </motion.div>
    </div>
  )
}
