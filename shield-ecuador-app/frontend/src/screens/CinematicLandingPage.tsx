import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Clock3, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'
import { CinematicPublicShell } from '../components/CinematicPublicShell'
import { BeltBadge } from '../components/CyberBushido'
import { DoggoArt } from '../components/DojoCompanion'
import { beltPath } from '../data/ciberDojo'

export function LandingPage() {
  const { user } = useAuth()
  const { deferredPrompt, install } = usePwaInstallPrompt()
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [videoError, setVideoError] = useState(false)
  useEffect(() => {
    const v = video.current
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // The page mounts inside PageTransition, whose entrance animation starts
    // at opacity:0 / blur(10px) and takes ~0.58s to settle. iOS Safari's
    // autoplay policy checks whether the video is actually visible at the
    // moment .play() is called and silently refuses it if it isn't yet — so
    // the first attempt (right on mount) can be rejected there even though
    // it succeeds everywhere else (Android's policy is more lenient about
    // it). Retry once the entrance transition has had time to finish.
    void v?.play().catch(() => {})
    const retry = window.setTimeout(() => { void v?.play().catch(() => {}) }, 650)
    const hide = () => { if (document.hidden) v?.pause() }
    document.addEventListener('visibilitychange', hide)
    return () => { window.clearTimeout(retry); v?.pause(); document.removeEventListener('visibilitychange', hide) }
  }, [])
  return <CinematicPublicShell>
    <section className="cinema-hero">
      <video ref={video} className="cinema-hero-video" src="/cinematic/sensei.mp4" poster="/cinematic/sensei-poster.jpg" muted playsInline preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} aria-label="Sensei en el dojo" />
      <button className="cinema-video-control" onClick={() => { if (playing) video.current?.pause(); else void video.current?.play().catch(() => setVideoError(true)) }}>{playing ? 'Pausar ambiente Ⅱ' : 'Reproducir ambiente ▷'}</button>
      {videoError && <p className="cinema-video-error" role="status">No se pudo reproducir el video. Puedes seguir explorando el dojo.</p>}
      <div className="cinema-hero-copy"><span className="cinema-eyebrow">TU VIDA DIGITAL, EN BUENAS MANOS</span><h1><span className="cinema-hero-intro">APRENDE GRATIS A</span><span>DEFENDERTE</span><span className="cinema-hero-connector">DE LOS</span><em>CIBERATAQUES</em></h1><p>Protege tu dinero, tus mensajes y lo que más importa. Sin palabras difíciles. A tu ritmo.</p>
      <div className="cinema-actions"><Link className="cinema-button" to={user ? '/dashboard' : '/login?mode=register'}>{user ? 'Continuar mi entrenamiento' : 'Comenzar gratis'} <ArrowUpRight size={18} /></Link><Link className="cinema-text-link" to="/practica">Probar sin cuenta ↗</Link></div><p className="cinema-reassurance"><ShieldCheck size={16} /> No necesitas saber de informática para empezar.</p></div>
      <div className="cinema-sensei-caption"><strong>Primero, respira.</strong><span>DESPUÉS, VERIFICA.</span></div>
    </section>
    <div className="cinema-container">
      <section className="cinema-belt-path"><div><span className="cinema-eyebrow">TU CAMINO EMPIEZA AQUÍ</span><h2>Un cinturón a la vez.</h2></div><div className="cinema-belts">{beltPath.map(b => <Link key={b.level} to={user ? '/dojos' : '/practica'} aria-label={`Explorar cinturón ${b.label}`}><BeltBadge level={b.level} showKanji={false} size="lg" /></Link>)}</div></section>
      <section className="doggo-feature"><DoggoArt /><div><span className="cinema-eyebrow">CONOCE A TU COMPAÑERO ESPECIAL</span><h2>DoggoTeka.<br /><em>De tu lado, siempre.</em></h2><p>Nuestra mascota te acompaña a aprender sin miedo a equivocarte. Un hábito pequeño hoy puede ayudarte a evitar un engaño mañana.</p><Link className="cinema-text-link" to="/personajes/doggoteka">Conoce su historia y sus defensas ↗</Link></div></section>
      <section className="cinema-section"><span className="cinema-eyebrow">PEQUEÑOS PASOS. GRANDES DEFENSAS.</span><h2 className="cinema-section-title">Tu dojo para la vida real.</h2><div className="cinema-feature-grid">
        <Link className="cinema-training-feature" to={user ? '/dojos' : '/practica'}><img src="/cinematic/sensei.jpg" alt="Sensei Ren, guía del entrenamiento" loading="lazy" /><div><span className="cinema-eyebrow">APRENDE Y PRACTICA</span><h3>Una pregunta.<br />Una nueva defensa.</h3><p>30 preguntas por dojo. Explicaciones claras, aciertes o no.</p><span className="cinema-text-link">Entrar a mi dojo ↗</span></div></Link>
        <Link className="cinema-kata-feature" to={user ? '/dojos' : '/practica'}><div><span className="cinema-eyebrow">TU PRÓXIMO DESAFÍO</span><h3>Del aprendizaje<br />a la acción.</h3><p>Al completar tus 30 preguntas, presenta cinco casos. Con cuatro aciertos, apruebas tu kata.</p><span className="cinema-text-link">Conocer el kata ↗</span></div></Link>
      </div></section>
      <section className="cinema-tools"><div><span className="cinema-eyebrow">TAMBIÉN ESTAMOS AQUÍ PARA AYUDARTE</span><h2 className="cinema-section-title">Más formas de cuidarte.</h2></div><div className="cinema-tool-grid">{[
        ['/sensei','01','Pregunta al sensei','Aclara una duda sobre mensajes, cuentas o compras.'],
        ['/escaner','02','Revisa tu seguridad','Consulta las comprobaciones que permite tu navegador.'],
        ['/ranking','03','Tabla de honor','Conoce el avance de la comunidad.'],
        ['/perfil','04','Tu perfil y tu progreso','Consulta tu cinturón y elige quién te acompaña.'],
      ].map(([to,n,title,description]) => <Link to={to} key={to}><span>{n} <ArrowUpRight size={18} /></span><h3>{title}</h3><p>{description}</p></Link>)}</div></section>
      <section className="cinema-promises">{[
        { Icon:BookOpen,title:'Aprendes con cada respuesta',copy:'Te explicamos el porqué con palabras sencillas.' },
        { Icon:Clock3,title:'Tu tiempo, tus pasos',copy:'En tu cuenta, sal y vuelve a tu última pregunta.' },
        { Icon:ShieldCheck,title:'Practica con confianza',copy:'Aprende a reconocer riesgos en situaciones cotidianas.' },
      ].map(({Icon,title,copy}) => <article key={title}><Icon size={23} /><div><h3>{title}</h3><p>{copy}</p></div></article>)}</section>
      {deferredPrompt && <button className="cinema-button" onClick={() => void install()}>Instalar ciberDojo en este dispositivo</button>}
    </div>
  </CinematicPublicShell>
}
