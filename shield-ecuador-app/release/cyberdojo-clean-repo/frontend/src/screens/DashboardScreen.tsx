import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Activity, Award, Flame, Gauge, Swords } from 'lucide-react'
import { CyberSensei, NeonButton, SectionHeader, containerVariants } from '../components/CyberBushido'
import { dojoModules, senseiQuotes } from '../data/ciberDojo'
import { supabase, Alert, Kata } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useDojoStore } from '../store/dojoStore'

export function DashboardScreen() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const { xp } = useDojoStore()
  const [katas, setKatas] = useState<Kata[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const quote = senseiQuotes[Math.floor(new Date().getDate() % senseiQuotes.length)]
  const missions = katas.length
    ? katas.slice(0, 4).map((kata, index) => ({
      id: kata.id,
      title: simplifyForCitizens(kata.name),
      description: simplifyForCitizens(kata.description ?? 'Kata practico del dojo'),
      route: index < dojoModules.length ? `/dojo/${dojoModules[index].id}` : '/dojos',
    }))
    : dojoModules.slice(0, 4).map((kata) => ({
      id: kata.id,
      title: kata.title,
      description: kata.isoControl,
      route: `/dojo/${kata.id}`,
    }))

  useEffect(() => {
    void Promise.all([loadKatas(), loadAlerts()])
  }, [])

  async function loadKatas() {
    const { data } = await supabase.from('katas').select('*').eq('active', true).order('points_reward').limit(4)
    setKatas((data as Kata[]) ?? [])
  }

  async function loadAlerts() {
    const { data } = await supabase.from('alerts').select('*').eq('active', true).order('published_at', { ascending: false }).limit(3)
    setAlerts((data as Alert[]) ?? [])
  }

  return (
    <motion.div variants={containerVariants} initial="initial" animate="animate">
      <SectionHeader eyebrow={`BIENVENIDO, ${userProfile?.full_name ?? 'GUERRERO'} · CINTURON VERDE`} title="Dashboard · 修行" kanji="修行" />
      <div className="dashboard-grid">
        <div>
          <div className="stat-grid">
            {[
              [Swords, 'KATA HOY', '03'],
              [Flame, 'RACHA', '05'],
              [Gauge, 'XP TOTAL', xp.toLocaleString()],
              [Award, 'RANKING', '#06'],
            ].map(([Icon, label, value]) => {
              const TypedIcon = Icon as typeof Swords
              return (
                <motion.article className="stat-card" key={String(label)} whileHover={{ y: -6 }} transition={{ duration: 0.2 }}>
                  <TypedIcon className="text-cyan-300 mb-3" />
                  <span>{label as string}</span>
                  <strong>{value as string}</strong>
                </motion.article>
              )
            })}
          </div>

          <section className="mt-6">
            <div className="mono-label">{'// PROXIMAS MISIONES'}</div>
            <div className="mission-list">
              {missions.map((kata) => (
                <motion.article className="mission-card" key={kata.id} whileHover={{ y: -4, scale: 1.01 }} transition={{ duration: 0.2 }}>
                  <div>
                    <h3>{kata.title}</h3>
                    <p>{kata.description}</p>
                  </div>
                  <NeonButton variant="outline" color="cyan" onClick={() => navigate(kata.route)}>ENTRAR</NeonButton>
                </motion.article>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <div className="mono-label">{'// HISTORIAL DE COMBATE'}</div>
            <div className="mission-list">
              {alerts.length ? alerts.map((alert) => (
                <motion.article className="mission-card" key={alert.id} whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                  <Activity className="text-red-400" />
                  <div className="flex-1">
                    <h3>{simplifyForCitizens(alert.title)}</h3>
                    <p>{simplifyForCitizens(alert.description)}</p>
                  </div>
                </motion.article>
              )) : ['Engano por mensaje bloqueado', 'Verificacion en dos pasos activada', 'Copia de seguridad validada'].map((item) => (
                <motion.article className="mission-card" key={item} whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                  <Activity className="text-cyan-300" />
                  <div className="flex-1"><h3>{item}</h3><p>Resultado positivo del entrenamiento semanal.</p></div>
                </motion.article>
              ))}
            </div>
          </section>
        </div>

        <aside className="grid gap-5">
          <CyberSensei message={quote.es} messageJP={quote.jp} />
          <div className="glass-panel p-5">
            <div className="mono-label">CONSEJO DEL MAESTRO</div>
            <p className="text-xl font-bold mt-2">Activa la verificacion en dos pasos en tu correo y banca. Es un segundo candado: ademas de la contrasena, te pide un codigo o confirmacion en tu celular.</p>
          </div>
          <div className="glass-panel p-5">
            <div className="mono-label">LOGROS DESBLOQUEADOS</div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {['初', '盾', '鍵', '火'].map((badge) => <span key={badge} className="hero-badge">{badge}</span>)}
            </div>
          </div>
        </aside>
      </div>
    </motion.div>
  )
}

function simplifyForCitizens(value: string) {
  return value
    .replace(/\bMFA\b/gi, 'verificacion en dos pasos')
    .replace(/\b2FA\b/gi, 'verificacion en dos pasos')
    .replace(/\bphishing\b/gi, 'mensaje falso para robar datos')
    .replace(/\bransomware\b/gi, 'bloqueo de archivos para pedir dinero')
    .replace(/\bbackup(s)?\b/gi, 'copia de seguridad')
    .replace(/\bcredenciales\b/gi, 'claves o datos de entrada')
    .replace(/\bdominio\b/gi, 'direccion de la pagina')
    .replace(/\bmalware\b/gi, 'programa malicioso')
    .replace(/\bISO 27001\b/gi, 'buenas practicas de seguridad')
}
