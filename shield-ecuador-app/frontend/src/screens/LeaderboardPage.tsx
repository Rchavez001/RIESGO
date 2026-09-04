import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Loader, Trophy } from 'lucide-react'
import { BeltBadge, SectionHeader, cardVariants, containerVariants } from '../components/CyberBushido'
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
        setError('No se pudo cargar la tabla de honor.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadRanking()

    return () => {
      active = false
    }
  }, [])

  const top = ranking.slice(0, 3)

  function beltLabel(belt: string) {
    const map: Record<string, string> = {
      white: 'blanco', yellow: 'amarillo', orange: 'naranja',
      green: 'verde', blue: 'azul', brown: 'marron', black: 'negro',
    }
    return map[belt.toLowerCase()] ?? belt
  }

  if (loading) {
    return (
      <motion.div variants={containerVariants} initial="initial" animate="animate">
        <SectionHeader eyebrow="// CARGANDO TABLA DE HONOR" title="Tabla de Honor · 名誉の殿堂" kanji="名誉" />
        <div className="glass-panel grid place-items-center min-h-64">
          <div className="text-center">
            <Loader className="animate-spin mx-auto text-cyan-300" size={34} />
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
        <div className="glass-panel p-8 text-center">
          <Shield className="mx-auto text-red-400 mb-3" size={36} />
          <p className="text-slate-200">{error}</p>
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
          <p className="text-slate-200 text-lg">Aun no hay guerreros en la tabla de honor.</p>
          <p className="text-slate-400 mt-2">Completa katas para aparecer en el ranking.</p>
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
            <motion.div key={user.rank} className={`honor-card ${index === 1 ? 'first' : ''}`} variants={cardVariants}>
              <div className="kata-number">#{user.rank}</div>
              <h3 className="text-2xl font-bold">{user.full_name}</h3>
              <BeltBadge level={beltLabel(user.belt) as any} animate={index === 1} />
              <p className="mono-label mt-3">{user.total_xp.toLocaleString()} XP · {user.email_domain ?? ''}</p>
            </motion.div>
          ))}
        </div>
      )}
      <div className="glass-panel overflow-hidden">
        <table className="leader-table">
          <thead>
            <tr>
              <th>RANGO</th>
              <th>GUERRERO</th>
              <th>CINTURON</th>
              <th>XP</th>
              <th>KATAS</th>
              <th>DOMINIO</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((user) => (
              <tr key={`${user.rank}-${user.full_name}`}>
                <td>#{user.rank}</td>
                <td>{user.full_name}</td>
                <td><BeltBadge level={beltLabel(user.belt) as any} showKanji={false} size="sm" /></td>
                <td>{user.total_xp.toLocaleString()}</td>
                <td>{user.katas_completed}</td>
                <td className="text-xs text-slate-400">{user.email_domain ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
