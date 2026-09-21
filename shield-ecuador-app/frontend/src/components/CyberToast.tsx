import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, Info, ShieldAlert, Zap } from 'lucide-react'
import { ToastTone } from '../contexts/ToastContext'

const iconMap: Record<ToastTone, React.ReactNode> = {
  info: <Info size={18} aria-hidden="true" />,
  success: <CheckCircle2 size={18} aria-hidden="true" />,
  warning: <Zap size={18} aria-hidden="true" />,
  danger: <ShieldAlert size={18} aria-hidden="true" />,
}

const toneLabel: Record<ToastTone, string> = {
  info: 'SENSEI',
  success: 'ÉXITO',
  warning: 'ATENCIÓN',
  danger: 'RIESGO',
}

const TOAST_MS = 4500

type Toast = { id: string; message: string; tone: ToastTone }

// A notification that vanishes on its own must not vanish while it is being read: the timer pauses while
// the toast is hovered or holds keyboard focus, and restarts (full duration) when the pointer/focus leaves.
function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const reduce = useReducedMotion()
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [paused, toast.id, onDismiss])
  return (
    <motion.div
      className={`cyber-toast ${toast.tone}`}
      role={toast.tone === 'danger' ? 'alert' : undefined}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.96 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="toast-icon">{iconMap[toast.tone]}</div>
      <div>
        <div className="toast-title">{toneLabel[toast.tone]}</div>
        <p>{toast.message}</p>
      </div>
      <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Cerrar notificación">
        <span aria-hidden="true">×</span>
      </button>
    </motion.div>
  )
}

export function CyberToastList({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) {
  return (
    <div className="cyber-toast-list" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}
