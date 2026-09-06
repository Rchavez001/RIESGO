import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import { Howl } from 'howler'
import { Play, Shield, ChevronRight } from 'lucide-react'
import { BeltBadge, ScanlineOverlay } from '../components/CyberBushido'
import { beltPath, senseiQuotes } from '../data/ciberDojo'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'
import { useAuth } from '../contexts/AuthContext'

const BOW_DURATION_MS = 2500

export function LandingPage() {
  const navigate  = useNavigate()
  const quote     = senseiQuotes[0]
  const { deferredPrompt, install } = usePwaInstallPrompt()
  const { user, loading } = useAuth()
  const [showBow, setShowBow]   = useState(false)
  const [busy, setBusy]         = useState(false)
  const howlRef = useRef<Howl | null>(null)

  /* ── GSAP refs ───────────────────────────────────────── */
  const cornersRef  = useRef<HTMLDivElement>(null)
  const hudRef      = useRef<HTMLDivElement>(null)
  const eyebrowRef  = useRef<HTMLDivElement>(null)
  const line1Ref    = useRef<HTMLSpanElement>(null)
  const line2Ref    = useRef<HTMLSpanElement>(null)
  const lineConnectorRef = useRef<HTMLSpanElement>(null)
  const line3Ref    = useRef<HTMLSpanElement>(null)
  const taglineRef  = useRef<HTMLParagraphElement>(null)
  const ctaRef      = useRef<HTMLDivElement>(null)
  const senseiRef   = useRef<HTMLDivElement>(null)
  const statsRef    = useRef<HTMLElement>(null)
  const beltRef     = useRef<HTMLElement>(null)
  const featRef     = useRef<HTMLElement>(null)

  /* Preload audio */
  useEffect(() => {
    howlRef.current = new Howl({ src: ['/sensei-osu.wav'], preload: true })
    return () => { howlRef.current?.unload() }
  }, [])

  /* GSAP cinematic boot sequence */
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const targets = [
      cornersRef.current, hudRef.current, eyebrowRef.current,
      line1Ref.current, line2Ref.current, lineConnectorRef.current, line3Ref.current,
      taglineRef.current, ctaRef.current, senseiRef.current,
      statsRef.current, beltRef.current, featRef.current,
    ]

    gsap.set(targets, { autoAlpha: 0 })
    gsap.set([line1Ref.current, line2Ref.current, lineConnectorRef.current, line3Ref.current], { y: 80, skewX: -4 })
    gsap.set([eyebrowRef.current, taglineRef.current], { y: 24 })
    gsap.set(ctaRef.current, { y: 30 })
    gsap.set(senseiRef.current, { scale: 0.9, x: 30 })
    gsap.set([statsRef.current, beltRef.current, featRef.current], { y: 40 })

    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
    tl
      .to(cornersRef.current, { autoAlpha: 1, duration: 0.3 })
      .to(hudRef.current,     { autoAlpha: 1, duration: 0.3 }, '+=0.1')
      .to(eyebrowRef.current, { autoAlpha: 1, y: 0, duration: 0.4 }, '-=0.1')
      .to(line1Ref.current,   { autoAlpha: 1, y: 0, skewX: 0, duration: 0.55 }, '-=0.1')
      .to(line2Ref.current,   { autoAlpha: 1, y: 0, skewX: 0, duration: 0.55 }, '-=0.38')
      .to(lineConnectorRef.current, { autoAlpha: 1, y: 0, skewX: 0, duration: 0.35 }, '-=0.3')
      .to(line3Ref.current,   { autoAlpha: 1, y: 0, skewX: 0, duration: 0.55 }, '-=0.25')
      .to(taglineRef.current, { autoAlpha: 1, y: 0, duration: 0.4 }, '-=0.15')
      .to(ctaRef.current,     { autoAlpha: 1, y: 0, duration: 0.4 }, '-=0.15')
      .to(senseiRef.current,  { autoAlpha: 1, scale: 1, x: 0, duration: 0.75, ease: 'back.out(1.2)' }, '-=0.5')
      .to(statsRef.current,   { autoAlpha: 1, y: 0, duration: 0.45 }, '-=0.2')
      .to(beltRef.current,    { autoAlpha: 1, y: 0, duration: 0.4 }, '-=0.3')
      .to(featRef.current,    { autoAlpha: 1, y: 0, duration: 0.4 }, '-=0.25')

    return () => { tl.kill() }
  }, [])

  function startTraining() {
    if (busy) return
    setBusy(true)
    setShowBow(true)
    howlRef.current?.play()
    setTimeout(() => {
      setShowBow(false)
      navigate(user ? '/dashboard' : '/login')
    }, BOW_DURATION_MS)
  }

  return (
    <ScanlineOverlay>
      {/* ── BOW OVERLAY ─────────────────────────────────── */}
      {/* Portaled to <body>: PageTransition animates transform/filter on its wrapper,
          which creates a containing block that breaks position:fixed for descendants. */}
      {showBow && createPortal(
        <div className="bow-overlay" aria-hidden="true">
          <img src="/sensei-reverencia.gif" alt="" />
        </div>,
        document.body
      )}

      <div className="lp-page">

        {/* ── CINEMATIC VIDEO BACKGROUND ───────────────── */}
        <video
          className="lp-video-bg"
          src="/hero-cinematic.mp4"
          autoPlay muted loop playsInline
          aria-hidden="true"
        />
        <div className="lp-video-overlay" aria-hidden="true" />

        {/* ── HUD CORNERS ──────────────────────────────── */}
        <div ref={cornersRef} className="hud-corners" aria-hidden="true">
          <span className="hud-c hud-tl" />
          <span className="hud-c hud-tr" />
          <span className="hud-c hud-bl" />
          <span className="hud-c hud-br" />
        </div>

        {/* ── HUD TOP BAR ──────────────────────────────── */}
        <div ref={hudRef} className="lp-hud-top" aria-hidden="true">
          <span>サイバー道場 · SYS-ONLINE</span>
          <span className="hud-dot" />
          <span>SHIELD ECUADOR v2.0</span>
        </div>

        {/* ── HERO ─────────────────────────────────────── */}
        <section className="lp-hero">

          {/* Left: copy */}
          <div className="lp-copy">
            <div ref={eyebrowRef} className="lp-eyebrow">
              <span className="lp-tag">// SISTEMA DE ENTRENAMIENTO</span>
            </div>

            <h1 className="lp-title">
              <div className="lp-headline-top">
                <span ref={line1Ref} className="lp-t1">APRENDE <span className="lp-t1-accent">GRATIS</span> A</span>
                <span ref={line2Ref} className="lp-t2"><em>DEFENDERTE</em></span>
                {!user && (
                  <button
                    type="button"
                    className="lp-signup-badge"
                    onClick={() => navigate('/login?mode=register')}
                    aria-label="Inscribete gratis"
                  >
                    <span>INSCRÍBETE</span>
                  </button>
                )}
              </div>
              <span ref={lineConnectorRef} className="lp-t-connector">DE LOS</span>
              <span ref={line3Ref} className="lp-t3 lp-t3--medium">
                {'CIBERATAQUES'.split('').map((char, index) => (
                  <span key={index} className="lp-t3-letter" style={{ animationDelay: `${index * 0.3}s` }}>
                    {char}
                  </span>
                ))}
              </span>
            </h1>

            <p ref={taglineRef} className="lp-tagline">
              Cinturón Blanco → Negro. Entrenamiento de ciberseguridad<br />
              explicado en lenguaje sencillo para personas y negocios.
            </p>

            <div ref={ctaRef} className="lp-cta-group">
              <button
                className="lp-btn-primary"
                onClick={startTraining}
                disabled={loading || busy}
              >
                {loading ? <Shield size={18} /> : <Play size={18} />}
                {user ? 'CONTINUAR' : 'COMENZAR ENTRENAMIENTO'}
                <ChevronRight size={16} className="lp-chevron" />
              </button>

              <button
                className="lp-btn-ghost"
                onClick={() => document.getElementById('rangos')?.scrollIntoView({ behavior: 'smooth' })}
              >
                VER RANGOS
              </button>

              {deferredPrompt && (
                <button className="lp-btn-ghost" onClick={() => void install()}>
                  <Shield size={14} /> INSTALAR APP
                </button>
              )}
            </div>

            <p className="lp-install-hint">Disponible en Android e iOS · Sin costo</p>
          </div>

          {/* Right: real sensei photo (standing) */}
          <div ref={senseiRef} className="lp-sensei-col">
            <div className="lp-sensei-photo-wrap">
              <img
                src="/sensei-de-pie.jpg"
                alt="Sensei del Ciber Dojo"
                className="lp-sensei-photo"
              />
              {/* Quote bubble */}
              <div className="lp-sensei-bubble">
                <span className="lp-sensei-jp">{quote.jp}</span>
                <p className="lp-sensei-es">{quote.es}</p>
              </div>
            </div>
          </div>

        </section>

        {/* ── STATS BAR ────────────────────────────────── */}
        <section ref={statsRef} className="lp-stats">
          {([
            ['1 247', 'GUERREROS ACTIVOS'],
            ['48',    'KATAS DISPONIBLES'],
            ['99.9%', 'DISPONIBILIDAD'],
            ['5',     'CINTURONES'],
          ] as [string, string][]).map(([val, lbl]) => (
            <div className="lp-stat" key={lbl}>
              <strong>{val}</strong>
              <span>{lbl}</span>
            </div>
          ))}
        </section>

        {/* ── BELT PROGRESSION ─────────────────────────── */}
        <section ref={beltRef} id="rangos" className="lp-belts">
          <div className="lp-section-label">{'// PROGRESIÓN DE RANGOS'}</div>
          <div className="lp-belt-list">
            {beltPath.map((belt, i) => (
              <BeltBadge key={belt.level} level={belt.level} animate={i === 0} />
            ))}
          </div>
        </section>

        {/* ── BATTLE SEQUENCE ──────────────────────────── */}
        <section ref={featRef} className="lp-battle-section">
          <div className="lp-section-label">{'// TÉCNICAS DE COMBATE DIGITAL'}</div>
          <div className="lp-battle-wrap">
            <img
              src="/sensei-batalla.jpg"
              alt="6 técnicas del sensei para derrotar amenazas digitales"
              className="lp-battle-img"
            />
            <p className="lp-battle-caption">
              <span className="lp-battle-kata">KATA 1–6</span>
              Aprende a identificar y neutralizar cada tipo de amenaza digital como lo haría un maestro de artes marciales
            </p>
          </div>
        </section>

      </div>
    </ScanlineOverlay>
  )
}
