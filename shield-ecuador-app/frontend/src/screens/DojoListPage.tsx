import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BeltBadge, NeonButton, SectionHeader } from '../components/CyberBushido'
import { learningCall, learningDojos, LearningOverview } from '../services/learning'
import { useAuth } from '../contexts/AuthContext'

export function DojoListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isGuest = Boolean(user?.is_anonymous)
  const [overview, setOverview] = useState<LearningOverview[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setOverview([]); setError('')
    if (!user) { setLoading(false); return }
    learningCall<LearningOverview[]>('learning_overview')
      .then(value => { if (active) setOverview(value) })
      .catch(e => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user, reload])
  return <div className="learning-page">
    <SectionHeader eyebrow="TU CAMINO · PASO A PASO" title="Dojos de ciberseguridad" kanji="道" />
    <div className="learning-intro glass-panel"><p>No necesitas saber de informática. En cada cinturón practicarás 30 preguntas con explicación. Después, demuestra lo aprendido en cinco casos de la vida diaria. Tu avance se guarda en tu cuenta.</p></div>
    {loading && <p role="status">Recuperando tu avance…</p>}
    {error && <div role="alert"><p>{error}</p><NeonButton onClick={() => setReload(n => n + 1)}>Volver a intentar</NeonButton></div>}
    {!user && <p>Inicia sesión para comenzar y guardar tu progreso.</p>}
    <div className="dojo-grid" aria-busy={loading}>{learningDojos.map(dojo => {
      const progress = overview.find(p => p.id === dojo.id)
      const ready = progress?.unlocked && progress.answered === 30
      const locked = !loading && !!progress && !progress.unlocked
      const lockNoteId = `lock-${dojo.id}`
      const kataNoteId = `kata-${dojo.id}`
      return <article key={dojo.id} className={`glass-panel learning-dojo-card${locked ? ' is-locked' : ''}`}>
        <BeltBadge level={dojo.belt} /><h2>{dojo.title}</h2>
        <p>{progress ? `${progress.answered} de 30 preguntas respondidas` : '30 preguntas para aprender a tu ritmo'}</p>
        <progress className="learning-progress" value={progress?.answered ?? 0} max={30} aria-label={`Avance del cinturón ${dojo.belt}`} />
        {locked && (
          <p id={lockNoteId}>{isGuest ? 'Regístrate gratis para desbloquear este dojo.' : 'Se abre cuando apruebes el cinturón anterior.'}</p>
        )}
        <NeonButton color="cyan" describedBy={locked ? lockNoteId : undefined} disabled={(!progress?.unlocked && !isGuest) || loading}
          onClick={() => navigate(`/dojo/${dojo.id}`)}>{progress?.answered ? 'Continuar mi entrenamiento' : 'Comenzar entrenamiento'}</NeonButton>
        <div className="learning-exam-entry"><p id={kataNoteId}>{progress?.passed ? 'Kata aprobado. Puedes revisar lo que aprendiste.' : ready ? 'Ya puedes presentar tu kata.' : 'El kata se abre al responder las 30 preguntas.'}</p>
          <NeonButton color="gold" variant="outline" describedBy={kataNoteId} disabled={!ready || loading}
            onClick={() => navigate(`/kata/${dojo.exam_code}`)}>{progress?.passed ? 'Revisar mi kata' : 'Kata · 5 casos'}</NeonButton></div>
      </article>
    })}</div>
  </div>
}
