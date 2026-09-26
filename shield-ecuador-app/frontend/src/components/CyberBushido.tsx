import { campaignImageUrl, safeHttpUrl } from '../lib/safeUrl'
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import { Bot, CheckCircle2, Home, ListChecks, LogOut, Menu, Play, Swords, Trophy, User, Volume2, VolumeX, Wrench, X } from 'lucide-react'
import { beltPath, BeltLevel, KataStatus } from '../data/ciberDojo'
import { supabase } from '../lib/supabase'
import { useDojoAudio } from '../contexts/DojoAudioContext'
import { useAuth } from '../contexts/AuthContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useModalA11y } from '../hooks/useModalA11y'
import { KarateBelt } from './KarateBelt'
import { DoggoArt } from './DojoCompanion'

export const SENSEI_IMAGE_SRC = '/sensei-de-pie.jpg'

export function KataIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 20 20 4" />
      <circle cx="12" cy="9" r="1.6" />
      <path d="M12 10.6 11 15" />
      <path d="M11 12 8.5 15.5" />
      <path d="M11.5 11 14 10" />
      <path d="M11 15 15 17.5 17 20" />
      <path d="M11 15 6.5 19.5" />
    </svg>
  )
}

export const WARRIOR_IMAGES = [
  '/kata-blanco.jpg',
  '/kata-amarillo.jpg',
  '/kata-azul.jpg',
  '/kata-negro.jpg',
  '/kata-negro-2.jpg',
  '/kata-negro-3.jpg',
  '/kata-negro-4.jpg',
  '/kata-negro-5.jpg',
] as const



export const pageVariants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.4 } },
  exit: { opacity: 0, x: 20 },
}

export const containerVariants = {
  animate: { transition: { staggerChildren: 0.08 } },
}

export const cardVariants = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
}

export function ScanlineOverlay({ children }: { children: React.ReactNode }) {
  return <div className="scanlines relative min-h-screen overflow-hidden">{children}</div>
}

export function KanjiBackground({ char, className = '' }: { char: string; className?: string }) {
  return <div className={`kanji-bg ${className}`}>{char}</div>
}

