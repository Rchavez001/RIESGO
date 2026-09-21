import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CyberToastList } from '../components/CyberToast'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

type ToastItem = {
  id: string
  message: string
  tone: ToastTone
}

type ToastContextValue = {
  notify: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((current) => [{ id, message, tone }, ...current])
    // Auto-dismiss lives in CyberToastList so it can pause while the toast is hovered or focused.
  }, [])

  const dismiss = useCallback((id: string) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])
  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <CyberToastList toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
