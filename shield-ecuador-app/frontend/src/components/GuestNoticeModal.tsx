import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { NeonButton } from './CyberBushido'

// T19b Paso 2B (D-12 opción B, D-16 opción A): aviso breve antes de crear la sesión anónima
// (continueAsGuest en AuthContext.tsx llama a accept-guest-notice justo después de
// signInAnonymously(); si eso falla, deshace la sesión — "sin el aviso breve no se crea la
// sesión anónima" se cumple aunque esta ventana se cierre sin que el usuario la haya visto).
//
// TEXTO PROVISIONAL — [PENDIENTE DE VALIDACIÓN LEGAL]. La persona responsable dará el texto
// definitivo; no publicar este texto en producción sin sustituirlo.
const GUEST_NOTICE_TEXT = (
  <>
    <p className="guest-notice-flag">[PENDIENTE DE VALIDACIÓN LEGAL]</p>
    <p>
      Como invitado puedes practicar el primer dojo sin crear una cuenta. Registramos que
      aceptaste este aviso (fecha y dirección IP, cifradas) y tu sesión de invitado caduca
      automáticamente tras un tiempo de inactividad. No enviamos tus datos a ningún proveedor de
      inteligencia artificial. Si creas una cuenta más adelante, verás el aviso completo de
      privacidad antes de registrarte.
    </p>
  </>
)

export function GuestNoticeModal({ onConfirm, onClose, loading }: {
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const focusTarget = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !dialog.current) return
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button, a[href]'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      focusTarget?.focus()
    }
  }, [onClose])

  return createPortal(
    <div className="sensei-video-backdrop" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} className="auth-card glass-panel consent-step" role="dialog" aria-modal="true" aria-labelledby="guest-notice-title" onClick={e => e.stopPropagation()}>
        <div className="mono-label">MODO INVITADO</div>
        <h2 id="guest-notice-title">Antes de continuar sin cuenta</h2>
        <div className="consent-body">{GUEST_NOTICE_TEXT}</div>
        <p><Link to="/privacidad" target="_blank" rel="noopener noreferrer">Leer el aviso completo de privacidad ↗</Link></p>
        <div className="consent-actions">
          <NeonButton color="cyan" variant="outline" onClick={onClose} disabled={loading}>Cancelar</NeonButton>
          <NeonButton color="gold" variant="outline" onClick={onConfirm} disabled={loading}>Continuar como invitado</NeonButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
