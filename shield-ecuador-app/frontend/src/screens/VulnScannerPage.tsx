import React from 'react'
import { motion } from 'framer-motion'
import { pageVariants, SectionHeader } from '../components/CyberBushido'
import { VulnScanner } from '../components/VulnScanner/VulnScanner'

export function VulnScannerPage() {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <SectionHeader
        eyebrow="ESCÁNER DE VULNERABILIDADES · INSTASEG"
        title="Diagnóstico de Seguridad"
        kanji="診"
      />
      <VulnScanner />
    </motion.div>
  )
}