export function NeonButton({
  children,
  variant = 'primary',
  color = 'red',
  onClick,
  type = 'button',
  className = '',
  disabled = false,
  describedBy,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'outline' | 'ghost'
  color?: 'red' | 'cyan' | 'gold'
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
  disabled?: boolean
  describedBy?: string
}) {
  const { playSound } = useDojoAudio()

  return (
    <motion.button
      type={type}
      disabled={disabled}
      aria-describedby={describedBy}
      onClick={() => {
        if (disabled) return
        playSound(color === 'red' ? 'strike' : 'tap')
        onClick?.()
      }}
      whileHover={{ y: -2, scale: 1.015 }}
      whileTap={{ scale: 0.965 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      className={`neon-button btn-katana ${variant} ${color} ${disabled ? 'disabled' : ''} ${className}`}
    >
      <span className="button-energy" aria-hidden="true" />
      {children}
    </motion.button>
  )
}

export function BeltBadge({
  level,
  showKanji = true,
  animate = false,
  size = 'md',
}: {
  level: BeltLevel
  showKanji?: boolean
  animate?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const belt = beltPath.find((item) => item.level === level) ?? beltPath[0]
  const width = size === 'lg' ? 100 : size === 'sm' ? 55 : 80
  return (
    <motion.div
      className={`belt-badge ${animate ? 'active' : ''}`}
      title={`${belt.label}: ${belt.iso}`}
    >
      {showKanji && <span className="belt-kanji" style={{ color: belt.color }}>{belt.kanji}</span>}
      <KarateBelt color={belt.level === 'negro' ? '#353d35' : belt.color} width={width} />
      <span className="belt-label">{belt.label}</span>
    </motion.div>
  )
}

export function XPBar({ current, max, belt }: { current: number; max: number; belt: BeltLevel }) {
  // The XP goal is a display target, not a gate (belts are earned by passing katas): never show "9000/5000".
  const goal = Math.max(max, current)
  const pct = Math.min((current / goal) * 100, 100)
  const beltColor = beltPath.find((item) => item.level === belt)?.color ?? '#00f0ff'
  return (
    <div className="xp-wrap">
      <div className="xp-meta">
        <span>PUNTOS DE APRENDIZAJE</span>
        <strong>{current}/{goal} XP</strong>
      </div>
      <div className="xp-track" role="progressbar" aria-label="Puntos de aprendizaje" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={current}>
        <div className="xp-fill" style={{ width: `${pct}%`, boxShadow: `0 0 18px ${beltColor}`, background: beltColor }} />
      </div>
    </div>
  )
}

export function CyberSensei({
  message,
  messageJP,
  mode = 'idle',
}: {
  message: string
  messageJP: string
  mode?: 'idle' | 'celebrate' | 'award'
}) {
  const [warriorIndex, setWarriorIndex] = useState(0)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return
    const id = window.setInterval(() => {
      setWarriorIndex((i) => (i + 1) % WARRIOR_IMAGES.length)
    }, 1500)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className={`sensei-wrap sensei-${mode}`}>
      <motion.div
        className="sensei-orbit orbit-a"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 16, ease: 'linear' }}
      />
      <motion.div
        className="sensei-orbit orbit-b"
        animate={{ rotate: -360 }}
        transition={{ repeat: Infinity, duration: 22, ease: 'linear' }}
      />
      <motion.div
        className="cyber-sensei"
        animate={mode === 'idle'
          ? { y: [-8, 8, -8] }
          : { y: [-10, 4, -10], scale: [1, 1.025, 1], filter: ['drop-shadow(0 0 34px rgba(0,240,255,.28))', 'drop-shadow(0 0 54px rgba(245,197,24,.36))', 'drop-shadow(0 0 34px rgba(0,240,255,.28))'] }}
        transition={{ repeat: Infinity, duration: mode === 'idle' ? 4 : 2.8, ease: 'easeInOut' }}
      >
        <motion.img
          key={warriorIndex}
          src={WARRIOR_IMAGES[warriorIndex]}
          alt="Guerrera del Ciber Dojo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      </motion.div>
      {mode !== 'idle' && (
        <div className="sensei-energy" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, index) => <span key={index} />)}
        </div>
      )}
      <div className="sensei-bubble">
        <span>{messageJP}</span>
        <p>{message}</p>
      </div>
      <div className="sensei-badge">師範 · SENSEI</div>
    </div>
  )
}

export function DojoCompletionCelebration({
  perfect,
  correct,
  total,
  onContinue,
  onExam,
}: {
  perfect: boolean
  correct: number
  total: number
  onContinue: () => void
  onExam?: () => void
}) {
  const { playSound } = useDojoAudio()

  React.useEffect(() => {
    playSound(perfect ? 'success' : 'strike')
  }, [perfect, playSound])

  return createPortal(
    <motion.div className="dojo-victory-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="dojo-victory-confetti" aria-hidden="true">
        {Array.from({ length: 34 }).map((_, index) => (
          <span
            key={index}
            style={{ left: `${(index * 29) % 100}%`, animationDelay: `${index * 0.045}s` }}
          />
        ))}
      </div>
      <motion.article
        className="dojo-victory-card"
        initial={{ y: 34, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 170, damping: 18 }}
      >
        <div className="victory-sensei-stage">
          <motion.img
            src={SENSEI_IMAGE_SRC}
            alt="Sensei digital felicitando al estudiante"
            animate={{ y: [-8, 4, -8], rotate: [-0.8, 0.8, -0.8] }}
            transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
          />
          <div className="victory-ring" />
        </div>
        <div className="victory-copy">
          <span className="mono-label">{perfect ? 'DOJO PERFECTO' : 'DOJO COMPLETADO'}</span>
          <h2>Felicitaciones, has completado el Dojo</h2>
          <p>
            {perfect
              ? 'Contestaste todo correctamente. El Sensei abre tu examen de cinturon.'
              : `Terminaste el entrenamiento con ${correct} de ${total} respuestas correctas. Repasa y vuelve mas fuerte.`}
          </p>
          <div className="victory-score">
            <CheckCircle2 size={20} />
            <strong>{correct}/{total}</strong>
            <span>respuestas correctas</span>
          </div>
          <div className="victory-actions">
            {perfect && onExam && (
              <NeonButton color="gold" variant="outline" onClick={onExam}>
                Ir al examen
              </NeonButton>
            )}
            <NeonButton color="cyan" variant="outline" onClick={onContinue}>
              {perfect ? 'Ver dojos' : 'Volver a dojos'}
            </NeonButton>
          </div>
        </div>
      </motion.article>
    </motion.div>,
    document.body
  )
}

