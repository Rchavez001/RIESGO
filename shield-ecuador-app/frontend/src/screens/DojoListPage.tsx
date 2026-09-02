import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Loader } from 'lucide-react'
import { BeltBadge, KataCard, NeonButton, SectionHeader, containerVariants } from '../components/CyberBushido'
import { BeltLevel, beltPath, dojoModules } from '../data/ciberDojo'
import { supabase } from '../lib/supabase'

type BeltExam = {
  id: string
  kata_code: string
  name: string
  description: string | null
  teaching: string | null
  estimated_minutes: number | null
  required_belt: string | null
  points_reward: number | null
  steps: unknown
}

const beltMap: Record<string, BeltLevel> = {
  white: 'blanco',
  yellow: 'amarillo',
  orange: 'naranja',
  green: 'verde',
  blue: 'azul',
  purple: 'morado',
  red: 'rojo',
  black: 'negro',
}

export function DojoListPage() {
  const navigate = useNavigate()
  const [belt, setBelt] = useState('todos')
  const [exams, setExams] = useState<BeltExam[]>([])
  const [loadingExams, setLoadingExams] = useState(true)

  useEffect(() => {
    let active = true

    async function loadExams() {
      setLoadingExams(true)
      const { data, error } = await supabase
        .from('katas')
        .select('id, kata_code, name, description, teaching, estimated_minutes, required_belt, points_reward, steps')
        .like('kata_code', 'EXAM_%')
        .eq('active', true)
        .order('required_belt', { ascending: true })

      if (!active) return

      if (error) {
        console.error('Error loading belt exams:', error)
        setExams([])
      } else {
        setExams((data ?? []) as BeltExam[])
      }

      setLoadingExams(false)
    }

    void loadExams()

    return () => {
      active = false
    }
  }, [])

  const filtered = belt === 'todos' ? dojoModules : dojoModules.filter((dojo) => dojo.requiredBelt === belt)
  const filteredExams = belt === 'todos'
    ? exams
    : exams.filter((exam) => beltMap[exam.required_belt ?? 'white'] === belt)

  return (
    <motion.div variants={containerVariants} initial="initial" animate="animate">
      <SectionHeader eyebrow="// SALA DE ENTRENAMIENTO" title="Dojos · 道場一覧" kanji="型" />
      <div className="glass-panel p-3 mb-5 flex flex-wrap gap-2">
        <button className={`neon-button ghost cyan ${belt === 'todos' ? 'outline cyan' : ''}`} onClick={() => setBelt('todos')}>TODOS</button>
        {beltPath.map((item) => (
          <button key={item.level} className={`neon-button ghost cyan ${belt === item.level ? 'outline cyan' : ''}`} onClick={() => setBelt(item.level)}>
            {item.label}
          </button>
        ))}
      </div>
      <motion.div className="dojo-grid" variants={containerVariants}>
        {filtered.map((dojo) => (
          <KataCard
            key={dojo.id}
            number={dojo.number}
            kanji={dojo.kanji}
            title={dojo.title}
            isoControl={dojo.isoControl}
            requiredBelt={dojo.requiredBelt}
            difficulty={dojo.difficulty}
            status={dojo.status}
            onOpen={() => navigate(`/dojo/${dojo.id}`)}
          />
        ))}
      </motion.div>
      <div className="exam-section">
        <SectionHeader eyebrow="// EXAMENES PARA SUBIR DE CINTURON" title="Katas de Cinturon" kanji="昇" />
        {loadingExams ? (
          <div className="glass-panel p-6 flex items-center gap-3">
            <Loader className="animate-spin text-cyan-300" size={22} />
            <span className="mono-label">CARGANDO KATAS DE CINTURON</span>
          </div>
        ) : (
          <motion.div className="belt-exam-grid" variants={containerVariants}>
            {filteredExams.map((exam) => {
              const requiredBelt = beltMap[exam.required_belt ?? 'white'] ?? 'blanco'
              const questionCount = Array.isArray(exam.steps) ? exam.steps.length : 0
              return (
                <motion.article key={exam.id} className="belt-exam-card glass-panel" variants={containerVariants} whileHover={{ y: -8 }} transition={{ duration: 0.2 }}>
                  <div className="exam-card-top">
                    <GraduationCap size={22} />
                    <span className="mono-label">EXAMEN DE ASCENSO</span>
                  </div>
                  <h3>{exam.name}</h3>
                  <p>{exam.description}</p>
                  <div className="exam-card-meta">
                    <BeltBadge level={requiredBelt} showKanji={false} size="sm" />
                    <span>{questionCount} preguntas</span>
                    <span>{exam.estimated_minutes ?? 15} min</span>
                    <span>{exam.points_reward ?? 0} XP</span>
                  </div>
                  <p className="exam-card-teaching">{exam.teaching}</p>
                  <NeonButton color="gold" variant="outline" className="w-full justify-center" onClick={() => navigate(`/kata/${exam.kata_code}`)}>
                    INICIAR EXAMEN
                  </NeonButton>
                </motion.article>
              )
            })}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
