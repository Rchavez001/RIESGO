import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Loader, Trophy } from 'lucide-react'
import { BeltBadge, NeonButton, SectionHeader, cardVariants, containerVariants } from '../components/CyberBushido'
import { supabase } from '../lib/supabase'

interface RankingEntry {
  rank: number
  full_name: string
  belt: string
  total_xp: number
  katas_completed: number
  email_domain: string | null
}

export function LeaderboardPage() {
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    async function loadRanking() {
      setLoading(true)
      setError('')

      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-ranking', {
          method: 'GET',
        })

        if (!active) return

        if (fnError) throw fnError
        if (!data?.ranking || !Array.isArray(data.ranking)) {
          setRanking([])
          return
        }

        setRanking(data.ranking as RankingEntry[])
      } catch (err) {
        console.error('Error loading ranking:', err)
        setError('No pudimos cargar la tabla de honor. Revisa tu conexión y vuelve a intentar.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadRanking()

    return () => {
      active = false
    }
  }, [attempt])

  const top = ranking.slice(0, 3)

  function beltLabel(belt: string) {
    const map: Record<string, string> = {
      white: 'blanco', yellow: 'amarillo', orange: 'naranja',
      green: 'verde', blue: 'azul', brown: 'marron', black: 'negro',
      marrón: 'marron',
    }
    return map[belt.toLowerCase()] ?? belt
  }

  if (loading) {
    return (
      <motion.div variants={containerVariants} initial="initial" animate="animate">
        <SectionHeader eyebrow="// CARGANDO TABLA DE HONOR" title="Tabla de Honor · 名誉の殿堂" kanji="名誉" />
        <div className="glass-panel grid place-items-center min-h-64">
          <div className="text-center" role="status">
            <Loader className="animate-spin mx-auto text-cyan-300" size={34} aria-hidden="true" />
            <p className="mono-label mt-4">CONSULTANDO AL SENSEI...</p>
          </div>
        </div>
      </motion.div>
    )
  }

  if (error) {
    return (
      <motion.div variants={containerVariants} initial="initial" animate="animate">
        <SectionHeader eyebrow="// TABLA DE HONOR" title="Tabla de Honor · 名誉の殿堂" kanji="名誉" />
        <div className="glass-panel p-8 text-center" role="alert">
          <Shield className="mx-auto text-red-400 mb-3" size={36} aria-hidden="true" />
          <p className="text-slate-200">{error}</p>
          <NeonButton color="cyan" variant="outline" onClick={() => setAttempt((n) => n + 1)}>Volver a intentar</NeonButton>
        </div>
      </motion.div>
    )
  }

  if (ranking.length === 0) {
    return (
      <motion.div variants={containerVariants} initial="initial" animate="animate">
        <SectionHeader eyebrow="// TABLA DE HONOR" title="Tabla de Honor · 名誉の殿堂" kanji="名誉" />
        <div className="glass-panel p-8 text-center">
          <Trophy className="mx-auto text-cyan-300 mb-3" size={36} />
          <p className="text-slate-200 text-lg">Aún no hay guerreros en la tabla de honor.</p>
          <p className="text-slate-400 mt-2">Aprueba un kata para aparecer en el ranking.</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div variants={containerVariants} initial="initial" animate="animate">
      <SectionHeader eyebrow="// GUERREROS CLASIFICADOS POR XP TOTAL" title="Tabla de Honor · 名誉の殿堂" kanji="名誉" />
      {top.length >= 3 && (
        <div className="podium">
          {[top[1], top[0], top[2]].map((user, index) => (
            <motion.div key={user.rank} data-rank={user.rank} className={`honor-card ${index === 1 ? 'first' : ''}`} variants={cardVariants}>
              <div className="kata-number" aria-hidden="true">#{user.rank}</div>
              <h3 className="text-2xl font-bold"><span className="sr-only">Puesto {user.rank}: </span>{user.full_name}</h3>
              <BeltBadge level={beltLabel(user.belt) as any} animate={index === 1} />
              <p className="mono-label mt-3">{user.total_xp.toLocaleString()} XP · {user.email_domain ?? ''}</p>
            </motion.div>
          ))}
        </div>
      )}
      <div className="glass-panel leader-scroll">
        <table className="leader-table">
          <caption className="sr-only">Guerreros clasificados por XP total</caption>
          <thead>
            <tr>
              <th scope="col">RANGO</th>
              <th scope="col">GUERRERO</th>
              <th scope="col">CINTURÓN</th>
              <th scope="col">XP</th>
              <th scope="col">KATAS</th>
              <th scope="col" className="leader-domain">DOMINIO</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((user) => (
              <tr key={`${user.rank}-${user.full_name}`}>
                <th scope="row">#{user.rank}</th>
                <td>{user.full_name}</td>
                <td><BeltBadge level={beltLabel(user.belt) as any} showKanji={false} size="sm" /></td>
                <td>{user.total_xp.toLocaleString()}</td>
                <td>{user.katas_completed}</td>
                <td className="text-xs text-slate-400 leader-domain">{user.email_domain ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