export function KataRewardVideo({ src, onClose }: { src: string; onClose: () => void }) {
  const [closing, setClosing] = useState(false)
  const videoRef = React.useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.play().catch(() => {
      video.muted = true
      video.play().catch(() => {})
    })
  }, [])

  return createPortal(
    <motion.div
      className="kata-reward-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: 0.4 }}
      onAnimationComplete={() => { if (closing) onClose() }}
    >
      <div className="kata-reward-video-wrap">
        <button type="button" className="kata-reward-close" aria-label="Cerrar video" onClick={() => setClosing(true)}>
          <X size={18} />
        </button>
        <video
          ref={videoRef}
          src={src}
          className="kata-reward-video"
          playsInline
          onEnded={() => setClosing(true)}
        />
      </div>
    </motion.div>,
    document.body
  )
}

export function BeltAwardCelebration({
  currentBelt,
  awardedBelt,
  score,
  total,
  onContinue,
}: {
  currentBelt: BeltLevel
  awardedBelt: BeltLevel
  score: number
  total: number
  onContinue?: () => void
}) {
  const current = beltPath.find((item) => item.level === currentBelt) ?? beltPath[0]
  const awarded = beltPath.find((item) => item.level === awardedBelt) ?? beltPath[1]
  const { playSound } = useDojoAudio()

  React.useEffect(() => {
    playSound('belt')
  }, [playSound])

  return createPortal(
    <motion.div className="dojo-victory-overlay belt-award-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="dojo-victory-confetti belt-confetti" aria-hidden="true">
        {Array.from({ length: 44 }).map((_, index) => (
          <span
            key={index}
            style={{ left: `${(index * 23) % 100}%`, animationDelay: `${index * 0.04}s`, '--belt': awarded.color } as React.CSSProperties}
          />
        ))}
      </div>
      <motion.article
        className="belt-award-card"
        initial={{ y: 42, scale: 0.94, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 150, damping: 17 }}
      >
        <div className="belt-award-stage">
          <motion.img
            src={SENSEI_IMAGE_SRC}
            alt="Sensei entregando cinturon"
            animate={{ y: [-10, 4, -10] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          />
          <motion.div
            className="awarded-belt-ribbon"
            style={{ '--belt-color': awarded.level === 'negro' ? '#111827' : awarded.color } as React.CSSProperties}
            initial={{ x: -160, y: 32, rotate: -10, opacity: 0 }}
            animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.9, ease: 'easeOut' }}
          >
            <span />
            <strong>{awarded.label}</strong>
          </motion.div>
        </div>
        <div className="belt-award-copy">
          <span className="mono-label">ASCENSO CONFIRMADO</span>
          <h2>El Sensei te entrega el cinturon {awarded.label}</h2>
          <p>Iniciaste como cinturon {current.label}. Aprobaste con {score} de {total} respuestas correctas.</p>
          <div className="belt-award-path">
            <BeltBadge level={current.level} />
            <span className="belt-path-arrow">→</span>
            <BeltBadge level={awarded.level} animate />
          </div>
          {onContinue && (
            <div className="belt-award-actions">
              <NeonButton color="gold" variant="outline" onClick={onContinue}>
                Continuar
              </NeonButton>
            </div>
          )}
        </div>
      </motion.article>
    </motion.div>,
    document.body
  )
}

