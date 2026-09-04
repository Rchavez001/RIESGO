import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, ShieldAlert, Zap } from 'lucide-react'
import { ToastTone } from '../contexts/ToastContext'

const iconMap: Record<ToastTone, React.ReactNode> = {
  info: <Info size={18} />,
  success: <CheckCircle2 size={18} />,
  warning: <Zap size={18} />,
  danger: <ShieldAlert size={18} />,
}

const toneLabel: Record<ToastTone, string> = {
  info: 'SENSEI',
  success: 'EXITO',
  warning: 'ATENCIÓN',
  danger: 'RIESGO',
}

export function CyberToastList({
  toasts,
  onDismiss,
}: {
  toasts: Array<{ id: string; message: string; tone: ToastTone }>
  onDismiss: (id: string) => void
}) {
  return (
    <div className="cyber-toast-list">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={`cyber-toast ${toast.tone}`}
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="toast-icon">{iconMap[toast.tone]}</div>
            <div>
              <div className="toast-title">{toneLabel[toast.tone]}</div>
              <p>{toast.message}</p>
            </div>
            <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Cerrar notificación">
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
