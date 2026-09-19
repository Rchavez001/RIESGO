import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { RotateCcw, X } from 'lucide-react'

// Explainer for first-time visitors ("El primer consejo de tu Sensei"). Opened
// by a click, so playing with sound is allowed; the file itself is only
// requested once the dialog mounts, keeping the 8 MB out of the landing load.
export function SenseiVideoModal({ onClose, onTryGuest, returnFocusTo }: {
  onClose: () => void
  onTryGuest: (e: React.MouseEvent) => void
  // Safari does not focus a button when it is clicked, so document.activeElement
  // at open time is <body>: the opener has to be passed in to get focus back.
  returnFocusTo?: React.RefObject<HTMLElement | null>
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    const focusTarget = returnFocusTo?.current ?? (document.activeElement as HTMLElement | null)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    void video.current?.play()?.catch(() => {})

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !dialog.current) return
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button, a[href], video[controls]'))
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
  }, [onClose, returnFocusTo])

  function replay() {
    setEnded(false)
    if (video.current) { video.current.currentTime = 0; void video.current.play()?.catch(() => {}) }
  }

  return createPortal(
    <div className="sensei-video-backdrop" onClick={onClose}>
      <div ref={dialog} className="sensei-video-dialog" role="dialog" aria-modal="true" aria-labelledby="sensei-video-title" onClick={e => e.stopPropagation()}>
        <div className="sensei-video-head">
          <div><span className="cinema-eyebrow">MANUAL EN VIDEO · 45 SEGUNDOS</span><h2 id="sensei-video-title">El primer consejo de tu Sensei</h2></div>
          <button ref={closeButton} className="sensei-video-close" onClick={onClose} aria-label="Cerrar video"><X size={20} /></button>
        </div>
        <div className="sensei-video-stage">
          <video ref={video} src="/cinematic/sensei-primer-consejo.mp4" poster="/cinematic/sensei-primer-consejo-poster.jpg" controls playsInline preload="auto" onEnded={() => setEnded(true)} onPlay={() => setEnded(false)} />
          {ended && (
            <div className="sensei-video-end" role="group" aria-label="Siguiente paso">
              <p>¿Listo para tu primer dojo?</p>
              <div className="sensei-video-end-actions">
                <Link className="cinema-button" to="/registro" onClick={onClose}>Regístrate gratis</Link>
                <Link className="cinema-button secondary" to="/dojos" onClick={e => { onClose(); onTryGuest(e) }}>Probar sin cuenta</Link>
              </div>
              <button className="sensei-video-replay" onClick={replay}><RotateCcw size={14} /> Ver de nuevo</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