export function KataCard({
  number,
  kanji,
  title,
  isoControl,
  requiredBelt,
  difficulty,
  status,
  onOpen,
}: {
  number: number
  kanji: string
  title: string
  isoControl: string
  requiredBelt: BeltLevel
  difficulty: number
  status: KataStatus
  onOpen?: () => void
}) {
  return (
    <motion.article variants={cardVariants} className={`kata-card ${status}`}>
      {status === 'completed' && <div className="stamp-complete">完了</div>}
      <div className="kata-topline">
        <span className="kata-number">{String(number).padStart(3, '0')}</span>
        <span className="kata-kanji">{kanji}</span>
      </div>
      <h3>{title}</h3>
      <div className="kata-tags">
        <span>{isoControl}</span>
        <BeltBadge level={requiredBelt} showKanji={false} size="sm" />
      </div>
      <div className="difficulty" aria-label={`Dificultad ${difficulty} de 5`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Swords key={index} size={14} className={index < difficulty ? 'lit' : ''} />
        ))}
      </div>
      <NeonButton
        variant={status === 'locked' ? 'ghost' : 'outline'}
        color={status === 'completed' ? 'gold' : 'cyan'}
        onClick={onOpen}
        className="w-full justify-center"
      >
        {status === 'locked' ? `REQUIERE ${requiredBelt.toUpperCase()}` : 'ENTRAR AL DOJO'}
      </NeonButton>
    </motion.article>
  )
}

