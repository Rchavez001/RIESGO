import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SectionHeader } from '../components/CyberBushido'
import { DoggoNote } from '../components/DojoCompanion'
import { useAuth } from '../contexts/AuthContext'
import { learningCall, learningDojos, LearningOverview } from '../services/learning'
import { Alert, supabase } from '../lib/supabase'

export function DashboardScreen() {
  const { userProfile, user } = useAuth()
  const [overview, setOverview] = useState<LearningOverview[] | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [error, setError] = useState('')
  const [alertError, setAlertError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setError(''); setOverview(null); setAlertError('')
    learningCall<LearningOverview[]>('learning_overview').then(data => { if (active) setOverview(data) }).catch(() => { if (active) setError('No pudimos recuperar tu progreso. Puedes volver a intentarlo; lo guardado en tu cuenta se conserva.') })
    void supabase.from('alerts').select('*').eq('active',true).order('published_at',{ascending:false}).limit(3).then(({data,error}) => {
      if (!active) return
      if (error) setAlertError('No pudimos consultar las alertas en este momento.')
      else setAlerts((data || []) as Alert[])
    })
    return () => { active = false }
  }, [user, reload])
  const next = overview?.find(d => d.unlocked && !d.passed) || overview?.filter(d => d.unlocked).slice(-1)[0]
  const dojo = learningDojos.find(d => d.id === next?.id)
  return <div className="learning-page">
    <SectionHeader eyebrow={`BIENVENIDO, ${userProfile?.full_name || 'A TU DOJO'}`} title="Hoy entrenas para la vida real." kanji="道" />
    {error && <div role="alert"><p>{error}</p><button className="cinema-button" onClick={() => setReload(n=>n+1)}>Recuperar mi progreso</button></div>}
    {!overview && !error && <p role="status">Recuperando tu última práctica…</p>}
    {dojo && next && <section className="dashboard-current"><div><span className="cinema-eyebrow">CINTURÓN {dojo.belt.toUpperCase()} · A TU RITMO</span><h2>{dojo.title}</h2><p>{next.answered} de 30 preguntas respondidas. {next.answered === 30 ? 'Tu kata está listo: cinco casos para poner en práctica lo aprendido.' : 'Tu última pregunta te está esperando.'}</p><Link className="cinema-button" to={next.answered === 30 && !next.passed ? `/kata/${dojo.exam_code}` : `/dojo/${dojo.id}`}>{next.answered === 30 && !next.passed ? 'Presentar mi kata' : next.answered ? 'Continuar mi entrenamiento' : 'Comenzar mi entrenamiento'} ↗</Link></div><img src="/cinematic/sensei.jpg" alt="Sensei Ren, tu guía en el dojo" /></section>}
    <DoggoNote>¡Pausa, revisa y sigue con confianza! No tienes que saberlo todo hoy. Aprende una decisión útil y llévala a tu vida diaria.</DoggoNote>
    {overview && <div className="dashboard-metrics"><article><strong>{overview.reduce((sum,d)=>sum+d.answered,0)}</strong><span>Preguntas practicadas</span></article><article><strong>{overview.filter(d=>d.passed).length}</strong><span>Katas aprobados</span></article><article><strong>{userProfile?.total_points ?? 0}</strong><span>Puntos de aprendizaje</span></article></div>}
    <div className="dashboard-tools">{[
      ['/dojos','Mi camino de cinturones','Siete etapas de aprendizaje y casos de la vida diaria.'],
      ['/sensei','Pregunta al sensei','Aclara una duda con palabras sencillas.'],
      ['/escaner','Revisa tu seguridad','Conoce qué puede comprobar tu navegador.'],
      ['/personajes','Aliados y adversarios','Elige a tu compañero y conoce las amenazas.'],
      ['/ranking','Tabla de honor','Consulta el progreso de la comunidad.'],
      ['/perfil','Mi perfil','Tu cinturón, tus puntos y tu compañero.'],
    ].map(([to,title,copy])=><Link key={to} to={to}><strong>{title} ↗</strong><p>{copy}</p></Link>)}</div>
    <section className="dashboard-alerts glass-panel"><h2>Para tener presente</h2>{alertError && <p role="status">{alertError}</p>}{!alertError && !alerts.length && <p>Si hay alertas disponibles, aparecerán aquí.</p>}{alerts.map(a=><article key={a.id}><time dateTime={a.published_at}>{new Date(a.published_at).toLocaleDateString('es-EC')}</time><h3>{a.title}</h3><p>{a.description}</p>{a.source_url && /^https?:\/\//.test(a.source_url) && <a className="cinema-text-link" href={a.source_url} target="_blank" rel="noreferrer">Consultar fuente ↗</a>}</article>)}</section>
  </div>
}
