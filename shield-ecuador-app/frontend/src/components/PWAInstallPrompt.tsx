import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { usePWAInstall } from '../hooks/usePWAInstall'

// ── SVG icons ──────────────────────────────────────────────────────────────

function IOSShareIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

function AndroidInstallIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="10" x2="12" y2="16" />
      <polyline points="9 13 12 16 15 13" />
    </svg>
  )
}

function ChromeMenuIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16" height="16" viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="12" cy="5"  r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function IOSInstructions({ onDismiss }: { onDismiss: () => void }) {
  const steps = [
    {
      icon: <IOSShareIcon />,
      text: (
        <>
          Toca el botón <strong>Compartir</strong>{' '}
          <IOSShareIcon />{' '}
          en la barra de tu navegador
        </>
      ),
    },
    {
      icon: null,
      text: (
        <>
          Desplázate y selecciona{' '}
          <strong>"Añadir a pantalla de inicio"</strong>
        </>
      ),
    },
    {
      icon: null,
      text: (
        <>
          Toca <strong>"Añadir"</strong> para confirmar
        </>
      ),
    },
  ]

  return (
    <>
      <ol style={S.stepList}>
        {steps.map((step, i) => (
          <li key={i} style={S.stepItem}>
            <span style={S.stepNum}>{i + 1}</span>
            <span style={S.stepText}>{step.text}</span>
          </li>
        ))}
      </ol>
      <button style={S.primaryBtn} onClick={onDismiss}>
        Entendido, lo haré ahora
      </button>
    </>
  )
}

function AndroidInstructions({
  hasNativePrompt,
  onInstall,
  onDismiss,
}: {
  hasNativePrompt: boolean
  onInstall: () => Promise<boolean>
  onDismiss: () => void
}) {
  return (
    <>
      {hasNativePrompt && (
        <button
          style={S.primaryBtn}
          onClick={onInstall}
        >
          <AndroidInstallIcon />
          Instalar en este dispositivo
        </button>
      )}

      <div style={S.divider}>
        <span>{hasNativePrompt ? 'o instala manualmente' : 'Cómo instalar'}</span>
      </div>

      <div style={S.manualRow}>
        <span style={S.stepNum}>1</span>
        <span style={S.stepText}>
          Toca el menú <ChromeMenuIcon />{' '}
          <strong>(tres puntos)</strong> de tu navegador
        </span>
      </div>
      <div style={S.manualRow}>
        <span style={S.stepNum}>2</span>
        <span style={S.stepText}>
          Selecciona{' '}
          <strong>"Añadir a pantalla de inicio"</strong>
        </span>
      </div>

      {!hasNativePrompt && (
        <button style={S.primaryBtn} onClick={onDismiss}>
          Entendido
        </button>
      )}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function PWAInstallPrompt() {
  const { platform, visible, hasNativePrompt, triggerAndroidInstall, dismiss } =
    usePWAInstall()

  if (platform === 'standalone' || platform === 'desktop') return null

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            style={S.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Instalar Ciber Dojo"
            style={S.drawer}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
          >
            {/* Drag handle */}
            <div style={S.handle} />

            {/* Header */}
            <div style={S.header}>
              <div style={S.appInfo}>
                <span style={S.torii}>⛩</span>
                <div>
                  <div style={S.appName}>CIBER DOJO</div>
                  <div style={S.appSub}>
                    {platform === 'ios' ? 'Safari · iOS' : 'Chrome · Android'}
                  </div>
                </div>
                <span style={S.badge}>INSTALAR</span>
              </div>
              <button
                style={S.closeBtn}
                onClick={dismiss}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Value prop */}
            <p style={S.valueProp}>
              Lleva el Dojo siempre contigo —{' '}
              <strong>acceso instantáneo</strong>, sin abrir el navegador.
            </p>

            {/* Platform-specific body */}
            {platform === 'ios' ? (
              <IOSInstructions onDismiss={dismiss} />
            ) : (
              <AndroidInstructions
                hasNativePrompt={hasNativePrompt}
                onInstall={triggerAndroidInstall}
                onDismiss={dismiss}
              />
            )}

            {/* Later link */}
            <button style={S.laterBtn} onClick={dismiss}>
              Más tarde
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Inline styles ──────────────────────────────────────────────────────────

const S = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 9998,
    backdropFilter: 'blur(4px)',
  },

  drawer: {
    position: 'fixed' as const,
    bottom: 0,
    left: 0,
    right: 0,
    margin: '0 auto',
    maxWidth: 480,
    background: 'linear-gradient(160deg, #0d1b2a 0%, #0a1628 100%)',
    borderTop: '1px solid rgba(0,200,232,0.22)',
    borderLeft: '1px solid rgba(0,200,232,0.10)',
    borderRight: '1px solid rgba(0,200,232,0.10)',
    borderRadius: '20px 20px 0 0',
    padding: '0 20px 32px',
    zIndex: 9999,
    boxShadow: '0 -8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,200,232,0.06)',
  },

  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.18)',
    margin: '12px auto 20px',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },

  appInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },

  torii: {
    fontSize: 32,
    lineHeight: 1,
    filter: 'drop-shadow(0 0 10px rgba(0,200,232,0.5))',
  },

  appName: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: 800,
    fontSize: 15,
    letterSpacing: '0.10em',
    color: '#e8f4f8',
  },

  appSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: '0.05em',
    marginTop: 2,
  },

  badge: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.10em',
    color: '#000',
    background: '#00C8E8',
    padding: '3px 7px',
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginLeft: 4,
  },

  closeBtn: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer',
    padding: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background 0.15s',
  },

  valueProp: {
    fontSize: 14,
    lineHeight: 1.55,
    color: 'rgba(255,255,255,0.65)',
    margin: '0 0 18px',
  },

  stepList: {
    listStyle: 'none',
    margin: '0 0 20px',
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },

  stepItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  },

  stepNum: {
    flexShrink: 0,
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: 'rgba(0,200,232,0.15)',
    border: '1px solid rgba(0,200,232,0.35)',
    color: '#00C8E8',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepText: {
    fontSize: 13.5,
    lineHeight: 1.5,
    color: 'rgba(255,255,255,0.75)',
    paddingTop: 4,
  },

  manualRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },

  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '16px 0',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    letterSpacing: '0.05em',
  },

  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '14px 20px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #00C8E8 0%, #0096b4 100%)',
    color: '#000',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    marginBottom: 12,
    boxShadow: '0 4px 20px rgba(0,200,232,0.3)',
    transition: 'opacity 0.15s',
  },

  laterBtn: {
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    cursor: 'pointer',
    padding: '10px 0 0',
    textAlign: 'center' as const,
    transition: 'color 0.15s',
  },
} as const