export function DojoShell({
  children,
  userName,
  belt,
  xp,
  onSignOut,
  isAdmin,
  onOpenChallenge,
}: {
  children: React.ReactNode
  userName: string
  belt: BeltLevel
  xp: number
  onSignOut: () => void
  isAdmin?: boolean
  onOpenChallenge?: () => void
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { enabled: audioEnabled, toggleAudio, playSound } = useDojoAudio()
  // Below 960px the sidebar is an off-canvas drawer; above it, a permanent column.
  const isDrawer = useMediaQuery('(max-width: 960px)')
  const drawerRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeDrawer = React.useCallback(() => setSidebarOpen(false), [])
  const bottomNavPaths = ['/dashboard', '/dojos', '/sensei', '/campeonato']

  const nav: Array<{ to: string; label: string; icon: typeof Home; action?: () => void; external?: boolean; short?: string }> = [
    { to: '/dashboard', label: 'Mi entrenamiento', short: 'Inicio', icon: Home },
    { to: '/dojos', label: 'Dojos', icon: ListChecks },
    { to: '/sensei', label: 'Pregunta al sensei', short: 'Sensei', icon: Bot },
    ...(onOpenChallenge ? [{ to: '#', label: 'Desafiando al Sensei', icon: Swords, action: onOpenChallenge }] : []),
    { to: '/campeonato', label: 'Campeonato', short: 'Torneo', icon: Trophy },
    { to: '/personajes', label: 'Personajes del dojo', icon: Swords },
    { to: '/perfil', label: 'Perfil', icon: User },
    // /admin is not a route of this SPA: it is proxied to the admin app by static-server, so it needs a real navigation.
    ...(isAdmin ? [{ to: '/admin/', label: 'Admin', icon: Wrench, external: true }] : []),
  ]

  return (
    <ScanlineOverlay>
      <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <a className="cinema-skip" href="#contenido">Ir al contenido</a>
        <button
          ref={menuButtonRef}
          className="floating-menu-toggle"
          type="button"
          aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={sidebarOpen}
          aria-controls="dojo-sidebar"
          onClick={() => {
            playSound('tap')
            setSidebarOpen((open) => !open)
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={sidebarOpen ? 'close' : 'open'}
              initial={{ opacity: 0, rotate: -45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 45 }}
              transition={{ duration: 0.16 }}
              style={{ display: 'inline-flex' }}
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </motion.span>
          </AnimatePresence>
          <span>{sidebarOpen ? 'Cerrar' : 'Menú'}</span>
        </button>
        {/* Closed drawer: `inert` keeps its 14 off-screen links out of the tab order and the accessibility tree. */}
        <aside
          id="dojo-sidebar"
          ref={drawerRef}
          className="dojo-sidebar"
          tabIndex={-1}
          inert={isDrawer && !sidebarOpen ? true : undefined}
          role={isDrawer && sidebarOpen ? 'dialog' : undefined}
          aria-modal={isDrawer && sidebarOpen ? true : undefined}
          aria-label={isDrawer && sidebarOpen ? 'Menú principal' : undefined}
        >
          <NavLink to="/" className="brand-lockup" onClick={() => setSidebarOpen(false)}>
            <span className="torii">⛩</span>
            <span>
              <strong>ciberDojo</strong>
              <em>EL ARTE DE PROTEGERTE</em>
            </span>
          </NavLink>
          <nav aria-label="Secciones">
            {nav.map((item) => {
              const Icon = item.icon
              if (item.external) {
                return (
                  <a key={item.to} href={item.to} className="side-link">
                    <Icon size={18} />
                    {item.label}
                  </a>
                )
              }
              if (item.action) {
                return (
                  <button key={item.label} type="button" className="side-link" onClick={() => { playSound('tap'); setSidebarOpen(false); item.action?.() }}>
                    <Icon size={18} />
                    {item.label}
                  </button>
                )
              }
              return (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`} onClick={() => { playSound('tap'); setSidebarOpen(false) }}>
                  <Icon size={18} />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
          <div className="sidebar-sensei-card">
            <NavLink to="/personajes/doggoteka" className="sidebar-doggo"><DoggoArt />DoggoTeka · Tu compañero ↗</NavLink>
          </div>
          <div className="sidebar-rank">
            <div className="mono-label">GUERRERO</div>
            <strong>{userName}</strong>
            <BeltBadge level={belt} animate />
            <XPBar current={xp} max={5000} belt={belt} />
          </div>
          <NavLink to="/dojos" className="train-now btn-katana" onClick={() => setSidebarOpen(false)}>
            <Play size={16} />
            ENTRENAR AHORA
          </NavLink>
          <div className="sidebar-footer-actions">
            <button className="audio-toggle" type="button" onClick={toggleAudio} aria-pressed={audioEnabled}>
              {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {audioEnabled ? 'Audio dojo activo' : 'Activar audio dojo'}
            </button>
            <button className="logout-link" onClick={onSignOut}>
              <LogOut size={16} />
              Salir de la aplicación
            </button>
          </div>
        </aside>
        {isDrawer && sidebarOpen && <DrawerBehavior drawer={drawerRef} onClose={closeDrawer} returnFocusTo={menuButtonRef} />}
        <div className="mobile-menu-backdrop" onClick={() => {
          playSound('tap')
          setSidebarOpen(false)
        }} />
        <main id="contenido" className="dojo-main" tabIndex={-1}>
          <nav className="mobile-bottom-nav" aria-label="Navegación principal">
            {nav.filter((item) => bottomNavPaths.includes(item.to)).map((item) => {
              const Icon = item.icon
              return (
                <NavLink key={item.to} to={item.to} aria-label={item.label} className={({ isActive }) => `bottom-link ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.short ?? item.label}</span>
                </NavLink>
              )
            })}
            {/* Everything else (Perfil, Personajes…) lives in the drawer, one tap away. */}
            <button type="button" className="bottom-link" aria-haspopup="dialog" aria-expanded={sidebarOpen} aria-controls="dojo-sidebar" onClick={() => { playSound('tap'); setSidebarOpen(true) }}>
              <Menu size={18} aria-hidden="true" />
              <span>Más</span>
            </button>
          </nav>
          <AppEntryLogger />
          <CampaignAdOverlay />
          <WisdomQuoteOverlay />
          {children}
        </main>
      </div>
    </ScanlineOverlay>
  )
}

// Mounted only while the drawer is open: focus moves in, Tab is trapped, Escape closes, page scroll
// is locked, and focus returns to the button that opened it.
function DrawerBehavior({ drawer, onClose, returnFocusTo }: { drawer: React.RefObject<HTMLElement | null>; onClose: () => void; returnFocusTo: React.RefObject<HTMLElement | null> }) {
  useModalA11y(drawer, onClose, () => returnFocusTo.current)
  return null
}

export function SectionHeader({ eyebrow, title, kanji }: { eyebrow: string; title: string; kanji: string }) {
  return (
    <div className="section-heading">
      <KanjiBackground char={kanji} />
      <p>{eyebrow}</p>
      <h1>{title}</h1>
    </div>
  )
}

function AppEntryLogger() {
  const { userProfile } = useAuth()

  React.useEffect(() => {
    if (!userProfile?.id) return
    let active = true

    async function logEntry() {
      if (!active) return
      await supabase.from('app_entry_log').insert({
        user_id: userProfile!.id,
        sector: userProfile!.sector ?? null,
      })
    }

    void logEntry()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id])

  return null
}

type CampaignAd = {
  id: string
  image_url: string | null
  link_url: string | null
  message: string
  duration_seconds: number
}

function CampaignAdOverlay() {
  const [ad, setAd] = React.useState<CampaignAd | null>(null)
  const [visible, setVisible] = React.useState(false)
  const { playSound } = useDojoAudio()
  const { userProfile } = useAuth()
  const location = useLocation()
  // A promo popup (rendered via portal, so it can outrank normal page content
  // regardless of z-index) must never interrupt an active lesson or exam.
  const isFocusedFlow = location.pathname.startsWith('/dojo/') || location.pathname.startsWith('/kata/')

  React.useEffect(() => {
    if (!userProfile?.id) return
    let active = true

    async function loadAd() {
      const { data, error } = await supabase.rpc('get_next_campaign_for_user', { p_moment: 'inicio' })

      if (!active || error || !data || !data.image_url) return
      const campaign = data as CampaignAd
      setAd(campaign)
      setVisible(true)
      playSound('ad-in')
      await supabase.from('campaign_impressions').insert({
        campaign_id: campaign.id,
        user_id: userProfile!.id,
        sector: userProfile!.sector ?? null,
      })
    }

    void loadAd()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id])

  React.useEffect(() => {
    if (!ad || !visible) return
    const dismissTimer = window.setTimeout(() => {
      playSound('ad-out')
      setVisible(false)
    }, Math.max(1, ad.duration_seconds) * 1000)
    return () => window.clearTimeout(dismissTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad, visible])

  const imageSrc = campaignImageUrl(ad?.image_url, process.env.REACT_APP_SUPABASE_URL)
  const linkHref = safeHttpUrl(ad?.link_url)
  if (!ad || !imageSrc || isFocusedFlow) return null

  const image = <img src={imageSrc} alt={ad.message} />

  function dismiss() {
    playSound('ad-out')
    setVisible(false)
  }

  return createPortal(
    <AnimatePresence onExitComplete={() => setAd(null)}>
      {visible && (
        <div className="campaign-ad-position">
          <motion.button
            type="button"
            className="campaign-ad-backdrop"
            aria-label="Cerrar anuncio"
            onClick={dismiss}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          />
          <motion.div
            className="campaign-ad-overlay"
            initial={{ opacity: 0, scale: 0.5, y: -16, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.35, rotate: 10, y: 24, filter: 'blur(20px)' }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type="button"
              className="campaign-ad-close"
              aria-label="Cerrar anuncio"
              onClick={dismiss}
            >
              <X size={18} />
            </button>
            {linkHref ? (
              <a href={linkHref} target="_blank" rel="noopener noreferrer" className="campaign-ad-card">
                {image}
              </a>
            ) : (
              <div className="campaign-ad-card">{image}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

type WisdomQuote = {
  source_title: string
  quote_text: string
  cyber_application: string
}

const fallbackWisdomQuotes: WisdomQuote[] = [
  {
    source_title: 'El arte de la guerra - Sun Tzu',
    quote_text: 'Conoce al enemigo y conocete a ti mismo; en cien batallas no correras peligro.',
    cyber_application: 'Antes de entrenar, identifica que equipos, cuentas y datos debes proteger. La defensa empieza sabiendo que es importante para ti.',
  },
  {
    source_title: 'El arte de la guerra - Sun Tzu',
    quote_text: 'Toda guerra se basa en el engano.',
    cyber_application: 'Los mensajes falsos explotan la confianza. Verifica quien te escribe y no uses enlaces recibidos cuando haya urgencia o presion.',
  },
  {
    source_title: 'Bushido - El Codigo del Samurai',
    quote_text: 'La rectitud es el poder de decidir una conducta correcta.',
    cyber_application: 'En ciberseguridad, rectitud significa reportar incidentes rapido, no ocultar errores y seguir controles aunque incomoden.',
  },
]

function WisdomQuoteOverlay() {
  const [quotes, setQuotes] = React.useState<WisdomQuote[]>(fallbackWisdomQuotes)
  const [quote, setQuote] = React.useState<WisdomQuote | null>(null)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    let active = true

    async function loadQuote() {
      const { data, error } = await supabase
        .from('cyber_dojo_wisdom_quotes')
        .select('source_title, quote_text, cyber_application, display_weight')
        .eq('active', true)

      if (!active) return

      const loadedQuotes = !error && data?.length ? data as WisdomQuote[] : fallbackWisdomQuotes
      setQuotes(loadedQuotes)
      setQuote(pickQuote(loadedQuotes))
    }

    void loadQuote()

    return () => {
      active = false
    }
  }, [])

  if (!quote) return null

  return (
    <>
      <button className="wisdom-pill btn-katana" onClick={() => setOpen(true)}>
        Frase dojo
      </button>
      {open && (
        <motion.div className="wisdom-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <button className="wisdom-backdrop" aria-label="Cerrar frase dojo" onClick={() => setOpen(false)} />
          <motion.article
            className="wisdom-card"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28 }}
          >
            <div className="wisdom-portrait" style={{ '--portrait': `url(${SENSEI_IMAGE_SRC})` } as React.CSSProperties}>
              <motion.img
                src={SENSEI_IMAGE_SRC}
                alt="Sensei digital"
                animate={{ y: [-5, 5, -5] }}
                transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
              />
            </div>
            <div>
              <span className="mono-label">{quote.source_title}</span>
              <h2>Sabiduria aplicada a ciberseguridad</h2>
              <blockquote>{quote.quote_text}</blockquote>
              <p>{quote.cyber_application}</p>
              <div className="wisdom-actions">
                <NeonButton color="cyan" variant="outline" onClick={() => setQuote(pickQuote(quotes))}>
                  Otra frase
                </NeonButton>
                <NeonButton color="gold" variant="outline" onClick={() => setOpen(false)}>
                  Entrenar
                </NeonButton>
              </div>
            </div>
          </motion.article>
        </motion.div>
      )}
    </>
  )
}

function pickQuote(quotes: WisdomQuote[]) {
  return quotes[Math.floor(Math.random() * quotes.length)] ?? fallbackWisdomQuotes[0]
}
