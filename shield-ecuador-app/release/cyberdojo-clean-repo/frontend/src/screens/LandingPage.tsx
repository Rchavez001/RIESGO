import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Castle, Play, Shield, Swords } from 'lucide-react'
import { BeltBadge, CyberSensei, KanjiBackground, NeonButton, ScanlineOverlay, cardVariants, containerVariants } from '../components/CyberBushido'
import { TatamiCombatIntro } from '../components/TatamiCombatIntro'
import { beltPath, senseiQuotes } from '../data/ciberDojo'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'
import { useAuth } from '../contexts/AuthContext'

const BOW_DURATION_MS = 1400

export function LandingPage() {
  const navigate = useNavigate()
  const quote = senseiQuotes[0]
  const { deferredPrompt, install } = usePwaInstallPrompt()
  const { user, loading } = useAuth()
  const [bowing, setBowing] = useState(false)
  const bowTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  function startTraining() {
    if (bowing) return
    setBowing(true)
    bowTimeout.current = setTimeout(() => {
      navigate(user ? '/dashboard' : '/login')
    }, BOW_DURATION_MS)
  }

  return (
    <ScanlineOverlay>
      <div className="cyber-page">
        <TatamiCombatIntro />
        <KanjiBackground char="道場" />

        <section className="hero-grid">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <div className="hero-badge">CINTURÓN BLANCO A NEGRO</div>
            <p className="hero-kicker">CIBER DOJO · SISTEMA DE ENTRENAMIENTO</p>
            <h1 className="hero-title">
              Forja tu<br />
              <span>armadura</span> digital<br />
              en el Dojo
            </h1>
            <p className="hero-copy">
              Entrenamiento de seguridad digital para personas y pequeños negocios. Aprende con preguntas, ejemplos y exámenes de cinturón explicados en lenguaje sencillo.
            </p>
            <div className="hero-actions">
              <NeonButton onClick={startTraining} disabled={loading || bowing}>
                {loading ? <Shield size={16} /> : <Play size={16} />}
                {user ? 'CONTINUAR ENTRENAMIENTO' : 'COMENZAR ENTRENAMIENTO'}
              </NeonButton>
              <NeonButton
                variant="outline"
                color="cyan"
                onClick={() => document.getElementById('rangos')?.scrollIntoView({ behavior: 'smooth' })}
              >
                VER RANGOS
              </NeonButton>
              {deferredPrompt && (
                <NeonButton variant="outline" color="gold" onClick={() => void install()}>
                  <Shield size={16} /> INSTALAR APP
                </NeonButton>
              )}
            </div>
            <div className="hero-action-tip">
              Instala la app y accede al dojo desde tu celular con un solo toque.
            </div>
          </motion.div>

          {/* Sensei section — bowing class applied on click */}
          <div className={bowing ? 'sensei-bowing' : ''}>
            <CyberSensei message={quote.es} messageJP={quote.jp} />
          </div>
        </section>

        <section id="rangos" className="belt-row">
          <div className="mono-label">{'// PROGRESIÓN DE RANGOS'}</div>
          <div className="belt-list">
            {beltPath.map((belt, index) => (
              <BeltBadge key={belt.level} level={belt.level} animate={index === 0} />
            ))}
          </div>
        </section>

        <section className="stats-row">
          {[
            ['GUERREROS ACTIVOS', '1,247', 'glow-cyan'],
            ['BUENAS PRÁCTICAS', 'OK', 'glow-gold'],
            ['KATAS DISPONIBLES', '48', 'glow-cyan'],
            ['DISPONIBILIDAD', '99.9%', 'text-green-400'],
          ].map(([label, value, cls]) => (
            <div className="stat-box" key={label}>
              <strong className={cls}>{value}</strong>
              <span className="mono-label">{label}</span>
            </div>
          ))}
        </section>

        <motion.section
          className="feature-grid"
          variants={containerVariants}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
        >
          {[
            [Swords,  'KATA DIGITAL',        'Entrenamiento por combate',   'Preguntas con situaciones reales. Cada respuesta correcta te ayuda a vencer un riesgo digital.',       'APRENDIZAJE'],
            [Shield,  'CINTURÓN INTELIGENTE', 'Progreso paso a paso',        'Avanza de Blanco a Negro completando katas. La dificultad crece según tu entrenamiento.',              'GUIADO'],
            [Castle,  'DOJO EMPRESARIAL',     'Revisión clara de seguridad', 'Al llegar a Cinturón Negro, tu negocio obtiene una lectura sencilla de qué debe mejorar.',           'PRÁCTICO'],
          ].map(([Icon, kicker, title, body, badge]) => {
            const TypedIcon = Icon as typeof Shield
            return (
              <motion.article className="feature-card" variants={cardVariants} key={String(title)}>
                <TypedIcon className="text-cyan-300" size={32} />
                <span className="badge">{kicker as string}</span>
                <h3>{title as string}</h3>
                <p>{body as string}</p>
                <div className="hero-badge mt-5">{badge as string}</div>
              </motion.article>
            )
          })}
        </motion.section>
      </div>
    </ScanlineOverlay>
  )
}
